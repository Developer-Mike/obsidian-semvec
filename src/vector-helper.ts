import { pipeline, FeatureExtractionPipeline } from "@huggingface/transformers"

export default class VectorHelper {
  private extractor: FeatureExtractionPipeline | null = null

  private async getExtractor(): Promise<FeatureExtractionPipeline> {
    if (this.extractor) return this.extractor

    this.extractor = await pipeline(
      "feature-extraction",
      "google/embeddinggemma-300m",
      { dtype: "fp32" }
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
