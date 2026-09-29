'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const mqtt = require('mqtt');
const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');
const PendingQueue = require('./pendingQueue');
const { messageId } = require('./identity');
const { scopeOf, cpsIdOf, kindOf, sourceTime, flattenNumbers, validateMainOrigin } = require('./classify');

const cfg = { mqtt: process.env.MQTT_URL || 'mqtt://acsm-mosquitto:1883', mysql: process.env.MYSQL_URL, mongo: process.env.MONGO_URL, mongoDb: process.env.MONGO_DATABASE || 'acsm_main_documents', port: Number(process.env.HTTP_PORT || 3010), pendingFile: process.env.PERSISTENCE_PENDING_FILE || '/app/data/pending.jsonl' };
let sql; let mongo; let ready = false;
const ingestion = { accepted: 0, rejected: 0, rejectedByReason: {} };
const queue = new PendingQueue(cfg.pendingFile, Number(process.env.PERSISTENCE_MAX_PENDING || 10000), Number(process.env.PERSISTENCE_MAX_ATTEMPTS || 12));
const plugCpsIds = new Map([['cps1','cps1'],['cps001','cps1'],['cps5','cps5'],['cps005','cps5'],['cps7','cps7'],['cps007','cps7']]);
function plugCpsId(value){return plugCpsIds.get(String(value||'').toLowerCase().replace(/[^a-z0-9]/g,''))||null;}
function plugEntry(value={}){const now=Date.now(),ts=Number(value.ts)||Date.parse(value.isoDate||'')||now,cpsId=plugCpsId(value.cpsId||value.details?.lifecycleCpsId||value.topic||value.details?.lifecycleBaseTopic);if(!cpsId)throw new Error('plug_event_cps_not_allowed');const base={phase:value.phase||'plug',eventType:value.eventType||value.type||'lifecycle_event',cpsId,cpsName:value.cpsName||value.details?.lifecycleCpsName||cpsId,topic:cpsId,message:value.message||'Lifecycle event recorded.',details:value.details||{},ts,isoDate:new Date(ts).toISOString()};const id=value.id||`plug-${crypto.createHash('sha256').update(JSON.stringify(base)).digest('hex').slice(0,32)}`;return{id:String(id),...base};}
async function readBody(req){let body='';for await(const chunk of req)body+=chunk;return JSON.parse(body||'{}');}
async function readPlugLog(){const documents=await mongo.db(cfg.mongoDb).collection('operational_events').find({eventType:'plug_log',cpsId:{$in:['cps1','cps5','cps7']}}).sort({sourceTime:1,_id:1}).toArray();return{generatedAt:new Date().toISOString(),source:{current:'mongodb:operational_events',historical:'data/plug-phase-log.json',acsmId:'acsm1',managedCpsIds:['cps1','cps5','cps7']},events:documents.map(item=>item.payload)};}
async function writePlugLog(value){const entry=plugEntry(value),messageId=`plug:${entry.id}`,result=await mongo.db(cfg.mongoDb).collection('operational_events').updateOne({messageId},{$setOnInsert:{messageId,eventType:'plug_log',topic:entry.topic,cpsId:entry.cpsId,scope:'acsm_system',sourceTime:new Date(entry.ts),receivedAt:new Date(),origin:'acsm-main',payload:entry}},{upsert:true});return{ok:true,deduplicated:result.upsertedCount===0,event:entry,log:await readPlugLog()};}

async function connectStores() {
  sql = mysql.createPool({ uri: cfg.mysql, connectionLimit: 5, enableKeepAlive: true });
  mongo = new MongoClient(cfg.mongo, { maxPoolSize: 10 }); await mongo.connect();
  await sql.query(`CREATE TABLE IF NOT EXISTS telemetry_messages (message_id VARCHAR(128) PRIMARY KEY,cps_id VARCHAR(32) NOT NULL,topic VARCHAR(255) NOT NULL,source_time DATETIME(3) NOT NULL,received_time DATETIME(3) NOT NULL,payload JSON NOT NULL,KEY ix_messages_cps_period(cps_id,source_time)) ENGINE=InnoDB`);
  await sql.query(`CREATE TABLE IF NOT EXISTS telemetry_measurements (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,message_id VARCHAR(128) NOT NULL,cps_id VARCHAR(32) NOT NULL,topic VARCHAR(255) NOT NULL,metric VARCHAR(160) NOT NULL,value DOUBLE NOT NULL,unit VARCHAR(32),origin VARCHAR(80),quality VARCHAR(32),source_time DATETIME(3) NOT NULL,received_time DATETIME(3) NOT NULL,UNIQUE KEY uq_message_metric(message_id,metric),KEY ix_cps_period(cps_id,source_time),KEY ix_metric_period(metric,source_time)) ENGINE=InnoDB`);
  const db = mongo.db(cfg.mongoDb);
  await Promise.all([
    db.collection('operational_events').createIndex({messageId:1},{unique:true}), db.collection('operational_events').createIndex({cpsId:1,sourceTime:-1}), db.collection('operational_events').createIndex({eventType:1,cpsId:1,sourceTime:1}),
    db.collection('analytics_results').createIndex({messageId:1},{unique:true}), db.collection('analytics_results').createIndex({scope:1,cpsId:1,sourceTime:-1}),
    db.collection('maintenance_records').createIndex({maintenanceId:1},{unique:true}), db.collection('maintenance_records').createIndex({cpsId:1,state:1,openedAt:-1}),
    db.collection('hcm_episodes').createIndex({episodeId:1},{unique:true}), db.collection('hcm_episodes').createIndex({targetCps:1,status:1,startedAt:-1}),
    db.collection('hcm_knowledge').createIndex({knowledgeId:1},{unique:true}), db.collection('hcm_knowledge').createIndex({contentSignature:1},{unique:true,sparse:true})
  ]); ready = true;
}

