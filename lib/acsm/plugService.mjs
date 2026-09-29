import {
  getManagedCpsIdsForAcsm,
  normalizeCpsId,
  resolveCpsDisplayName,
} from './config.js';

const MANAGED_CPS = new Set(getManagedCpsIdsForAcsm('acsm1'));
const FORBIDDEN_LAI_INTEGRATION = /cpslai|opc\s*ua|opcua|node\s*id|nodeid|\bplc\b|node-red\s*lai/i;

const asArray = (value) => Array.isArray(value) ? value : [];
const firstPresent = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== '');

const normalizeLabel = (value) =>
  String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();

const splitList = (value) => {
  const values = Array.isArray(value) ? value : String(value || '').split(/[|,;/]+/);
  return [...new Set(values.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))];
};

const containsForbiddenIntegration = (value) => {
  try {
    return FORBIDDEN_LAI_INTEGRATION.test(JSON.stringify(value));
  } catch {
    return true;
  }
};

const getAasMetadata = (asset) => {
  const value = firstPresent(asset?.aas, asset?.aasMetadata, asset?.details?.aasMetadata);
  return value && typeof value === 'object' ? value : {};
};

const aasSearchValues = (asset) => {
  const metadata = getAasMetadata(asset);
  return [
    metadata?.id,
    metadata?.idShort,
    ...asArray(metadata?.submodelRefs),
    ...asArray(metadata?.submodelIdShorts),
    ...asArray(metadata?.elementIdShorts),
    ...asArray(asset?.aas?.submodels).flatMap((reference) => [
      reference?.value,
      ...asArray(reference?.keys).map((key) => key?.value),
    ]),
    ...asArray(asset?.aas?.submodelElements).map((element) => element?.idShort),
  ].map((value) => String(value || '').toLowerCase());
};

const hasAasEvidence = (asset) => {
  const metadata = getAasMetadata(asset);
  return Boolean(
    asset?.aas ||
    metadata?.id ||
    metadata?.idShort ||
    asArray(metadata?.submodelRefs).length ||
    asArray(metadata?.submodelIdShorts).length
  );
};

const hasAasConcept = (asset, concept) => {
  const normalized = String(concept || '').toLowerCase();
  return aasSearchValues(asset).some((value) => value.includes(normalized));
};

const inferProcessCapabilities = (asset) => {
  const explicit = firstPresent(asset?.processCapabilities, asset?.processCapability);
  if (explicit) return splitList(explicit).map(normalizeLabel);

  const source = `${asset?.assetType || ''} ${asArray(asset?.funcionalidades)
    .map((item) => `${item?.nome || ''} ${item?.key || ''} ${item?.descricao || ''}`)
    .join(' ')}`.toLowerCase();

  if (source.includes('weld') || source.includes('sold')) return ['Welding'];
  if (source.includes('vision') || source.includes('inspection') || source.includes('visao')) {
    return ['Visual Inspection'];
  }
  if (source.includes('conveyor') || source.includes('transport')) return ['Transportation'];
  return asset?.assetType ? [normalizeLabel(asset.assetType)] : [];
};

const normalizeCapabilityGroups = (asset, supportedPhases) => {
  if (Array.isArray(asset?.capabilities)) {
    return asset.capabilities
      .map((section) => ({
        group: String(section?.group || '').trim(),
        items: asArray(section?.items)
          .filter((item) => !containsForbiddenIntegration(item))
          .map((item) => String(item).trim())
          .filter(Boolean),
      }))
      .filter((section) => section.group && section.items.length && !containsForbiddenIntegration(section));
  }

  const endpoints = asset?.endpoints && typeof asset.endpoints === 'object' ? asset.endpoints : {};
  const monitoring = new Set();
  if (endpoints.status) monitoring.add('Status');
  if (endpoints.summary || endpoints.indicators || endpoints.data || asset?.operationalData) monitoring.add('Telemetry');
  if (endpoints.health || asset?.health || hasAasConcept(asset, 'statusandhealth')) monitoring.add('Health');
  if (endpoints.oee || asset?.oee || hasAasConcept(asset, 'oee')) monitoring.add('OEE');
  if (endpoints.sensordata) monitoring.add('Sensor Data');

  const cognitive = new Set();
  for (const [concept, label] of [
    ['learning', 'Learning'],
    ['reasoning', 'Reasoning'],
    ['prediction', 'Prediction'],
    ['recommendation', 'Recommendation'],
  ]) {
    if (hasAasConcept(asset, concept) || asset?.cognitive?.[concept]) cognitive.add(label);
  }

  const integration = new Set();
  if (asset?.topic || asset?.baseTopic || asset?.brokerWs || asset?.brokerWss) integration.add('MQTT');
  if (Object.values(endpoints).some(Boolean)) integration.add('REST');
  if (hasAasEvidence(asset)) integration.add('AAS');

  return [
    { group: 'Process', items: inferProcessCapabilities(asset) },
    { group: 'Lifecycle Services', items: supportedPhases.map(normalizeLabel) },
    { group: 'Monitoring', items: [...monitoring] },
    { group: 'Cognitive', items: [...cognitive] },
    { group: 'Integration', items: [...integration] },
  ].filter((section) => section.items.length && !containsForbiddenIntegration(section));
};

