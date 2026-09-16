'use client';

import React, { useMemo, useState } from 'react';
import { useCPSContext } from '../context/CPSContext';
import { getActiveAcsmConfig, normalizeCpsId } from '../lib/acsm/config';
import GovernanceApproval from './GovernanceApproval';

// ===== Status helpers (EN) =====
const normalizeStatus = (status) => String(status || '').toLowerCase();

const DATA_SPACE_URL = 'https://dataspace-v2.vercel.app/';

const humanizeFeatStatus = (status) => {
  const s = normalizeStatus(status);
  if (s === 'failure' || s === 'fail' || s === 'error') return 'Failure';
  if (s === 'maintenance') return 'Maintenance';
  if (s === 'awaiting_replacement' || s === 'waiting') return 'Awaiting replacement';
  if (s === 'active' || s === 'ok' || s === 'running') return 'Active';
  return '—';
};

const mapFeatStatusToBadgeClass = (status) => {
  const s = normalizeStatus(status);
  if (s === 'failure' || s === 'fail' || s === 'error') return 'feat-badge feat-failure';
  if (s === 'maintenance') return 'feat-badge feat-maintenance';
  if (s === 'awaiting_replacement' || s === 'waiting') return 'feat-badge feat-waiting';
  if (s === 'active' || s === 'ok' || s === 'running') return 'feat-badge feat-active';
  return 'feat-badge';
};

// ===== Health helpers =====
const humanizeHealthLabel = (label, score) => {
  const l = String(label || '').toLowerCase();

  if (l === 'healthy') return 'Healthy';
  if (l === 'warning') return 'Attention';
  if (l === 'critical') return 'Critical';
  if (l === 'failure') return 'Failure';
  if (l === 'unknown') return 'Unknown';

  const n = Number(score);
  if (!Number.isFinite(n)) return '—';
  if (n >= 80) return 'Healthy';
  if (n >= 50) return 'Attention';
  if (n >= 20) return 'Critical';
  return 'Failure';
};

const mapHealthBadgeClass = (label, score) => {
  const l = String(label || '').toLowerCase();
  const n = Number(score);

  if (l === 'healthy' || (!l && Number.isFinite(n) && n >= 80)) {
    return 'feat-badge feat-active';
  }
  if (l === 'warning' || (!l && Number.isFinite(n) && n >= 50 && n < 80)) {
    return 'feat-badge feat-maintenance';
  }
  if (l === 'critical' || (!l && Number.isFinite(n) && n >= 20 && n < 50)) {
    return 'feat-badge feat-waiting';
  }
  if (l === 'failure' || (!l && Number.isFinite(n) && n < 20)) {
    return 'feat-badge feat-failure';
  }

  return 'feat-badge';
};

// ===== Global CPS State helpers =====
const humanizeGlobalState = (state) => {
  const s = String(state || '').toLowerCase();

  if (s === 'running') return 'Running';
  if (s === 'stopped') return 'Stopped';
  if (s === 'maintenance') return 'Maintenance';
  if (s === 'awaiting_replacement') return 'Awaiting replacement';
  if (s === 'failure') return 'Failure';
  if (s === 'ready') return 'Ready';
  if (s === 'unplugged') return 'Unplugged';

  return '—';
};

const mapGlobalStateBadgeClass = (state) => {
  const s = String(state || '').toLowerCase();

  if (s === 'running') return 'feat-badge feat-active';
  if (s === 'maintenance') return 'feat-badge feat-maintenance';
  if (s === 'awaiting_replacement') return 'feat-badge feat-waiting';
  if (s === 'failure' || s === 'unplugged') return 'feat-badge feat-failure';
  if (s === 'stopped' || s === 'ready') return 'feat-badge';
  return 'feat-badge';
};

// ===== OEE helpers =====
const formatPercent = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
};

const humanizeOeeLabel = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n >= 0.85) return 'Excellent';
  if (n >= 0.60) return 'Good';
  if (n >= 0.40) return 'Moderate';
  return 'Low';
};

const mapOeeBadgeClass = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'feat-badge';
  if (n >= 0.85) return 'feat-badge feat-active';
  if (n >= 0.60) return 'feat-badge feat-maintenance';
  if (n >= 0.40) return 'feat-badge feat-waiting';
  return 'feat-badge feat-failure';
};

