import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const state = JSON.parse(readFileSync(process.env.PATINA_OBSIDIAN_STATE || '/tmp/patina-obsidian-host-state.json', 'utf8'));
assert.ok(state.vault.startsWith('/tmp/patina-obsidian-host-'), 'owned test vault required');
copyFileSync('main.js', join(state.vault, '.obsidian/plugins/patina-humanizer/main.js'));
const target = (await (await fetch(`http://127.0.0.1:${state.port}/json`)).json()).find((item) => item.type === 'page' && item.url === 'app://obsidian.md/index.html');
assert.ok(target, 'Obsidian application target');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener('message', (event) => { const message = JSON.parse(event.data); if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } });
const call = (method, params) => new Promise((resolve) => { const next = ++id; pending.set(next, resolve); ws.send(JSON.stringify({ id: next, method, params })); });
const evaluate = async (expression) => {
  const message = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (message.error || message.result?.exceptionDetails) throw new Error('Obsidian host evaluation failed: ' + JSON.stringify(message.error || message.result.exceptionDetails));
  return message.result.result.value;
};
const waitForModal = async () => {
  for (let i = 0; i < 100; i++) { if (await evaluate(`[...__p.modals].some(m=>m.containerEl.isConnected&&m.contentEl.querySelector('.patina-preview-grid'))`)) return; await new Promise((resolve) => setTimeout(resolve, 50)); }
  throw new Error('Rewrite modal did not appear');
};
// Obsidian can place the modal in a separate Electron page. Capture the page
// that actually contains the preview rather than a successful but empty shot.
const capturePreview = async () => {
  const targets = await (await fetch(`http://127.0.0.1:${state.port}/json`)).json();
  for (const page of targets.filter((item) => item.type === 'page')) {
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
    let seq = 0;
    const send = (method, params) => new Promise((resolve) => {
      const key = ++seq;
      const receive = (event) => { const data = JSON.parse(event.data); if (data.id === key) { socket.removeEventListener('message', receive); resolve(data); } };
      socket.addEventListener('message', receive); socket.send(JSON.stringify({ id: key, method, params }));
    });
    try {
      const found = await send('Runtime.evaluate', { expression: "Boolean(document.querySelector('.patina-preview-grid'))", returnByValue: true });
      if (!found.result?.result?.value) continue;
      const screenshot = await send('Page.captureScreenshot', { format: 'png' });
      assert.ok(screenshot.result?.data, 'preview screenshot required');
      writeFileSync('artifacts/preview.png', Buffer.from(screenshot.result.data, 'base64'));
      return;
    } finally { socket.close(); }
  }
  throw new Error('No preview window found for visual verification');
};
try {
  assert.equal(await evaluate('app.vault.adapter.getBasePath()'), state.vault);
  await evaluate(`(async()=>{await app.plugins.disablePlugin('patina-humanizer');await app.plugins.enablePlugin('patina-humanizer');window.__p=app.plugins.plugins['patina-humanizer'];await app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath('Test.md'));window.__v=app.workspace.getLeavesOfType('markdown').find(l=>l.view.file?.path==='Test.md').view;})()`);
  const score = await evaluate(`(async()=>{__p.settings.cliPath='/home/devswha/workspace/patina-editor-inspect/bin/patina.js';return (await __p.controller.score(__v.editor,__v)).score;})()`);
  assert.equal(score, 100);
  const fake = join(state.root, 'fake-cli.mjs');
  writeFileSync(fake, 'let input="";process.stdin.setEncoding("utf8");process.stdin.on("data",x=>input+=x);process.stdin.on("end",()=>console.log(JSON.stringify({output:process.argv.includes("--audit")?"Audit fixture report.":"Edited selection."})));');
  await evaluate(`__p.settings.cliPath=${JSON.stringify(fake)};__p.settings.language='en';__p.settings.autoScore=false;`);
  await evaluate('(async()=>{await __p.controller.audit(__v.editor,__v);})()');
  for (let i = 0; i < 100 && !await evaluate(`[...__p.modals].some(m=>m.containerEl.isConnected&&m.contentEl.querySelector('.patina-report'))`); i++) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(await evaluate(`[...__p.modals].find(m=>m.contentEl.querySelector('.patina-report')).contentEl.querySelector('.patina-report').textContent`), 'Audit fixture report.');
  await evaluate(`[...__p.modals][0].close();`);
  assert.equal(await evaluate('__p.modals.size'), 0);
  await evaluate(`window.__original=__v.editor.getValue();__v.editor.setSelection({line:0,ch:0},{line:0,ch:15});window.__pending=__p.controller.rewrite(__v.editor,__v).then(()=>({ok:true})).catch(e=>({error:e.message}));undefined;`);
  await waitForModal();
  assert.equal(await evaluate('__v.editor.getValue()===__original'), true);
  mkdirSync('artifacts', { recursive: true });
  await capturePreview();
  await evaluate(`[...__p.modals].find(m=>m.contentEl.querySelector('.patina-preview-grid')).contentEl.querySelectorAll('button')[0].click();`);
  const discarded = await evaluate('__pending'); assert.equal(discarded.ok, true);
  assert.equal(await evaluate('__v.editor.getValue()===__original'), true);
  await evaluate(`__v.editor.setSelection({line:0,ch:0},{line:0,ch:15});window.__pending=__p.controller.rewrite(__v.editor,__v).then(()=>({ok:true})).catch(e=>({error:e.message}));undefined;`);
  await waitForModal(); await evaluate(`[...__p.modals].find(m=>m.contentEl.querySelector('.patina-preview-grid')).contentEl.querySelectorAll('button')[1].click();`);
  const applied = await evaluate('__pending'); assert.equal(applied.ok, true);
  assert.equal(await evaluate(`__v.editor.getValue().startsWith('Edited selection.')`), true);
  await evaluate(`__v.editor.setValue(__original);__v.editor.setSelection({line:0,ch:0},{line:0,ch:15});window.__pending=__p.controller.rewrite(__v.editor,__v).then(()=>({ok:true})).catch(e=>({error:e.message}));undefined;`);
  await waitForModal(); await evaluate(`__v.editor.setValue('User revised the note.');[...__p.modals].find(m=>m.contentEl.querySelector('.patina-preview-grid')).contentEl.querySelectorAll('button')[1].click();`);
  const stale = await evaluate('__pending'); assert.match(stale.error, /changed/);
  assert.equal(await evaluate('__v.editor.getValue()'), 'User revised the note.');
  await evaluate('__v.editor.setValue(__original)');
  const receipt = { status: 'passed', score, audit: true, discard: true, apply: true, staleGuard: true, installerVersion: '1.13.7' };
  writeFileSync('artifacts/host-check.json', JSON.stringify(receipt, null, 2)); console.log(JSON.stringify(receipt));
} finally { ws.close(); }
