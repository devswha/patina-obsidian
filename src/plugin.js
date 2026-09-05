import { MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_SETTINGS, PatinaController } from './controller.js';

class TextModal extends Modal {
  constructor(app, text, closed) { super(app); this.text = text; this.closed = closed; }
  onOpen() { this.contentEl.createEl('h2', { text: 'Patina audit' }); this.contentEl.createEl('pre', { text: this.text, cls: 'patina-report' }); }
  onClose() { this.contentEl.empty(); this.text = ''; this.closed?.(); }
}

class RewriteModal extends Modal {
  constructor(app, before, after, resolve) { super(app); Object.assign(this, { before, after, resolve, accepted: false }); }
  onOpen() {
    this.contentEl.createEl('h2', { text: 'Review the rewrite' });
    const grid = this.contentEl.createDiv({ cls: 'patina-preview-grid' });
    for (const [title, text] of [['Original', this.before], ['Rewrite', this.after]]) { const column = grid.createDiv(); column.createEl('h3', { text: title }); column.createEl('pre', { text, cls: 'patina-report' }); }
    new Setting(this.contentEl).addButton((button) => button.setButtonText('Discard').onClick(() => this.close()))
      .addButton((button) => button.setButtonText('Apply').setCta().onClick(() => { this.accepted = true; this.close(); }));
  }
  onClose() { this.contentEl.empty(); this.resolve(this.accepted); }
}

class SettingsTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this; containerEl.empty();
    new Setting(containerEl).setName('CLI path').setDesc('Use npx patina-cli or a local bin/patina.js. Installation is an explicit command.')
      .addText((text) => text.setValue(this.plugin.settings.cliPath).onChange(async (value) => { this.plugin.settings.cliPath = value; await this.plugin.saveData(this.plugin.settings); }));
    new Setting(containerEl).setName('Language').addDropdown((dropdown) => {
      for (const value of ['auto', 'en', 'ko', 'zh', 'ja']) dropdown.addOption(value, value);
      dropdown.setValue(this.plugin.settings.language).onChange(async (value) => { this.plugin.settings.language = value; await this.plugin.saveData(this.plugin.settings); });
    });
    new Setting(containerEl).setName('Backend').setDesc('Used only for explicitly requested audits and rewrites. No API key is stored here.').addDropdown((dropdown) => {
      for (const value of ['auto', 'codex-cli', 'claude-cli', 'gemini-cli', 'kimi-cli', 'openai-http']) dropdown.addOption(value, value);
      dropdown.setValue(this.plugin.settings.backend).onChange(async (value) => { this.plugin.settings.backend = value; await this.plugin.saveData(this.plugin.settings); });
    });
    new Setting(containerEl).setName('Automatic local scoring').addToggle((toggle) => toggle.setValue(this.plugin.settings.autoScore).onChange(async (value) => { this.plugin.settings.autoScore = value; await this.plugin.saveData(this.plugin.settings); }));
    new Setting(containerEl).setName('Warning threshold').addSlider((slider) => slider.setLimits(0, 100, 5).setValue(this.plugin.settings.scoreThreshold).setDynamicTooltip().onChange(async (value) => { this.plugin.settings.scoreThreshold = value; await this.plugin.saveData(this.plugin.settings); }));
  }
}

export default class PatinaPlugin extends Plugin {
  async onload() {
    this.settings = { ...DEFAULT_SETTINGS, ...await this.loadData() }; this.modals = new Set();
    const status = this.addStatusBarItem(); status.setText('Patina');
    const isViewOpen = (view) => this.app.workspace.getLeavesOfType('markdown').some((leaf) => leaf.view === view);
    this.controller = new PatinaController({ settings: () => this.settings,
      cwd: () => { const adapter = this.app.vault.adapter; if (typeof adapter.getBasePath !== 'function') throw new Error('Patina CLI requires a local desktop vault.'); return adapter.getBasePath(); },
      notify: (message) => new Notice(message), isViewOpen, isViewActive: (view) => this.app.workspace.getActiveViewOfType(MarkdownView) === view,
      setStatus: (text, title = '', warning = false) => { status.setText(text); status.setAttribute('aria-label', title); status.toggleClass('patina-warning', warning); },
      showAudit: (text) => { const modal = new TextModal(this.app, text, () => this.modals.delete(modal)); this.modals.add(modal); modal.open(); },
      confirmRewrite: (before, after) => new Promise((resolve) => { const modal = new RewriteModal(this.app, before, after, (value) => { this.modals.delete(modal); resolve(value); }); this.modals.add(modal); modal.open(); }),
    });
    const run = (method, editor, view) => this.controller[method](editor, view).catch((error) => { if (!this.controller.disposed) new Notice(error.message); });
    this.addCommand({ id: 'score-note', name: 'Score current note', editorCallback: (editor, view) => run('score', editor, view) });
    this.addCommand({ id: 'audit-note', name: 'Audit current note', editorCallback: (editor, view) => run('audit', editor, view) });
    this.addCommand({ id: 'humanize-selection', name: 'Humanize selection', editorCallback: (editor, view) => run('rewrite', editor, view) });
    this.addCommand({ id: 'install-cli', name: 'Install or update CLI', callback: () => this.controller.install().catch((error) => { if (!this.controller.disposed) new Notice(error.message); }) });
    this.registerDomEvent(status, 'click', () => { const view = this.app.workspace.getActiveViewOfType(MarkdownView); if (view) run('score', view.editor, view); });
    this.registerEvent(this.app.workspace.on('editor-change', (editor, view) => { if (view instanceof MarkdownView) this.controller.schedule(editor, view); }));
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => { const view = this.app.workspace.getActiveViewOfType(MarkdownView); if (view) this.controller.schedule(view.editor, view); }));
    this.addSettingTab(new SettingsTab(this.app, this));
  }
  onunload() { this.controller?.dispose(); for (const modal of this.modals || []) modal.close(); }
}