async function persist(e) {
  const {topic,payload,receivedAt}=e; const kind=kindOf(topic), cpsId=cpsIdOf(topic,payload), scope=scopeOf(topic), source=sourceTime(payload);
  if (kind === 'telemetry' || /\/oee$/i.test(topic)) {
    if (!cpsId) throw new Error('Telemetry without CPS identifier');
    await sql.query('INSERT IGNORE INTO telemetry_messages VALUES (?,?,?,?,?,?)',[e.messageId,cpsId,topic,source,receivedAt,JSON.stringify(payload)]);
    for (const m of flattenNumbers(payload.operationalData || payload)) await sql.query('INSERT IGNORE INTO telemetry_measurements(message_id,cps_id,topic,metric,value,unit,origin,quality,source_time,received_time) VALUES(?,?,?,?,?,?,?,?,?,?)',[e.messageId,cpsId,topic,m.name,m.value,payload.units?.[m.name]||null,payload.origin||'simulation',payload.quality||null,source,receivedAt]);
    if (kind === 'telemetry') return;
  }
  const db=mongo.db(cfg.mongoDb); const base={messageId:e.messageId,topic,cpsId,scope,sourceTime:source,receivedAt,origin:payload.origin||'simulation',payload};
  const collection=kind==='analytics'?'analytics_results':'operational_events';
  await db.collection(collection).updateOne({messageId:e.messageId},{$setOnInsert:{...base,eventType:kind,episodeId:payload.episodeId||null}},{upsert:true});
  const state=String(payload.status||payload.state||payload.operationMode||'').toLowerCase();
  if(/\/maintenance$/i.test(topic)&&cpsId&&payload.maintenanceId) {
    const maintenanceState=String(payload.maintenanceState||payload.state||'updated').toLowerCase();
    const set={state:maintenanceState,updatedAt:source};
    for(const field of ['type','reason','description','responsible','result','episodeId','commandId']) if(payload[field]!==undefined) set[field]=payload[field];
    if(['closed','completed','cancelled'].includes(maintenanceState)) set.closedAt=source;
    await db.collection('maintenance_records').updateOne({maintenanceId:String(payload.maintenanceId)},{$set:set,$setOnInsert:{maintenanceId:String(payload.maintenanceId),cpsId,origin:payload.origin||'simulation',openedAt:source},$addToSet:{history:{state:maintenanceState,at:source,sourceEventId:e.messageId,details:payload.details||null}}},{upsert:true});
  }
  if(kind==='event'&&cpsId&&state==='maintenance') {
    const current=await db.collection('maintenance_records').findOne({cpsId,state:{$in:['open','in_progress']}});
    const maintenanceId=payload.maintenanceId||current?.maintenanceId||`maintenance:${cpsId}:${e.messageId}`;
    await db.collection('maintenance_records').updateOne({maintenanceId},{
      $setOnInsert:{maintenanceId,cpsId,state:'open',type:payload.maintenanceType||null,reason:payload.reason||null,description:null,responsible:null,result:null,episodeId:payload.episodeId||null,origin:'simulation',openedAt:source},
      $addToSet:{history:{state:'open',at:source,sourceEventId:e.messageId}}
    },{upsert:true});
  } else if(kind==='event'&&cpsId&&state&&state!=='maintenance') {
    const current=await db.collection('maintenance_records').findOne({cpsId,state:{$in:['open','in_progress']}});
    if(current) await db.collection('maintenance_records').updateOne({maintenanceId:current.maintenanceId},{$addToSet:{history:{state:'returned_to_operation',at:source,sourceEventId:e.messageId}}});
  }
}
async function accept(topic,raw) { let payload; try{payload=JSON.parse(raw.toString());}catch(_){payload={raw:raw.toString(),parseError:true};} const validation=validateMainOrigin(topic,payload); if(!validation.accepted){ingestion.rejected+=1;ingestion.rejectedByReason[validation.reason]=(ingestion.rejectedByReason[validation.reason]||0)+1;console.warn('[ISOLATION_REJECTED]',topic,validation.reason);return;} ingestion.accepted+=1; const e={topic,payload,receivedAt:new Date(),messageId:messageId(topic,payload)}; try{await persist(e);}catch(error){const result=queue.push(e,error);console.error(result.status==='dead_letter'?'[DEAD_LETTER]':'[PENDING]',e.messageId,error.message);} }
async function retry(){for(const item of queue.due()){try{await persist({...item,receivedAt:new Date(item.receivedAt)});queue.remove(item.messageId);}catch(error){queue.push(item,error);}}}
function respond(res,status,body){res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));}
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/health')return respond(res,ready?200:503,{ready,queue:queue.stats(),ingestion});if(req.method==='GET'&&url.pathname==='/api/plug-log')return respond(res,200,await readPlugLog());if(req.method==='POST'&&url.pathname==='/api/plug-log')return respond(res,200,await writePlugLog(await readBody(req)));if(req.method==='POST'&&url.pathname==='/api/pending/reprocess')return respond(res,202,queue.requeueFailures(Math.min(1000,Math.max(1,Number(url.searchParams.get('limit')||100)))));if(req.method==='GET'&&url.pathname.startsWith('/api/history/')){const level=url.pathname.split('/').pop(),limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit')||25))),scope=level==='level1'?'cps_local':'acsm_system';const records=await mongo.db(cfg.mongoDb).collection('analytics_results').find({scope}).sort({sourceTime:-1}).limit(limit).toArray();return respond(res,200,{ok:true,level,count:records.length,records});}if(req.method==='GET'&&url.pathname==='/api/hcm/snapshot'){const db=mongo.db(cfg.mongoDb),meta=await db.collection('hcm_meta').findOne({_id:'primary'});if(!meta)return respond(res,404,{error:'hcm_not_initialized'});if(meta.state==='updating')return respond(res,503,{error:'hcm_sync_incomplete',revision:meta.revision});const filter=meta.dataRevision?{_syncRevision:meta.dataRevision}:{};const [episodes,events,decisions,effectiveness,knowledgeItems]=await Promise.all(['hcm_episodes','hcm_events','hcm_decisions','hcm_effectiveness','hcm_knowledge'].map(name=>db.collection(name).find(filter).toArray()));for(const list of [episodes,events,decisions,effectiveness,knowledgeItems])for(const item of list){delete item._id;delete item._syncRevision;}return respond(res,200,{ok:true,source:'mongodb',revision:meta.revision,store:{episodes,events,decisions,effectiveness,knowledgeItems}});}if(req.method==='POST'&&url.pathname==='/api/hcm/snapshot'){let body='';for await(const chunk of req)body+=chunk;const store=JSON.parse(body||'{}'),db=mongo.db(cfg.mongoDb),revision=new Date().toISOString();await db.collection('hcm_meta').updateOne({_id:'primary'},{$set:{state:'updating',revision}},{upsert:true});for(const item of store.episodes||[])await db.collection('hcm_episodes').updateOne({episodeId:item.episodeId},{$set:{...item,_syncRevision:revision}},{upsert:true});for(const item of store.knowledgeItems||[])await db.collection('hcm_knowledge').updateOne({knowledgeId:item.knowledgeId},{$set:{...item,_syncRevision:revision}},{upsert:true});for(const [field,name,key]of[['events','hcm_events','eventId'],['decisions','hcm_decisions','decisionId'],['effectiveness','hcm_effectiveness','effectivenessId']])for(const item of store[field]||[])await db.collection(name).updateOne({[key]:item[key]},{$set:{...item,_syncRevision:revision}},{upsert:true});for(const name of ['hcm_episodes','hcm_events','hcm_decisions','hcm_effectiveness','hcm_knowledge'])await db.collection(name).deleteMany({_syncRevision:{$ne:revision}});await db.collection('hcm_meta').replaceOne({_id:'primary'},{_id:'primary',state:'ready',revision,dataRevision:revision,counts:{episodes:(store.episodes||[]).length,events:(store.events||[]).length,decisions:(store.decisions||[]).length,effectiveness:(store.effectiveness||[]).length,knowledgeItems:(store.knowledgeItems||[]).length}},{upsert:true});return respond(res,200,{ok:true,source:'mongodb',revision});}return respond(res,404,{error:'not_found'});}catch(error){respond(res,500,{error:error.message});}});
connectStores().then(()=>{const client=mqtt.connect(cfg.mqtt,{clientId:'acsm-main-persistence',clean:false,reconnectPeriod:2000});let ingestionChain=Promise.resolve();client.on('connect',()=>client.subscribe(['cps1/#','cps5/#','cps7/#','acsm/#','acsm1/#'],{qos:1}));client.on('message',(topic,message)=>{ingestionChain=ingestionChain.then(()=>accept(topic,message)).catch(error=>console.error('[INGESTION_CHAIN]',error.message));});client.on('error',e=>console.error('[MQTT]',e.message));setInterval(retry,5000).unref();server.listen(cfg.port,()=>console.log(`[READY] persistence API :${cfg.port}`));}).catch(error=>{console.error('[STARTUP]',error.message);setTimeout(()=>process.exit(1),5000);});
