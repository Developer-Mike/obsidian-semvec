import { pipeline, FeatureExtractionPipeline } from "@huggingface/transformers"
import { FileSystemAdapter } from "obsidian"
import * as path from "path"
import SemVec from "src/main"

const MODELS = {
  "embeddinggemma": "google/embeddinggemma-300m",
  "qwen3-embedding": "onnx-community/Qwen3-Embedding-0.6B-ONNX"
} as const

export default class EmbeddingModelManager {
  private plugin: SemVec
  private extractor: FeatureExtractionPipeline | null = null

  constructor(plugin: SemVec) {
    this.plugin = plugin
  }

  private getModelsPath(): string {
    const adapter = this.plugin.app.vault.adapter as FileSystemAdapter
    return path.join(adapter.getBasePath(), this.plugin.manifest.dir!, "models")
  }

  private async getExtractor(): Promise<FeatureExtractionPipeline> {
    if (this.extractor) return this.extractor

    this.extractor = await pipeline(
      "feature-extraction",
      MODELS["qwen3-embedding"],
      { dtype: "fp32", cache_dir: this.getModelsPath() }
    ) as unknown as FeatureExtractionPipeline

    return this.extractor
  }

  async getVector(text: string): Promise<number[]> {
    const extractor = await this.getExtractor()
    const output = await extractor(`search_query: ${text}`, {
      pooling: "mean",
      normalize: true,
    })
    return Array.from(output.data as Float32Array)
  }
}