const normalizeInterfaces = (asset) => {
  const declared = Array.isArray(asset?.interfaces) ? asset.interfaces : [];
  const interfaces = declared.filter((entry) => !containsForbiddenIntegration(entry));
  const endpoints = asset?.endpoints && typeof asset.endpoints === 'object' ? asset.endpoints : {};

  Object.entries(endpoints).forEach(([name, endpoint]) => {
    if (!endpoint || containsForbiddenIntegration({ name, endpoint })) return;
    interfaces.push({ name, protocol: 'REST', endpoint });
  });

  const topic = firstPresent(asset?.topic, asset?.baseTopic);
  if (topic && !containsForbiddenIntegration(topic)) {
    interfaces.push({ name: 'MQTT', protocol: 'MQTT', topic });
  }

  return interfaces;
};

const normalizeLifecycleEvidence = (asset) => {
  const evidence = asset?.lifecycleEvidence && typeof asset.lifecycleEvidence === 'object'
    ? asset.lifecycleEvidence
    : {};
  const maintenanceCount = Number(evidence.maintenanceCount);

  return {
    maintenanceCount: Number.isFinite(maintenanceCount) && maintenanceCount >= 0
      ? maintenanceCount
      : 0,
    lastEvolutionTimestamp: evidence.lastEvolutionTimestamp ?? null,
    events: asArray(evidence.events),
  };
};

const getAssetCpsId = (asset) => normalizeCpsId(firstPresent(
  asset?.cps?.cpsId,
  asset?.cpsId,
  asset?.id,
  asset?.lifecycle?.cpsId,
  asset?.topic,
  asset?.baseTopic
));

const normalizeAsset = (asset) => {
  const cpsId = getAssetCpsId(asset);
  if (!MANAGED_CPS.has(cpsId)) return null;

  const supportedPhases = splitList(firstPresent(
    asset?.supportedPhases,
    asset?.lifecycle?.supportedPhases,
    asset?.cps?.supportedPhases
  ));
  const profile = asset?.governance && typeof asset.governance === 'object'
    ? asset.governance
    : asset?.governanceProfile || {};

  return {
    cps: {
      cpsId,
      displayName: resolveCpsDisplayName(
        cpsId,
        [asset],
        firstPresent(asset?.cps?.displayName, asset?.displayName, asset?.nome, asset?.assetName)
      ) || null,
      lifecyclePhase: firstPresent(
        asset?.cps?.lifecyclePhase,
        asset?.lifecyclePhase,
        asset?.lifecycle?.currentPhase
      ) ?? null,
    },
    identification: {
      manufacturer: firstPresent(asset?.identification?.manufacturer, asset?.manufacturer, asset?.manufacturerName) ?? null,
      manufacturerName: firstPresent(asset?.identification?.manufacturerName, asset?.manufacturerName) ?? null,
      model: firstPresent(asset?.identification?.model, asset?.model) ?? null,
      modelType: firstPresent(asset?.identification?.modelType, asset?.modelType, asset?.assetType) ?? null,
      serialNumber: firstPresent(asset?.identification?.serialNumber, asset?.serialNumber) ?? null,
      assetName: firstPresent(asset?.identification?.assetName, asset?.assetName, asset?.nome) ?? null,
      displayName: firstPresent(asset?.identification?.displayName, asset?.displayName, asset?.nome) ?? null,
      description: firstPresent(asset?.identification?.description, asset?.description, asset?.descricao) ?? null,
    },
    aas: getAasMetadata(asset),
    capabilities: normalizeCapabilityGroups(asset, supportedPhases),
    interfaces: normalizeInterfaces(asset),
    supportedPhases,
    governance: {
      profileId: profile?.profileId ?? null,
      profileVersion: profile?.profileVersion ?? null,
      status: firstPresent(asset?.governanceStatus, profile?.status) ?? null,
    },
    lifecycleEvidence: normalizeLifecycleEvidence(asset),
  };
};

export function buildPlugState(snapshot = {}) {
  const assets = asArray(snapshot.assets)
    .map(normalizeAsset)
    .filter(Boolean);

  return {
    acsmId: 'acsm1',
    phase: 'plug',
    type: 'phase-service-facade',
    timestamp: new Date().toISOString(),
    evidenceStatus: assets.length ? 'AVAILABLE' : 'NO_DATA',
    summary: {
      registeredCPS: assets.length,
    },
    assets,
  };
}

export { MANAGED_CPS as MANAGED_PLUG_CPS };