const isMeaningfulValue = (value) => {
  if (value === undefined || value === null) return false;
  const text = String(value).trim();
  if (!text) return false;
  return !['undefined', 'null', 'nan'].includes(text.toLowerCase());
};

const firstMeaningful = (...values) =>
  values.find((value) => isMeaningfulValue(value));

const formatCompactLabel = (value) => {
  if (!isMeaningfulValue(value)) return '—';
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatExecutiveText = (value) => {
  if (!isMeaningfulValue(value)) return '—';
  return String(value).trim();
};

const getCriticalCpsLabel = (analytics) => {
  const critical =
    analytics?.criticalCPS && typeof analytics.criticalCPS === 'object'
      ? analytics.criticalCPS
      : null;
  const topRanking =
    Array.isArray(analytics?.criticalityRanking) && analytics.criticalityRanking.length
      ? analytics.criticalityRanking[0]
      : Array.isArray(analytics?.cpsContributionRanking) && analytics.cpsContributionRanking.length
        ? analytics.cpsContributionRanking[0]
        : null;

  return formatExecutiveText(
    firstMeaningful(
      critical?.cpsName,
      critical?.cpsId,
      analytics?.criticalCps,
      analytics?.criticalCPS,
      analytics?.bottleneck?.cpsName,
      analytics?.bottleneck?.cpsId,
      analytics?.bottleneckCps,
      topRanking?.cpsName,
      topRanking?.cpsId
    )
  );
};

const getSystemHealthLabel = (analytics) => {
  const directHealth = firstMeaningful(
    analytics?.systemHealth,
    analytics?.globalHealth,
    analytics?.healthState,
    analytics?.health?.label,
    analytics?.systemState?.health,
    analytics?.systemState?.healthState
  );

  if (directHealth) return formatCompactLabel(directHealth);

  const risk = String(
    firstMeaningful(
      analytics?.riskLevel,
      analytics?.riskSummary?.level,
      analytics?.predictedRisk?.level
    ) || ''
  ).toLowerCase();

  if (risk === 'low') return 'Healthy';
  if (risk === 'medium') return 'Attention';
  if (risk === 'high') return 'Critical';
  if (risk === 'unknown') return 'Unknown';
  return '—';
};

const getSystemStateLabel = (analytics) =>
  formatCompactLabel(
    firstMeaningful(
      analytics?.systemState?.state,
      analytics?.systemState?.status,
      analytics?.systemReasoning?.systemState,
      analytics?.reasoning?.systemState,
      analytics?.globalState,
      analytics?.operationalState
    )
  );

const getSystemLearningLabel = (analytics) =>
  formatCompactLabel(
    firstMeaningful(
      analytics?.learningState,
      analytics?.systemLearningModel?.state,
      analytics?.systemLearningModel?.learningState,
      analytics?.learning?.state,
      analytics?.learning?.learningState,
      analytics?.derivedLearning?.state
    )
  );

const getDominantLossLabel = (analytics) => {
  const firstLoss =
    Array.isArray(analytics?.dominantLosses) && analytics.dominantLosses.length
      ? analytics.dominantLosses[0]
      : null;

  return formatCompactLabel(
    firstMeaningful(
      analytics?.dominantChronicLoss,
      analytics?.dominantLoss,
      analytics?.systemReasoning?.dominantLoss,
      analytics?.reasoning?.dominantLoss,
      firstLoss?.dominantDimension,
      firstLoss?.dominantLoss
    )
  );
};

const getPredictedOeeValue = (analytics) => {
  const forecast = analytics?.systemForecast || {};
  return firstMeaningful(
    analytics?.predictedSystemOEE,
    analytics?.predictedGlobalOEE,
    analytics?.predictedOeeGlobal,
    forecast?.predictedSystemOEE,
    forecast?.predictedGlobalOEE,
    forecast?.expectedOEE,
    forecast?.expectedOee
  );
};

const getRecommendationText = (analytics) =>
  formatExecutiveText(
    firstMeaningful(
      analytics?.recommendation,
      analytics?.systemReasoning?.recommendation,
      analytics?.reasoning?.recommendation,
      analytics?.actionPlan?.recommendation,
      analytics?.coordinatorOutput?.recommendation,
      analytics?.coordinationAction,
      analytics?.adaptiveAction,
      analytics?.directive
    )
  );

const getInterpretationText = (analytics, fallback) =>
  formatExecutiveText(
    firstMeaningful(
      analytics?.reasoning?.executiveInterpretation,
      analytics?.systemReasoning?.executiveInterpretation,
      analytics?.executiveSummary,
      analytics?.explanation,
      fallback
    )
  );

// ===== Generic explanations =====
const statusExplanation = (status) => {
  const s = normalizeStatus(status);

  if (s === 'active' || s === 'ok' || s === 'running') {
    return {
      title: 'Active',
      text:
        'The operation is running normally. The CPS indicates that the routine is executing as expected.',
    };
  }

  if (s === 'maintenance') {
    return {
      title: 'Maintenance',
      text:
        'The operation is in maintenance mode. Execution may be restricted while inspection, calibration, or corrective actions are performed.',
    };
  }

  if (s === 'awaiting_replacement' || s === 'waiting') {
    return {
      title: 'Awaiting replacement',
      text:
        'The operation is paused waiting for a required replacement or intervention before continuing.',
    };
  }

  if (s === 'failure' || s === 'fail' || s === 'error') {
    return {
      title: 'Failure',
      text:
        'A failure condition was detected. The operation cannot continue safely until the cause is resolved.',
    };
  }

  return {
    title: 'Unknown',
    text: 'No recognized status was reported yet. Waiting for the CPS to publish a valid feature state.',
  };
};

const normalizeUrl = (url) => {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return `http://${u}`;
};

const getDescriptionUrl = (cps) =>
  normalizeUrl(cps?.endpoints?.description) || normalizeUrl(cps?.dashboardUrl) || '';

const getDataUrl = (cps) =>
  normalizeUrl(cps?.endpoints?.indicators) ||
  normalizeUrl(cps?.endpoints?.summary) ||
  normalizeUrl(cps?.apiData) ||
  '';

const getHistoryUrl = (cps) => normalizeUrl(cps?.endpoints?.history) || '';
const getHealthUrl = (cps) => normalizeUrl(cps?.endpoints?.health) || '';

const getDatasheetUrl = (cps) => {
  const cpsId = normalizeCpsId(cps?.id || cps?.cpsId || cps?.baseTopic || cps?.cps);
  return cpsId ? `http://127.0.0.1:1881/api/${cpsId}/datasheet/pdf` : '';
};

const openExternalUrl = (url, emptyMessage) => {
  const finalUrl = normalizeUrl(url);
  if (!finalUrl) {
    alert(emptyMessage || 'URL not available for this CPS.');
    return;
  }
  window.open(finalUrl, '_blank', 'noopener,noreferrer');
};

const openAnalyticsPage = (cps) => {
  const activeAcsm = getActiveAcsmConfig();
  const rawId = cps?.id || cps?.cpsId || cps?.baseTopic || cps?.cps;
  const cleanId = normalizeCpsId(rawId);

  if (!cleanId) {
    console.warn('[ACSM Analytics] Cannot open analytics without a CPS id from the selected card.', {
      cps,
      rawId,
      defaultCpsId: activeAcsm.defaultCpsId,
    });
    alert('CPS id not available for this card.');
    return;
  }

  const cpsId = encodeURIComponent(cleanId);
  const cpsName = encodeURIComponent(cps?.nome || rawId || 'CPS');

  window.open(`/analytics?cpsId=${cpsId}&cpsName=${cpsName}`, '_blank', 'noopener,noreferrer');
};

const openSystemAnalyticsPage = () => {
  window.open('/analytics-system', '_blank', 'noopener,noreferrer');
};

const openHcmPage = () => {
  window.open('/hcm', '_blank', 'noopener,noreferrer');
};

const formatDateTime = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '—';
  }
};

