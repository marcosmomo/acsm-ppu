'use strict';
const fs = require('node:fs');
const path = require('node:path');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run') || !args.has('--apply');
const root = process.env.ACSM_MAIN_ROOT || path.resolve(__dirname, '../../..');
const mongoUrl = process.env.MONGO_URL;
const database = process.env.MONGO_DATABASE || 'acsm_main_documents';
const report = { mode: dryRun ? 'dry-run' : 'apply', scanned: 0, compatible: 0, inserted: 0, updated: 0, incompatible: [], sources: [] };
const plugCpsIds = new Map([['cps1','cps1'],['cps001','cps1'],['cps5','cps5'],['cps005','cps5'],['cps7','cps7'],['cps007','cps7']]);
const normalizePlugCpsId = (value) => plugCpsIds.get(String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')) || null;

function readJson(relative) {
  const file = path.join(root, relative); if (!fs.existsSync(file)) return null;
  try { const value = JSON.parse(fs.readFileSync(file, 'utf8')); report.sources.push({ file: relative, retained: true }); return value; }
  catch (error) { report.incompatible.push({ file: relative, error: error.message }); return null; }
}
async function upsertAll(collection, items, key, client) {
  for (const item of items || []) {
    report.scanned += 1; if (!item || !item[key]) { report.incompatible.push({ collection, key, record: item }); continue; }
    report.compatible += 1; if (dryRun) continue;
    const result = await client.db(database).collection(collection).updateOne({ [key]: item[key] }, { $set: item }, { upsert: true });
    report.inserted += result.upsertedCount; report.updated += result.modifiedCount;
  }
}
async function main() {
  const hcm = readJson('data/hcm-store.json') || {};
  if (!dryRun && !mongoUrl) throw new Error('MONGO_URL is required with --apply');
  const MongoClient = dryRun ? null : require('mongodb').MongoClient;
  const client = dryRun ? null : new MongoClient(mongoUrl); if (client) await client.connect();
  try {
    await upsertAll('hcm_episodes', hcm.episodes, 'episodeId', client);
    await upsertAll('hcm_events', hcm.events, 'eventId', client);
    await upsertAll('hcm_decisions', hcm.decisions, 'decisionId', client);
    await upsertAll('hcm_effectiveness', hcm.effectiveness, 'effectivenessId', client);
    await upsertAll('hcm_knowledge', hcm.knowledgeItems, 'knowledgeId', client);
    if (!dryRun && Object.keys(hcm).length) await client.db(database).collection('hcm_meta').replaceOne({ _id: 'primary' }, { _id: 'primary', state: 'ready', revision: new Date().toISOString(), dataRevision: null, counts: { episodes: (hcm.episodes || []).length, events: (hcm.events || []).length, decisions: (hcm.decisions || []).length, effectiveness: (hcm.effectiveness || []).length, knowledgeItems: (hcm.knowledgeItems || []).length } }, { upsert: true });
    const plugLog=readJson('data/plug-phase-log.json')||{};
    for(const item of plugLog.events||[]){report.scanned+=1;const cpsId=normalizePlugCpsId(item?.cpsId||item?.details?.lifecycleCpsId||item?.topic||item?.details?.lifecycleBaseTopic);if(!cpsId||!item?.id){report.incompatible.push({collection:'operational_events',reason:!cpsId?'plug_event_not_acsm_main':'missing_id',recordId:item?.id||null});continue;}report.compatible+=1;if(dryRun)continue;const ts=Number(item.ts)||Date.parse(item.isoDate||'')||Date.now(),entry={...item,cpsId,topic:cpsId,ts,isoDate:new Date(ts).toISOString()};const result=await client.db(database).collection('operational_events').updateOne({messageId:`plug:${item.id}`},{$setOnInsert:{messageId:`plug:${item.id}`,eventType:'plug_log',topic:cpsId,cpsId,scope:'acsm_system',sourceTime:new Date(ts),receivedAt:new Date(),origin:'acsm-main-file-migration',payload:entry}},{upsert:true});report.inserted+=result.upsertedCount;report.updated+=result.modifiedCount;}
    for (const relative of ['data/governance-store.json']) {
      const doc=readJson(relative); if (!doc) continue; report.scanned += 1; report.compatible += 1;
      if (!dryRun) { const id=path.basename(relative,'.json'); const result=await client.db(database).collection('legacy_imports').updateOne({migrationId:id},{$setOnInsert:{migrationId:id,source:relative,origin:'acsm-main-file',document:doc,migratedAt:new Date()}},{upsert:true}); report.inserted+=result.upsertedCount; report.updated+=result.modifiedCount; }
    }
  } finally { if (client) await client.close(); }
  process.stdout.write(`${JSON.stringify(report,null,2)}\n`); if (report.incompatible.length) process.exitCode=2;
}
main().catch((error)=>{console.error(JSON.stringify({ ...report, fatal: error.message },null,2));process.exitCode=1;});
