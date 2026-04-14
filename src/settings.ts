import { PluginSettingTab } from "obsidian"
import EMBEDDINGGEMMA from "./embedding/configs/embeddinggemma"
import QWEN3 from "./embedding/configs/qwen3"
import { EmbeddingModelConfig } from "./embedding/embedding-model-worker"
import SemVec from "./main"

export const MODELS: Record<string, EmbeddingModelConfig> = {
  embeddinggemma: EMBEDDINGGEMMA,
  qwen3: QWEN3
} as const

export interface SemVecSettings {
  model: keyof typeof MODELS
}

export const DEFAULT_SETTINGS: Partial<SemVecSettings> = {
  model: "embeddinggemma"
}

export default class SettingsManager {
  static SETTINGS_CHANGED_EVENT = 'semvec:settings-changed'

  private plugin: SemVec
  private settings: SemVecSettings
  private settingsTab: SemVecSettingTab

  constructor(plugin: SemVec) {
    this.plugin = plugin
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.plugin.loadData())
    this.plugin.app.workspace.trigger(SettingsManager.SETTINGS_CHANGED_EVENT)
  }

  async saveSettings() {
    await this.plugin.saveData(this.settings)
  }

  getSetting<T extends keyof SemVecSettings>(key: T): SemVecSettings[T] {
    return this.settings[key]
  }

  async setSetting(data: Partial<SemVecSettings>) {
    this.settings = Object.assign(this.settings, data)
    await this.saveSettings()
    this.plugin.app.workspace.trigger(SettingsManager.SETTINGS_CHANGED_EVENT)
  }

  addSettingsTab() {
    this.settingsTab = new SemVecSettingTab(this.plugin, this)
    this.plugin.addSettingTab(this.settingsTab)
  }
}

export class SemVecSettingTab extends PluginSettingTab {
  settingsManager: SettingsManager

  constructor(plugin: SemVec, settingsManager: SettingsManager) {
    super(plugin.app, plugin)
    this.settingsManager = settingsManager
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    // Add settings here
  }
}