const getLifecyclePhase = (cps) =>
  String(
    cps?.lifecyclePhase ??
      cps?.lifecycle?.phase ??
      cps?.lifecycle?.currentPhase ??
      cps?.currentPhase ??
      ''
  )
    .trim()
    .toLowerCase();

const PlayFase = () => {
  const {
    acsmConfig,
    addedCPS,
    playPhaseCPS,
    startCPSById,
    stopCPSById,
    unplugCPS,
    systemAnalytics,
    stableSystemAnalytics,
    getCanonicalOperationalState,
    pendingGovernanceActions,
    decidePendingGovernanceAction,
  } =
    useCPSContext();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalCpsName, setModalCpsName] = useState('');
  const [modalOperationKey, setModalOperationKey] = useState('');
  const [modalOperationName, setModalOperationName] = useState('');
  const [modalOperationDesc, setModalOperationDesc] = useState('');
  const [modalStatus, setModalStatus] = useState(null);
  const [modalLastUpdate, setModalLastUpdate] = useState(null);
  const visibleCPS = Array.isArray(playPhaseCPS) ? playPhaseCPS : addedCPS;
  const registeredCpsCount =
    Array.isArray(acsmConfig?.managedCpsIds) && acsmConfig.managedCpsIds.length > 0
      ? acsmConfig.managedCpsIds.length
      : visibleCPS.length;
  const activeCpsCount = visibleCPS.filter((cps) => getLifecyclePhase(cps) === 'play').length;

  const globalOee = useMemo(() => {
    const validOees = visibleCPS
      .map((cps) => Number(cps?.oee?.value ?? cps?.oee?.current))
      .filter((v) => Number.isFinite(v) && v >= 0);

    if (!validOees.length) {
      return {
        value: null,
        label: '—',
        badgeClass: 'feat-badge',
        cpsCount: visibleCPS.length,
        measuredCount: 0,
      };
    }

    const avg = validOees.reduce((acc, v) => acc + v, 0) / validOees.length;

    return {
      value: avg,
      label: humanizeOeeLabel(avg),
      badgeClass: mapOeeBadgeClass(avg),
      cpsCount: visibleCPS.length,
      measuredCount: validOees.length,
    };
  }, [visibleCPS]);

  const executiveSummary = useMemo(() => {
    const analytics = stableSystemAnalytics || systemAnalytics || {};

    return {
      systemHealth: getSystemHealthLabel(analytics),
      criticalCps: getCriticalCpsLabel(analytics),
      systemState: getSystemStateLabel(analytics),
      systemLearning: getSystemLearningLabel(analytics),
      dominantLoss: getDominantLossLabel(analytics),
      predictedOee: formatPercent(getPredictedOeeValue(analytics)),
      recommendation: getRecommendationText(analytics),
      interpretation: getInterpretationText(analytics, globalOee.label),
    };
  }, [globalOee.label, stableSystemAnalytics, systemAnalytics]);

  const openStatusDetails = (cps, feat) => {
    setModalCpsName(cps.nome);
    setModalOperationKey(feat?.key || '');
    setModalOperationName(feat?.nome || feat?.key || '');
    setModalOperationDesc(feat?.descricao || '');
    setModalStatus(feat?.statusAtual ?? null);
    setModalLastUpdate(feat?.lastUpdate ?? null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalCpsName('');
    setModalOperationKey('');
    setModalOperationName('');
    setModalOperationDesc('');
    setModalStatus(null);
    setModalLastUpdate(null);
  };

  const handleExit = async (cps) => {
    try {
      await Promise.resolve(unplugCPS(cps.nome));
    } catch (e) {
      alert(`Failed to unplug CPS: ${e?.message || e}`);
    }
  };

  return (
    <div className="component-container play-fase">
      <div className="added-cps-display-play">
        <div className="play-phase-summary">
          <h2>Play Phase</h2>

          <h3>CPS in Play Phase:</h3>

          <div className="play-executive-summary">
            <div className="play-executive-grid play-executive-grid-primary">
              <div className="play-executive-metric">
                <span className="play-executive-label">GLOBAL OEE</span>
                <strong className="play-executive-value">{formatPercent(globalOee.value)}</strong>
              </div>
              <div className="play-executive-metric">
                <span className="play-executive-label">ACTIVE CPS</span>
                <strong className="play-executive-value">
                  {activeCpsCount} / {registeredCpsCount}
                </strong>
              </div>
              <div className="play-executive-metric">
                <span className="play-executive-label">SYSTEM HEALTH</span>
                <strong className="play-executive-value">{executiveSummary.systemHealth}</strong>
              </div>
              <div className="play-executive-metric">
                <span className="play-executive-label">CRITICAL CPS</span>
                <strong className="play-executive-value">{executiveSummary.criticalCps}</strong>
              </div>
              <div className="play-executive-metric">
                <span className="play-executive-label">SYSTEM STATE</span>
                <strong className="play-executive-value">{executiveSummary.systemState}</strong>
              </div>
            </div>

            <div className="play-executive-grid play-executive-grid-intelligence">
              <div className="play-executive-metric">
                <span className="play-executive-label">SYSTEM LEARNING</span>
                <strong className="play-executive-value">{executiveSummary.systemLearning}</strong>
              </div>
              <div className="play-executive-metric">
                <span className="play-executive-label">DOMINANT LOSS</span>
                <strong className="play-executive-value">{executiveSummary.dominantLoss}</strong>
              </div>
              <div className="play-executive-metric">
                <span className="play-executive-label">PREDICTED OEE</span>
                <strong className="play-executive-value">{executiveSummary.predictedOee}</strong>
              </div>
              <div className="play-executive-metric play-executive-metric-wide">
                <span className="play-executive-label">RECOMMENDATION</span>
                <strong className="play-executive-value" title={executiveSummary.recommendation}>
                  {executiveSummary.recommendation}
                </strong>
              </div>
            </div>

            <div className="play-executive-footer">
              <div className="play-executive-interpretation">
                <span>Interpretation:</span>
                <strong title={executiveSummary.interpretation}>{executiveSummary.interpretation}</strong>
              </div>

              <div className="play-executive-actions">
                <button
                  onClick={openSystemAnalyticsPage}
                  className="play-dashboard-btn"
                  title="Open ACSM system dashboard"
                >
                  ACSM Dashboard
                </button>
                <button
                  onClick={openHcmPage}
                  className="play-dashboard-btn"
                  title="Open ACSM Hierarchical Cognitive Memory"
                >
                  HCM
                </button>
              </div>
            </div>
          </div>
        </div>

        <GovernanceApproval
          actions={pendingGovernanceActions}
          onApprove={(actionId) => decidePendingGovernanceAction(actionId, 'approved')}
          onReject={(actionId) => decidePendingGovernanceAction(actionId, 'rejected')}
        />

        <ul className="cps-list-play">
          {visibleCPS.length > 0 ? (
            visibleCPS.map((cps) => {
              const features = Array.isArray(cps.funcionalidades) ? cps.funcionalidades : [];

              const descriptionUrl = getDescriptionUrl(cps);
              const dataUrl = getDataUrl(cps);
              const historyUrl = getHistoryUrl(cps);
              const healthUrl = getHealthUrl(cps);
              const datasheetUrl = getDatasheetUrl(cps);

              const canonicalOperationalState =
                getCanonicalOperationalState?.(cps) || cps.globalState?.state || cps.status || null;
              const normalizedCpsStatus = String(canonicalOperationalState || '').toLowerCase().trim();

              const isStopped = ['parado', 'stopped', 'stop', 'paused'].includes(normalizedCpsStatus);
              const isRunning = ['rodando', 'running', 'active'].includes(normalizedCpsStatus);

              const globalStateValue = canonicalOperationalState;
              const globalStateText = humanizeGlobalState(globalStateValue);
              const globalStateBadgeCls = mapGlobalStateBadgeClass(globalStateValue);
              const globalStateWhen = formatDateTime(cps.globalState?.lastUpdate);

              const healthScore = cps.health?.score ?? null;
              const healthLabel = cps.health?.label ?? null;
              const healthText = humanizeHealthLabel(healthLabel, healthScore);
              const healthBadgeCls = mapHealthBadgeClass(healthLabel, healthScore);
              const healthWhen = formatDateTime(cps.health?.lastUpdate);

              const oeeValue = cps.oee?.value ?? null;
              const oeeAvailability = cps.oee?.availability ?? null;
              const oeePerformance = cps.oee?.performance ?? null;
              const oeeQuality = cps.oee?.quality ?? null;
              const oeeText = humanizeOeeLabel(oeeValue);
              const oeeBadgeCls = mapOeeBadgeClass(oeeValue);
              const oeeWhen = formatDateTime(cps.oee?.lastUpdate);
              const governanceStatus = String(
                cps?.governanceStatus || cps?.governanceProfile?.status || 'NOT_DEFINED'
              );
              const governanceApproved = governanceStatus === 'APPROVED';

              return (
                <li
                  key={cps.id}
                  className={`cps-item-play status-${String(cps.status || '').toLowerCase()}`}
                >
                  <div className="cps-header">
                    <span className="cps-name">
                      {cps.nome} — <strong>{globalStateText}</strong></span>

                    <span className={`governance-status governance-status-${governanceStatus.toLowerCase()}`}>
                      {governanceStatus.replace(/_/g, ' ')}
                    </span>

                    <div className="action-buttons">
                      <a
                        href={datasheetUrl || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="desc-btn"
                        title={
                          datasheetUrl
                            ? `Open datasheet PDF for ${cps.nome}`
                            : 'Datasheet PDF not available'
                        }
                        aria-disabled={!datasheetUrl}
                      >
                        Datasheet PDF
                      </a>

                      {isRunning && (
                        <>
                          <button
                            onClick={() => stopCPSById(cps.id)}
                            className="stop-btn"
                            title="Pause monitoring (CPS keeps running)"
                          >
                            Stop
                          </button>

                          <button
                            onClick={() =>
                              openExternalUrl(
                                descriptionUrl,
                                'No DescriptionEndpoint or DashboardURL found in the AAS.'
                              )
                            }
                            className="desc-btn"
                            title={
                              descriptionUrl
                                ? `Open CPS description: ${descriptionUrl}`
                                : 'Description endpoint not available'
                            }
                            disabled={!descriptionUrl}
                          >
                            Description
                          </button>

                          <button
                            onClick={() =>
                              openExternalUrl(
                                dataUrl,
                                'No IndicatorsEndpoint, SummaryEndpoint or APIData found in the AAS.'
                              )
                            }
                            className="desc-btn"
                            title={
                              dataUrl
                                ? `Open CPS data endpoint: ${dataUrl}`
                                : 'Data endpoint not available'
                            }
                            disabled={!dataUrl}
                          >
                            Data
                          </button>

                          <button
                            onClick={() =>
                              openExternalUrl(
                                historyUrl,
                                'No HistoryEndpoint found in the AAS.'
                              )
                            }
                            className="desc-btn"
                            title={
                              historyUrl
                                ? `Open CPS history endpoint: ${historyUrl}`
                                : 'History endpoint not available'
                            }
                            disabled={!historyUrl}
                          >
                            History
                          </button>

                          <button
                            onClick={() =>
                              openExternalUrl(
                                healthUrl,
                                'No HealthEndpoint found in the AAS.'
                              )
                            }
                            className="desc-btn"
                            title={
                              healthUrl
                                ? `Open CPS health endpoint: ${healthUrl}`
                                : 'Health endpoint not available'
                            }
                            disabled={!healthUrl}
                          >
                            Health API
                          </button>

                          <button
                            onClick={() => openAnalyticsPage(cps)}
                            className="desc-btn"
                            title={`Open analytics page for ${cps.nome}`}
                          >
                            Analytics
                          </button>

                          <button
                            onClick={() =>
                              openExternalUrl(DATA_SPACE_URL, 'Data Space URL not available.')
                            }
                            className="desc-btn"
                            title="Open CPS Data Space"
                          >
                            Data Space
                          </button>
                        </>
                      )}

                      {isStopped && (
                        <>
                          <button
                            onClick={() => startCPSById(cps.id)}
                            className="restart-btn"
                            title={
                              governanceApproved
                                ? 'Resume monitoring'
                                : 'Restart blocked until governance is approved'
                            }
                            disabled={!governanceApproved}
                          >
                            Restart
                          </button>

                          <button
                            onClick={() =>
                              openExternalUrl(
                                descriptionUrl,
                                'No DescriptionEndpoint or DashboardURL found in the AAS.'
                              )
                            }
                            className="desc-btn"
                            title={
                              descriptionUrl
                                ? `Open CPS description: ${descriptionUrl}`
                                : 'Description endpoint not available'
                            }
                            disabled={!descriptionUrl}
                          >
                            Description
                          </button>

                          <button
                            onClick={() =>
                              openExternalUrl(
                                dataUrl,
                                'No IndicatorsEndpoint, SummaryEndpoint or APIData found in the AAS.'
                              )
                            }
                            className="desc-btn"
                            title={
                              dataUrl
                                ? `Open CPS data endpoint: ${dataUrl}`
                                : 'Data endpoint not available'
                            }
                            disabled={!dataUrl}
                          >
                            Data
                          </button>

                          <button
                            onClick={() =>
                              openExternalUrl(
                                historyUrl,
                                'No HistoryEndpoint found in the AAS.'
                              )
                            }
                            className="desc-btn"
                            title={
                              historyUrl
                                ? `Open CPS history endpoint: ${historyUrl}`
                                : 'History endpoint not available'
                            }
                            disabled={!historyUrl}
                          >
                            History
                          </button>

                          <button
                            onClick={() =>
                              openExternalUrl(
                                healthUrl,
                                'No HealthEndpoint found in the AAS.'
                              )
                            }
                            className="desc-btn"
                            title={
                              healthUrl
                                ? `Open CPS health endpoint: ${healthUrl}`
                                : 'Health endpoint not available'
                            }
                            disabled={!healthUrl}
                          >
                            Health API
                          </button>

                          <button
                            onClick={() => openAnalyticsPage(cps)}
                            className="desc-btn"
                            title={`Open analytics page for ${cps.nome}`}
                          >
                            Analytics
                          </button>

                          <button
                            onClick={() =>
                              openExternalUrl(DATA_SPACE_URL, 'Data Space URL not available.')
                            }
                            className="desc-btn"
                            title="Open CPS Data Space"
                          >
                            Data Space
                          </button>

                          <button
                            className="exit-btn"
                            title="Remove CPS from Play Phase"
                            onClick={() => handleExit(cps)}
                          >
                            Unplug
                          </button>
                        </>
                      )}

                      {!isRunning && !isStopped && (
                        <>
                          <button
                            onClick={() =>
                              openExternalUrl(
                                descriptionUrl,
                                'No DescriptionEndpoint or DashboardURL found in the AAS.'
                              )
                            }
                            className="desc-btn"
                            title={
                              descriptionUrl
                                ? `Open CPS description: ${descriptionUrl}`
                                : 'Description endpoint not available'
                            }
                            disabled={!descriptionUrl}
                          >
                            Description
                          </button>

                          <button
                            onClick={() =>
                              openExternalUrl(
                                dataUrl,
                                'No IndicatorsEndpoint, SummaryEndpoint or APIData found in the AAS.'
                              )
                            }
                            className="desc-btn"
                            title={
                              dataUrl
                                ? `Open CPS data endpoint: ${dataUrl}`
                                : 'Data endpoint not available'
                            }
                            disabled={!dataUrl}
                          >
                            Data
                          </button>

                          <button
                            onClick={() =>
                              openExternalUrl(
                                historyUrl,
                                'No HistoryEndpoint found in the AAS.'
                              )
                            }
                            className="desc-btn"
                            title={
                              historyUrl
                                ? `Open CPS history endpoint: ${historyUrl}`
                                : 'History endpoint not available'
                            }
                            disabled={!historyUrl}
                          >
                            History
                          </button>

                          <button
                            onClick={() =>
                              openExternalUrl(
                                healthUrl,
                                'No HealthEndpoint found in the AAS.'
                              )
                            }
                            className="desc-btn"
                            title={
                              healthUrl
                                ? `Open CPS health endpoint: ${healthUrl}`
                                : 'Health endpoint not available'
                            }
                            disabled={!healthUrl}
                          >
                            Health API
                          </button>

                          <button
                            onClick={() => openAnalyticsPage(cps)}
                            className="desc-btn"
                            title={`Open analytics page for ${cps.nome}`}
                          >
                            Analytics
                          </button>

                          <button
                            onClick={() =>
                              openExternalUrl(DATA_SPACE_URL, 'Data Space URL not available.')
                            }
                            className="desc-btn"
                            title="Open CPS Data Space"
                          >
                            Data Space
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="single-feature-card" style={{ marginBottom: 12 }}>
                    <div className="single-feature-row" style={{ marginBottom: 0 }}>
                      <div className="single-feature-title">
                        Global CPS State: <strong>{globalStateText}</strong>
                      </div>

                      <div className="single-feature-status">
                        <span className={globalStateBadgeCls}>{globalStateText}</span>
                      </div>

                      <div className="single-feature-meta">
                        <div className="single-feature-time">
                          Last state update: <span>{globalStateWhen}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="single-feature-card" style={{ marginBottom: 12 }}>
                    <div className="single-feature-row" style={{ marginBottom: 0 }}>
                      <div className="single-feature-title">
                        Health Indicator: <strong>{healthScore ?? '—'}</strong>
                      </div>

                      <div className="single-feature-status">
                        <span className={healthBadgeCls}>{healthText}</span>
                      </div>

                      <div className="single-feature-meta">
                        <div className="single-feature-time">
                          Last health update: <span>{healthWhen}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="single-feature-card" style={{ marginBottom: 12 }}>
                    <div className="single-feature-row" style={{ marginBottom: 8 }}>
                      <div className="single-feature-title">
                        Local OEE: <strong>{formatPercent(oeeValue)}</strong>
                      </div>

                      <div className="single-feature-status">
                        <span className={oeeBadgeCls}>{oeeText}</span>
                      </div>

                      <div className="single-feature-meta">
                        <div className="single-feature-time">
                          Last OEE update: <span>{oeeWhen}</span>
                        </div>
                      </div>
                    </div>

                    <div className="single-feature-row" style={{ marginBottom: 0 }}>
                      <div className="single-feature-title">
                        Availability: <strong>{formatPercent(oeeAvailability)}</strong>
                      </div>

                      <div className="single-feature-title">
                        Performance: <strong>{formatPercent(oeePerformance)}</strong>
                      </div>

                      <div className="single-feature-title">
                        Quality: <strong>{formatPercent(oeeQuality)}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="single-feature-card">
                    {features.length > 0 ? (
                      features.map((feat) => {
                        const statusText = globalStateText;
                        const badgeCls = globalStateBadgeCls;
                        const when = globalStateWhen !== '—'
                          ? globalStateWhen
                          : feat?.lastUpdate
                            ? new Date(feat.lastUpdate).toLocaleString()
                            : '—';

                        return (
                          <div
                            key={feat.key}
                            className="single-feature-row operation-feature-row"
                            style={{ marginBottom: 10 }}
                          >
                            <div className="single-feature-title">
                              Operation: <strong>{statusText}</strong>
                            </div>

                            <div className="single-feature-status">
                              <span className={badgeCls}>{statusText}</span>
                            </div>

                            <div className="single-feature-meta">
                              <div className="single-feature-time">
                                Last update: <span>{when}</span>
                              </div>
                            </div>

                            <div className="single-feature-actions">
                              <button
                                className="restart-btn"
                                title="Explain what this status means"
                                onClick={() => openStatusDetails(cps, feat)}
                              >
                                Details
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="single-feature-row operation-feature-row" style={{ marginBottom: 10 }}>
                        <div className="single-feature-title">
                          Operation: <strong>{cps?.nome || 'Primary Operation'}</strong>
                        </div>

                        <div className="single-feature-status">
                          <span className={globalStateBadgeCls}>{globalStateText}</span>
                        </div>

                        <div className="single-feature-meta">
                          <div className="single-feature-time">
                            Last update:{' '}
                            <span>{globalStateWhen !== '—' ? globalStateWhen : oeeWhen}</span>
                          </div>
                        </div>

                        <div className="single-feature-actions">
                          <button
                            className="restart-btn"
                            title="Explain current CPS status"
                            onClick={() =>
                              openStatusDetails(cps, {
                                key: 'global_operation',
                                nome: cps?.nome || 'Primary Operation',
                                descricao:
                                  cps?.descricao ||
                                  'Primary CPS operation derived from global state, health, and OEE.',
                                statusAtual: globalStateValue || cps?.status || null,
                                lastUpdate:
                                  cps?.globalState?.lastUpdate ||
                                  cps?.oee?.lastUpdate ||
                                  cps?.health?.lastUpdate ||
                                  null,
                              })
                            }
                          >
                            Details
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              );
            })
          ) : (
            <li className="no-cps">No active CPS...</li>
          )}
        </ul>
      </div>

      {modalOpen && (
        <div className="modal-overlay" role="presentation" onClick={closeModal}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="status-details-title"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const info = statusExplanation(modalStatus);
              const when = modalLastUpdate ? new Date(modalLastUpdate).toLocaleString() : '—';

              return (
                <>
                  <h3 id="status-details-title" className="details-modal-title">
                    Status Details — {modalCpsName}
                  </h3>

                  <div className="details-grid">
                    <div>
                      <strong>Operation</strong>
                    </div>
                    <div>{modalOperationName || modalOperationKey || '—'}</div>

                    {modalOperationDesc ? (
                      <>
                        <div>
                          <strong>Description</strong>
                        </div>
                        <div className="details-box">{modalOperationDesc}</div>
                      </>
                    ) : null}

                    <div>
                      <strong>Status</strong>
                    </div>
                    <div>{info.title}</div>

                    <div>
                      <strong>Meaning</strong>
                    </div>
                    <div className="details-box">{info.text}</div>

                    <div>
                      <strong>Last update</strong>
                    </div>
                    <div>{when}</div>
                  </div>

                  <div className="modal-footer">
                    <button className="modal-cancel-btn" onClick={closeModal}>
                      Close
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayFase;
