'use strict';
const fs = require('node:fs');
const path = require('node:path');
class PendingQueue {
  constructor(file, max = 10000, attempts = 12, deadLetterFile = `${file}.failed`) { this.file = file; this.deadLetterFile = deadLetterFile; this.max = max; this.attempts = attempts; this.items = []; this.load(); }
  load() { try { this.items = fs.readFileSync(this.file, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse); } catch (_) { this.items = []; } }
  save() { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, this.items.map(JSON.stringify).join('\n') + (this.items.length ? '\n' : '')); }
  appendFailure(item, reason, error) { fs.mkdirSync(path.dirname(this.deadLetterFile), { recursive: true }); const failure = { ...item, failureReason: reason, lastError: String(error?.message || error || reason), failedAt: new Date().toISOString() }; fs.appendFileSync(this.deadLetterFile, `${JSON.stringify(failure)}\n`); return failure; }
  push(item, error) {
    const existing = this.items.findIndex((entry) => entry.messageId === item.messageId);
    const retryCount = Number(existing >= 0 ? this.items[existing].retryCount : item.retryCount || 0) + 1;
    const queued = { ...item, retryCount, lastError: String(error?.message || error), nextAttemptAt: Date.now() + Math.min(60000, 1000 * 2 ** Math.min(retryCount - 1, 6)) };
    if (retryCount >= this.attempts) { this.appendFailure(queued, 'attempts_exhausted', error); if (existing >= 0) this.items.splice(existing, 1); this.save(); return { status: 'dead_letter', item: queued }; }
    if (existing >= 0) this.items[existing] = queued;
    else if (this.items.length >= this.max) { this.appendFailure(queued, 'queue_full', error); return { status: 'dead_letter', item: queued }; }
    else this.items.push(queued);
    this.save(); return { status: 'pending', item: queued };
  }
  due(limit = 100) { return this.items.filter((x) => x.nextAttemptAt <= Date.now()).slice(0, limit); }
  remove(id) { this.items = this.items.filter((x) => x.messageId !== id); this.save(); }
  failures() { try { return fs.readFileSync(this.deadLetterFile, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse); } catch (_) { return []; } }
  requeueFailures(limit = 100) { const failures = this.failures(), selected = failures.slice(0, limit), remaining = failures.slice(selected.length); let requeued = 0; for (const item of selected) { if (this.items.length >= this.max) break; const { failureReason, failedAt, ...clean } = item; this.items.push({ ...clean, retryCount: 0, nextAttemptAt: Date.now() }); requeued += 1; } const rest = selected.slice(requeued).concat(remaining); fs.mkdirSync(path.dirname(this.deadLetterFile), { recursive: true }); fs.writeFileSync(this.deadLetterFile, rest.map(JSON.stringify).join('\n') + (rest.length ? '\n' : '')); this.save(); return { requeued, remaining: rest.length }; }
  stats() { const failures = this.failures(); return { pending: this.items.length, exhausted: failures.filter(x => x.failureReason === 'attempts_exhausted').length, queueFullFailures: failures.filter(x => x.failureReason === 'queue_full').length, failed: failures.length, max: this.max, attempts: this.attempts, full: this.items.length >= this.max }; }
}
module.exports = PendingQueue;
