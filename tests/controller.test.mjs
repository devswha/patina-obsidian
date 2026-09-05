import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PatinaController, DEFAULT_SETTINGS } from '../src/controller.js';
const hash = (text) => createHash('sha256').update(text).digest('hex');

function fixture({ choice = false, language = 'en', invoke } = {}) {
  let text = 'Original note.'; const notices = []; const statuses = []; let opened = true;
  const editor = { getValue: () => text, getSelection: () => text, getCursor: (side) => ({ line: 0, ch: side === 'from' ? 0 : text.length }),
    replaceRange(value) { text = value; } };
  const view = { editor, file: { path: 'note.md' } };
  const controller = new PatinaController({ settings: () => ({ ...DEFAULT_SETTINGS, language }), cwd: () => '/tmp', notify: (value) => notices.push(value),
    setStatus: (...value) => statuses.push(value), isViewOpen: () => opened, showAudit: (value) => notices.push(value),
    confirmRewrite: async () => typeof choice === 'function' ? choice() : choice,
    invoke: invoke || (async () => ({ output: 'Rewritten note.' })) });
  return { controller, editor, view, notices, statuses, get: () => text, change(value) { text = value; }, close() { opened = false; } };
}

test('a rewrite requires verification and explicit confirmation', async () => {
  let call; const f = fixture({ invoke: async (input) => { call = input; return { output: 'Rewritten note.' }; } });
  await f.controller.rewrite(f.editor, f.view);
  assert.equal(f.get(), 'Original note.'); assert.ok(call.args.includes('--verify'));
  const yes = fixture({ choice: true }); await yes.controller.rewrite(yes.editor, yes.view); assert.equal(yes.get(), 'Rewritten note.');
});

test('a changed, closed or switched note cannot be overwritten', async () => {
  let changed; changed = fixture({ choice: () => { changed.change('User edit.'); return true; } });
  await assert.rejects(changed.controller.rewrite(changed.editor, changed.view), /changed/); assert.equal(changed.get(), 'User edit.');
  let closed; closed = fixture({ choice: () => { closed.close(); return true; } });
  await assert.rejects(closed.controller.rewrite(closed.editor, closed.view), /changed/);
  let switched; switched = fixture({ choice: () => { switched.view.file.path = 'other.md'; return true; } });
  await assert.rejects(switched.controller.rewrite(switched.editor, switched.view), /changed/);
});

test('unload aborts requests and suppresses preview/application', async () => {
  let finish; let signal;
  const f = fixture({ choice: true, invoke: (input) => { signal = input.signal; return new Promise((resolve) => { finish = resolve; }); } });
  const work = f.controller.rewrite(f.editor, f.view); await new Promise((resolve) => setTimeout(resolve, 0));
  f.controller.dispose(); assert.equal(signal.aborted, true); finish({ output: 'Late result.' }); await work;
  assert.equal(f.get(), 'Original note.');
});

test('inspection is source-bound and stale results cannot update the status', async () => {
  let f; f = fixture({ invoke: async (input) => { f.change('Changed note.'); return { schemaVersion: 1, sourceHash: hash(input.text), language: 'en', deterministicOnly: true, available: true, score: 90 }; } });
  assert.equal(await f.controller.score(f.editor, f.view), null); assert.equal(f.statuses.length, 0);
});

test('selection language detection and installation are explicit', async () => {
  const calls = [];
  const f = fixture({ language: 'auto', invoke: async (input) => {
    calls.push(input);
    if (input.args[0] === 'inspect') return { schemaVersion: 1, sourceHash: hash(input.text), language: 'ko', deterministicOnly: true, available: true, score: 0 };
    return input.json === false ? 'patina 8.2.0' : { output: '다듬은 문장입니다.' };
  } });
  f.change('한국어 문장입니다.'); await f.controller.rewrite(f.editor, f.view);
  assert.equal(calls[0].text, '한국어 문장입니다.'); assert.equal(calls[1].args[calls[1].args.indexOf('--lang') + 1], 'ko');
  await f.controller.install(); assert.equal(calls.at(-1).text, ''); assert.equal(calls.at(-1).online, true);
});

test('moving the selection before confirmation cannot apply a rewrite to the old range', async () => {
  let f; f = fixture({ choice: () => { f.editor.getCursor = () => ({ line: 0, ch: 1 }); return true; } });
  await assert.rejects(f.controller.rewrite(f.editor, f.view), /selection changed/); assert.equal(f.get(), 'Original note.');
});

test('empty-note switches and older failures cannot overwrite newer status', async () => {
  const settings = () => ({ ...DEFAULT_SETTINGS, language: 'en' }); const statuses = [];
  const a = { getValue: () => 'A note.' }; const b = { getValue: () => '' }; let active = a; let finish;
  const controller = new PatinaController({ settings, cwd: () => '/tmp', notify() {}, showAudit() {}, confirmRewrite() {},
    setStatus: (text) => statuses.push(text), isViewOpen: () => true, isViewActive: (view) => view === active,
    invoke: (input) => new Promise((resolve) => { finish = () => resolve({ schemaVersion: 1, sourceHash: hash(input.text), language: 'en', deterministicOnly: true, available: true, score: 90 }); }) });
  const first = controller.score(a, a); active = b; await controller.score(b, b); finish(); await first;
  assert.deepEqual(statuses, ['Patina']);
  let rejectOld; active = a;
  controller.invoke = () => new Promise((_resolve, reject) => { rejectOld = reject; });
  const old = controller.score(a, a);
  controller.invoke = async (input) => ({ schemaVersion: 1, sourceHash: hash(input.text), language: 'en', deterministicOnly: true, available: true, score: 10 });
  await controller.score(a, a); rejectOld(new Error('old failure')); await old;
  assert.equal(statuses.at(-1), 'Patina 10');
});
