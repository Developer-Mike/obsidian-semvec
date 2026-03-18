import { PluginSettingTab } from "obsidian"
import ExamplePlugin from "./main"

export interface ExamplePluginSettings {

}

export const DEFAULT_SETTINGS: Partial<ExamplePluginSettings> = {

}

export default class SettingsManager {
  static SETTINGS_CHANGED_EVENT = 'example-plugin:settings-changed'

  private plugin: ExamplePlugin
  private settings: ExamplePluginSettings
  private settingsTab: ExamplePluginSettingTab

  constructor(plugin: ExamplePlugin) {
    this.plugin = plugin
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.plugin.loadData())
    this.plugin.app.workspace.trigger(SettingsManager.SETTINGS_CHANGED_EVENT)
  }

  async saveSettings() {
    await this.plugin.saveData(this.settings)
  }

  getSetting<T extends keyof ExamplePluginSettings>(key: T): ExamplePluginSettings[T] {
    return this.settings[key]
  }

  async setSetting(data: Partial<ExamplePluginSettings>) {
    this.settings = Object.assign(this.settings, data)
    await this.saveSettings()
    this.plugin.app.workspace.trigger(SettingsManager.SETTINGS_CHANGED_EVENT)
  }

  addSettingsTab() {
    this.settingsTab = new ExamplePluginSettingTab(this.plugin, this)
    this.plugin.addSettingTab(this.settingsTab)
  }
}

export class ExamplePluginSettingTab extends PluginSettingTab {
  settingsManager: SettingsManager

  constructor(plugin: ExamplePlugin, settingsManager: SettingsManager) {
    super(plugin.app, plugin)
    this.settingsManager = settingsManager
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    // Add settings here
  }
}
