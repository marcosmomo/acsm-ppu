import { getManagedCpsIdsForAcsm, normalizeCpsId } from './config.js';

export const DEFAULT_MINIMUM_HISTORY = 6;

const MANAGED_CPS = new Set(getManagedCpsIdsForAcsm('acsm1'));
const asArray = (value) => Array.isArray(value) ? value : [];

const finite = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const validRatio = (value) => {
  const number = finite(value);
  return number !== null && number >= 0 && number <= 1 ? number : null;
};

const firstPresent = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== '');

const getCpsId = (cps = {}) => normalizeCpsId(firstPresent(
  cps.cpsId,
  cps.id,
  cps.cps?.cpsId,
  cps.lifecycle?.cpsId,
  cps.topic,
  cps.baseTopic
));

const normalizePhase = (cps = {}) => String(firstPresent(
  cps.lifecyclePhase,
  cps.lifecycle?.phase,
  cps.lifecycle?.currentPhase,
  cps.currentPhase
) || '').trim().toLowerCase();

const normalizeStatus = (cps = {}) => String(firstPresent(
  cps.operationalState,
  cps.operationMode,
  cps.globalState?.state,
  cps.globalState?.status,
  cps.operationalData?.operationMode,
  cps.status
) || '').trim().toLowerCase();

const getOee = (cps = {}) => {
  const source = cps.oee && typeof cps.oee === 'object' ? cps.oee : {};
  const availability = validRatio(source.availability);
  const performance = validRatio(source.performance);
  const quality = validRatio(source.quality);
  const direct = validRatio(source.oee ?? source.value ?? source.current);
  const current = direct ?? (
    availability !== null && performance !== null && quality !== null
      ? Number((availability * performance * quality).toFixed(4))
      : null
  );

  return current === null ? null : { current, availability, performance, quality };
};

const meanNullable = (values) => {
  const valid = values.filter((value) => value !== null);
  return valid.length
    ? Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(4))
    : null;
};

const dominantLoss = (oee) => {
  const dimensions = [
    ['AVAILABILITY', oee.availability],
    ['PERFORMANCE', oee.performance],
    ['QUALITY', oee.quality],
  ].filter(([, value]) => value !== null);
  if (!dimensions.length) return null;
  dimensions.sort((left, right) => left[1] - right[1]);
  return dimensions[0][0];
};

const normalizeHealth = (cps = {}) => {
  const health = cps.health && typeof cps.health === 'object' ? cps.health : {};
  const label = String(firstPresent(
    health.label,
    health.healthLabel,
    health.state,
    cps.healthLabel
  ) || '').trim().toLowerCase();
  const score = finite(firstPresent(health.score, health.healthScore, cps.healthScore));

  if (['healthy', 'ok', 'good'].includes(label)) return { state: 'HEALTHY', score };
  if (['warning', 'degraded', 'attention'].includes(label)) return { state: 'WARNING', score };
  if (['critical', 'failure', 'failed'].includes(label)) return { state: 'CRITICAL', score };
  if (score === null) return { state: 'UNKNOWN', score: null };

  const normalizedScore = score <= 1 ? score * 100 : score;
  if (normalizedScore >= 80) return { state: 'HEALTHY', score };
  if (normalizedScore >= 50) return { state: 'WARNING', score };
  return { state: 'CRITICAL', score };
};

const worstHealth = (states) => {
  const rank = { UNKNOWN: 0, HEALTHY: 1, WARNING: 2, CRITICAL: 3 };
  return states.reduce(
    (worst, state) => rank[state] > rank[worst] ? state : worst,
    'UNKNOWN'
  );
};

