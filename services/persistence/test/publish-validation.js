'use strict';
const mqtt = require('mqtt');
const client = mqtt.connect(process.env.MQTT_URL || 'mqtt://localhost:1883', { clientId: `acsm-main-persistence-validation-${Date.now()}` });
const messages = [
  ['cps1/test/data',{messageId:'test-telemetry-redelivery',environmentId:'acsm-main',origin:'acsm-main-test',cpsId:'CPS-001',temperature:201.5,pieceCounter:42,cycleTimeMs:1800,ts:1789990000000}],
  ['cps1/test/data',{messageId:'test-telemetry-redelivery',environmentId:'acsm-main',origin:'acsm-main-test',cpsId:'CPS-001',temperature:201.5,pieceCounter:42,cycleTimeMs:1800,ts:1789990000000}],
  ['cps1/test/data',{messageId:'test-telemetry-legitimate',environmentId:'acsm-main',origin:'acsm-main-test',cpsId:'CPS-001',temperature:201.5,pieceCounter:42,cycleTimeMs:1800,ts:1789990001000}],
  ['acsm1/test/intelligence',{messageId:'test-system-analytics',environmentId:'acsm-main',origin:'acsm-main-test',contributingCps:[{cpsId:'CPS-001'},{cpsId:'CPS-005'},{cpsId:'CPS-007'}],oee:0.81,availability:0.9,performance:0.92,quality:0.98,ts:1789990002000}],
  ['cps1/test/log',{messageId:'test-operational-log',environmentId:'acsm-main',origin:'acsm-main-test',cpsId:'CPS-001',level:'info',event:'validation',ts:1789990003000}],
  ['acsm/test/maintenance',{messageId:'test-maint-open',environmentId:'acsm-main',origin:'acsm-main-test',maintenanceId:'maint-test-001',cpsId:'CPS-001',maintenanceState:'open',reason:'persistence validation',episodeId:'episode-test-001',ts:1789990004000}],
  ['acsm/test/maintenance',{messageId:'test-maint-update',environmentId:'acsm-main',origin:'acsm-main-test',maintenanceId:'maint-test-001',cpsId:'CPS-001',maintenanceState:'in_progress',description:'database-only simulated validation',responsible:'test-runner',episodeId:'episode-test-001',ts:1789990005000}],
  ['acsm/test/maintenance',{messageId:'test-maint-close',environmentId:'acsm-main',origin:'acsm-main-test',maintenanceId:'maint-test-001',cpsId:'CPS-001',maintenanceState:'completed',result:'persistence validated',episodeId:'episode-test-001',ts:1789990006000}],
  ['acsm1/test/intelligence',{messageId:'test-lai-rejected',environmentId:'acsm-main',origin:'cps-lai-01',cpsId:'CPS-LAI-01',oee:0.99,ts:1789990007000}],
];
client.on('connect', async()=>{for(const [topic,payload] of messages) await new Promise((resolve,reject)=>client.publish(topic,JSON.stringify(payload),{qos:1},error=>error?reject(error):resolve()));client.end(false,()=>process.exit(0));});
client.on('error',(error)=>{console.error(error.message);process.exit(1);});
