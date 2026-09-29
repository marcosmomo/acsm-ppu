'use client';

import React, { useCallback, useEffect, useState } from 'react';

const EMPTY_INSPECTION = { state: 'idle', data: null, httpStatus: null, error: null };

export default function ApiCatalogModal({ open, onClose }) {
  const [inspection, setInspection] = useState(EMPTY_INSPECTION);
  const [copyFeedback, setCopyFeedback] = useState('');

  const loadCatalog = useCallback(async () => {
    setInspection((current) => ({ ...current, state: 'loading', error: null }));
    setCopyFeedback('');
    try {
      const response = await fetch('/api/acsm', { method: 'GET', cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw Object.assign(new Error(data?.error || `HTTP ${response.status}`), {
          httpStatus: response.status,
        });
      }
      setInspection({ state: 'success', data, httpStatus: response.status, error: null });
    } catch (error) {
      setInspection({
        state: 'error',
        data: null,
        httpStatus: error?.httpStatus ?? null,
        error: error?.message || 'Unknown error',
      });
    }
  }, []);

  useEffect(() => {
    if (open) loadCatalog();
  }, [open, loadCatalog]);

  const copyJson = async () => {
    if (!inspection.data) return;
    if (!navigator?.clipboard?.writeText) {
      setCopyFeedback('Clipboard unavailable');
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(inspection.data, null, 2));
      setCopyFeedback('Copied');
    } catch {
      setCopyFeedback('Copy failed');
    }
  };

  if (!open) return null;

  const facades = Array.isArray(inspection.data?.availableFacades)
    ? inspection.data.availableFacades.filter((facade) => facade?.method === 'GET')
    : [];
  const operations = Object.entries(inspection.data?.lifecycleOperations || {});

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal play-api-modal api-catalog-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-catalog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="api-modal-heading">
          <h3 id="api-catalog-title" className="details-modal-title">ACSM API Catalog</h3>
          <button type="button" className="api-modal-close" onClick={onClose} aria-label="Close API catalog">×</button>
        </div>
        <div className="play-api-meta">
          <div><strong>Endpoint:</strong> <code>GET /api/acsm</code></div>
          <div><strong>HTTP status:</strong> {inspection.httpStatus ? `${inspection.httpStatus}${inspection.httpStatus === 200 ? ' OK' : ''}` : '—'}</div>
          <div><strong>ACSM ID:</strong> {inspection.data?.acsmId ?? '—'}</div>
          <div><strong>Catalog type:</strong> {inspection.data?.type ?? '—'}</div>
          <div className="api-meta-wide"><strong>Timestamp:</strong> {inspection.data?.timestamp ?? '—'}</div>
        </div>

        {inspection.state === 'loading' && <div className="play-api-message" role="status">Loading API catalog...</div>}
        {inspection.state === 'error' && (
          <div className="play-api-error" role="alert">
            <strong>Unable to load GET /api/acsm</strong>
            <span>{inspection.httpStatus ? `HTTP ${inspection.httpStatus}: ` : ''}{inspection.error}</span>
          </div>
        )}

        {inspection.state === 'success' && (
          <div className="api-catalog-content">
            <section className="api-catalog-section" aria-labelledby="available-facades-title">
              <h4 id="available-facades-title">Available read-only facades</h4>
              <div className="api-catalog-facades">
                {facades.map((facade) => (
                  <article className="api-catalog-card" key={facade.endpoint}>
                    <strong>{facade.name}</strong>
                    <code>{facade.method} {facade.endpoint}</code>
                    <span className="api-status-badge api-status-available">Read-only</span>
                    <span>Facade type: {facade.type || '—'}</span>
                    {facade.description && <p>{facade.description}</p>}
                  </article>
                ))}
              </div>
            </section>

            <section className="api-catalog-section" aria-labelledby="without-facade-title">
              <h4 id="without-facade-title">Lifecycle operations without dedicated facade</h4>
              <div className="api-catalog-operations">
                {operations.map(([operation, descriptor]) => (
                  <article className="api-catalog-operation" key={operation}>
                    <strong>{operation}</strong>
                    <code>dedicatedFacade = {String(descriptor?.dedicatedFacade ?? false)}</code>
                    <span>{descriptor?.reason}</span>
                  </article>
                ))}
              </div>
            </section>

            <section className="api-catalog-raw" aria-labelledby="api-catalog-raw-title">
              <h4 id="api-catalog-raw-title">Raw JSON</h4>
              <pre className="play-api-json">{JSON.stringify(inspection.data, null, 2)}</pre>
            </section>
          </div>
        )}

        <div className="modal-footer play-api-modal-footer">
          {copyFeedback && <span className="play-api-copy-feedback" role="status">{copyFeedback}</span>}
          <button type="button" className="play-dashboard-btn" onClick={loadCatalog} disabled={inspection.state === 'loading'}>Refresh</button>
          <button type="button" className="play-dashboard-btn" onClick={copyJson} disabled={inspection.state !== 'success' || !inspection.data}>Copy JSON</button>
          <button type="button" className="modal-cancel-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
