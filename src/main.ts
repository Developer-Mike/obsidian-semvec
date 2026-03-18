import { Plugin } from "obsidian"
import SettingsManager from "./settings"

export default class SemVer extends Plugin {
  settings: SettingsManager

	async onload() {
    this.settings = new SettingsManager(this)
    await this.settings.loadSettings()
    this.settings.addSettingsTab()
	}

  onunload() {}
}