export function buildPlayState(snapshot = {}) {
  const allCps = asArray(snapshot.cps)
    .map((cps) => ({ cps, cpsId: getCpsId(cps) }))
    .filter(({ cpsId }) => MANAGED_CPS.has(cpsId));
  // Stop is an operational state inside Play, so a stopped CPS remains active
  // while its lifecycle phase is still `play`.
  const active = allCps.filter(({ cps }) => normalizePhase(cps) === 'play');
  const measured = active
    .map((entry) => ({ ...entry, oee: getOee(entry.cps) }))
    .filter(({ oee }) => oee !== null);
  const analytics = snapshot.analytics && typeof snapshot.analytics === 'object'
    ? snapshot.analytics
    : {};

  const globalOEE = measured.length
    ? {
        current: meanNullable(measured.map(({ oee }) => oee.current)),
        availability: meanNullable(measured.map(({ oee }) => oee.availability)),
        performance: meanNullable(measured.map(({ oee }) => oee.performance)),
        quality: meanNullable(measured.map(({ oee }) => oee.quality)),
        evidenceStatus: measured.length === active.length ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
      }
    : {
        current: null,
        availability: null,
        performance: null,
        quality: null,
        evidenceStatus: 'NO_DATA',
      };

  const healthEvidence = active
    .map(({ cps }) => normalizeHealth(cps))
    .filter(({ state, score }) => state !== 'UNKNOWN' || score !== null);
  const systemHealth = healthEvidence.length
    ? {
        state: worstHealth(healthEvidence.map(({ state }) => state)),
        score: meanNullable(healthEvidence.map(({ score }) => score)),
      }
    : { state: 'UNKNOWN', score: null };

  const ranked = [...measured].sort((left, right) => left.oee.current - right.oee.current);
  const critical = ranked[0] || null;
  const criticalCPS = critical
    ? {
        cpsId: critical.cpsId,
        oee: critical.oee.current,
        reason: dominantLoss(critical.oee),
      }
    : null;

  const statuses = active.map(({ cps }) => normalizeStatus(cps));
  let systemState = 'UNKNOWN';
  if (statuses.some((status) => [
    'failure', 'failed', 'critical', 'degraded', 'warning', 'maintenance',
  ].includes(status)) || ['WARNING', 'CRITICAL'].includes(systemHealth.state)) {
    systemState = 'DEGRADED';
  } else if (statuses.length && statuses.every((status) => [
    'stopped', 'stop', 'idle', 'ready', 'paused',
  ].includes(status))) {
    systemState = 'STOPPED';
  } else if (statuses.some((status) => ['running', 'active', 'play', 'playing'].includes(status))) {
    systemState = 'RUNNING';
  }

  const historySize = Math.max(0, finite(firstPresent(
    snapshot.historySize,
    analytics.historySummary?.samples,
    analytics.learning?.historySize,
    analytics.systemLearningModel?.historySize
  )) ?? 0);
  const minimumHistory = Math.max(1, finite(snapshot.minimumHistory) ?? DEFAULT_MINIMUM_HISTORY);
  const learningState = globalOEE.evidenceStatus === 'NO_DATA'
    ? 'NO_DATA'
    : historySize < minimumHistory ? 'INSUFFICIENT_HISTORY' : 'READY';
  const pattern = learningState === 'READY'
    ? firstPresent(
        analytics.learningPattern,
        analytics.systemLearningModel?.pattern,
        analytics.systemLearningModel?.learningPattern,
        analytics.learning?.pattern
      ) ?? null
    : null;
  const learning = {
    state: learningState,
    pattern,
    historySize,
    minimumHistory,
  };

  const existingLoss = firstPresent(
    analytics.reasoning?.dominantLoss,
    analytics.systemReasoning?.dominantLoss,
    analytics.dominantChronicLoss
  );
  const loss = existingLoss ? String(existingLoss).toUpperCase() : critical?.oee
    ? dominantLoss(critical.oee)
    : null;
  const confidence = finite(firstPresent(
    analytics.reasoning?.confidence,
    analytics.systemReasoning?.confidence,
    analytics.confidence
  ));
  const reasoning = loss && criticalCPS
    ? {
        state: 'AVAILABLE',
        dominantLoss: loss,
        criticalCPS: criticalCPS.cpsId,
        confidence,
      }
    : {
        state: 'INSUFFICIENT_DATA',
        dominantLoss: null,
        criticalCPS: null,
        confidence: null,
      };

  const predicted = learningState === 'READY'
    ? validRatio(firstPresent(
        analytics.predictedSystemOEE,
        analytics.systemForecast?.predictedSystemOEE,
        analytics.predictedGlobalOEE,
        analytics.prediction?.predictedSystemOEE
      ))
    : null;
  const prediction = {
    state: predicted === null ? 'INSUFFICIENT_HISTORY' : 'AVAILABLE',
    predictedSystemOEE: predicted,
  };

  const recommendationSource = snapshot.recommendation && typeof snapshot.recommendation === 'object'
    ? snapshot.recommendation
    : {};
  const recommendationText = firstPresent(
    recommendationSource.recommendation,
    analytics.reasoning?.recommendation,
    analytics.systemReasoning?.recommendation,
    analytics.recommendation
  );
  const governableAction = firstPresent(
    recommendationSource.governableAction,
    analytics.reasoning?.governableAction,
    analytics.systemReasoning?.governableAction,
    analytics.actionPlan?.governableAction
  );
  const recommendationCpsId = normalizeCpsId(firstPresent(
    recommendationSource.cpsId,
    criticalCPS?.cpsId
  ));
  const recommendation = recommendationText && reasoning.state === 'AVAILABLE'
    ? {
        state: 'AVAILABLE',
        recommendation: recommendationText,
        governableAction: governableAction ?? null,
        cpsId: MANAGED_CPS.has(recommendationCpsId) ? recommendationCpsId : criticalCPS?.cpsId ?? null,
        confidence: finite(firstPresent(recommendationSource.confidence, confidence)),
      }
    : {
        state: 'NO_RECOMMENDATION',
        recommendation: null,
        governableAction: null,
        cpsId: null,
        confidence: null,
      };

  const interpretationText = firstPresent(
    snapshot.interpretation?.text,
    snapshot.interpretation?.summary,
    analytics.interpretation?.text,
    analytics.interpretation?.summary,
    analytics.reasoning?.executiveInterpretation,
    analytics.systemReasoning?.executiveInterpretation,
    analytics.explanation
  );
  let interpretation;
  if (globalOEE.evidenceStatus === 'NO_DATA') {
    interpretation = { state: 'NO_EVIDENCE', text: null };
  } else if (learningState !== 'READY') {
    interpretation = { state: 'INSUFFICIENT_HISTORY', text: null };
  } else if (interpretationText) {
    interpretation = { state: 'AVAILABLE', text: interpretationText };
  } else {
    interpretation = { state: 'NO_EVIDENCE', text: null };
  }

  return {
    acsmId: 'acsm1',
    phase: 'play',
    type: 'phase-service-facade',
    timestamp: new Date().toISOString(),
    activeCPS: {
      count: active.length,
      items: active.map(({ cpsId }) => cpsId),
    },
    globalOEE,
    systemHealth,
    criticalCPS,
    systemState,
    learning,
    reasoning,
    prediction,
    recommendation,
    interpretation,
  };
}
