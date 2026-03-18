import { PluginSettingTab } from "obsidian"
import SemVer from "./main"

export interface SemVerSettings {

}

export const DEFAULT_SETTINGS: Partial<SemVerSettings> = {

}

export default class SettingsManager {
  static SETTINGS_CHANGED_EVENT = 'semver:settings-changed'

  private plugin: SemVer
  private settings: SemVerSettings
  private settingsTab: SemVerSettingTab

  constructor(plugin: SemVer) {
    this.plugin = plugin
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.plugin.loadData())
    this.plugin.app.workspace.trigger(SettingsManager.SETTINGS_CHANGED_EVENT)
  }

  async saveSettings() {
    await this.plugin.saveData(this.settings)
  }

  getSetting<T extends keyof SemVerSettings>(key: T): SemVerSettings[T] {
    return this.settings[key]
  }

  async setSetting(data: Partial<SemVerSettings>) {
    this.settings = Object.assign(this.settings, data)
    await this.saveSettings()
    this.plugin.app.workspace.trigger(SettingsManager.SETTINGS_CHANGED_EVENT)
  }

  addSettingsTab() {
    this.settingsTab = new SemVerSettingTab(this.plugin, this)
    this.plugin.addSettingTab(this.settingsTab)
  }
}

export class SemVerSettingTab extends PluginSettingTab {
  settingsManager: SettingsManager

  constructor(plugin: SemVer, settingsManager: SettingsManager) {
    super(plugin.app, plugin)
    this.settingsManager = settingsManager
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    // Add settings here
  }
}
