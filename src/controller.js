import { createHash } from 'node:crypto';
import { runPatina } from './cli.js';

export const DEFAULT_SETTINGS = Object.freeze({ cliPath: 'npx patina-cli', language: 'auto', backend: 'auto', autoScore: true, scoreThreshold: 30 });
export function validateInspection(value, text) {
  const hash = createHash('sha256').update(text).digest('hex');
  if (value?.schemaVersion !== 1 || value.deterministicOnly !== true || value.sourceHash !== hash
    || !['en', 'ko', 'zh', 'ja'].includes(value.language) || (value.available && (!Number.isFinite(value.score) || value.score < 0 || value.score > 100))) throw new Error('Patina returned incompatible inspection data.');
  return value;
}

export class PatinaController {
  constructor({ settings, cwd, notify, showAudit, confirmRewrite, setStatus, isViewOpen, isViewActive = isViewOpen, invoke = runPatina }) {
    Object.assign(this, { settings, cwd, notify, showAudit, confirmRewrite, setStatus, isViewOpen, invoke });
    this.isViewActive = isViewActive;
    this.controllers = new Set(); this.disposed = false; this.timer = null; this.inspection = null;
  }
  dispose() { this.disposed = true; clearTimeout(this.timer); for (const controller of this.controllers) controller.abort(); }
  async call(args, text, extra = {}) {
    if (this.disposed) throw new Error('Patina was unloaded.');
    const controller = new AbortController(); this.controllers.add(controller);
    try { return await this.invoke({ cliPath: this.settings().cliPath, args, text, cwd: this.cwd(), signal: controller.signal, ...extra }); }
    finally { this.controllers.delete(controller); }
  }
  schedule(editor, view) {
    clearTimeout(this.timer);
    this.inspection = {};
    if (!this.settings().autoScore || this.disposed) return;
    this.timer = setTimeout(() => this.score(editor, view).catch(() => {}), 500);
  }
  async score(editor, view) {
    const token = {}; this.inspection = token;
    if (this.disposed || !this.isViewActive(view)) return null;
    const text = editor.getValue(); if (!text.trim()) { this.setStatus('Patina'); return null; }
    try {
      const result = validateInspection(await this.call(['inspect', '--lang', this.settings().language], text, { timeoutMs: 15000 }), text);
      if (this.disposed || this.inspection !== token || !this.isViewOpen(view) || !this.isViewActive(view) || editor.getValue() !== text) return null;
      this.setStatus(result.available ? `Patina ${Math.round(result.score)}` : 'Patina —', 'Local writing signals, not an authorship verdict.', result.score > this.settings().scoreThreshold);
      return result;
    } catch (error) {
      if (!this.disposed && this.inspection === token && this.isViewActive(view) && editor.getValue() === text) this.setStatus('Patina !', error.message);
      return null;
    }
  }
  async language(text) {
    const configured = this.settings().language;
    if (configured !== 'auto') return configured;
    const sample = text.slice(0, 12000);
    const result = validateInspection(await this.call(['inspect', '--lang', 'auto'], sample, { timeoutMs: 15000 }), sample);
    return result.language;
  }
  async audit(editor, view) {
    const text = editor.getValue(); if (!text.trim()) return;
    const lang = await this.language(text); if (this.disposed || !this.isViewOpen(view)) return;
    const args = ['--audit', '--format', 'json', '--quiet', '--no-interactive', '--lang', lang];
    if (this.settings().backend !== 'auto') args.push('--backend', this.settings().backend);
    const result = await this.call(args, text);
    if (!this.disposed && this.isViewOpen(view)) { if (typeof result.output !== 'string') throw new Error('No audit text returned.'); this.showAudit(result.output); }
  }
  async rewrite(editor, view) {
    const original = editor.getValue(); const text = editor.getSelection();
    if (!text.trim()) { this.notify('Select text to rewrite.'); return; }
    const from = { ...editor.getCursor('from') }; const to = { ...editor.getCursor('to') }; const file = view.file?.path;
    const lang = await this.language(text); if (this.disposed || !this.isViewOpen(view)) return;
    const args = ['--verify', '--format', 'json', '--quiet', '--no-interactive', '--lang', lang];
    if (this.settings().backend !== 'auto') args.push('--backend', this.settings().backend);
    const result = await this.call(args, text);
    if (this.disposed || !this.isViewOpen(view)) return;
    if (typeof result.output !== 'string' || !result.output.trim()) throw new Error('No rewrite text returned.');
    if (result.output === text) { this.notify('Patina kept the selection unchanged.'); return; }
    const accepted = await this.confirmRewrite(text, result.output);
    if (!accepted || this.disposed) return;
    if (!this.isViewOpen(view) || view.editor !== editor || view.file?.path !== file || editor.getValue() !== original) throw new Error('The note changed during rewriting. Run Patina again.');
    const currentFrom = editor.getCursor('from'); const currentTo = editor.getCursor('to');
    if (currentFrom.line !== from.line || currentFrom.ch !== from.ch || currentTo.line !== to.line || currentTo.ch !== to.ch) throw new Error('The selection changed during rewriting. Run Patina again.');
    editor.replaceRange(result.output, from, to);
  }
  async install() {
    const version = await this.call(['--version'], '', { online: true, json: false });
    if (!this.disposed) this.notify(`Patina CLI ready: ${version}`);
  }
}
