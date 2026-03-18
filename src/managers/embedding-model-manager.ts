import * as ort from "onnxruntime-web"
import { FileSystemAdapter, requestUrl } from "obsidian"
import * as path from "path"
import * as fs from "fs"
import SemVec from "src/main"

const MODELS = {
  "embeddinggemma": "onnx-community/embeddinggemma-300m-ONNX",
  "qwen3-embedding": "onnx-community/Qwen3-Embedding-0.6B-ONNX"
} as const

const MODEL_FILES = [
  "tokenizer.json",
  "onnx/model.onnx",
  "onnx/model.onnx_data"
]

export default class EmbeddingModelManager {
  private plugin: SemVec
  private session: ort.InferenceSession | null = null
  private vocab: Map<string, number> = new Map()
  private unkId = 0

  constructor(plugin: SemVec) {
    this.plugin = plugin
  }

  private getModelsPath(): string {
    const adapter = this.plugin.app.vault.adapter as FileSystemAdapter
    return path.join(adapter.getBasePath(), this.plugin.manifest.dir!, "models")
  }

  private getModelDir(): string {
    return path.join(this.getModelsPath(), "embeddinggemma")
  }

  private async downloadModel(): Promise<void> {
    const modelDir = this.getModelDir()
    const repoId = MODELS["embeddinggemma"]

    for (const file of MODEL_FILES) {
      const filePath = path.join(modelDir, file)
      if (fs.existsSync(filePath)) continue

      const dir = path.dirname(filePath)
      fs.mkdirSync(dir, { recursive: true })

      const url = `https://huggingface.co/${repoId}/resolve/main/${file}`
      console.log(`SemVec: Downloading ${file}...`)

      const response = await requestUrl({ url })
      fs.writeFileSync(filePath, Buffer.from(response.arrayBuffer))
    }
  }

  private loadTokenizer(modelDir: string): void {
    const raw = fs.readFileSync(path.join(modelDir, "tokenizer.json"), "utf-8")
    const data = JSON.parse(raw)

    const vocab = data.model?.vocab
    if (Array.isArray(vocab)) {
      for (const [token, id] of vocab) this.vocab.set(token, id)
    } else if (vocab) {
      for (const [token, id] of Object.entries(vocab)) this.vocab.set(token, id as number)
    }

    this.unkId = this.vocab.get("<unk>") ?? this.vocab.get("[UNK]") ?? 0
  }

  private tokenize(text: string): { inputIds: bigint[]; attentionMask: bigint[] } {
    const ids: number[] = []

    const bosId = this.vocab.get("<s>") ?? this.vocab.get("[CLS]")
    if (bosId !== undefined) ids.push(bosId)

    for (const word of text.split(/\s+/)) {
      const id = this.vocab.get(word) ?? this.vocab.get(`▁${word}`) ?? this.unkId
      ids.push(id)
    }

    const eosId = this.vocab.get("</s>") ?? this.vocab.get("[SEP]")
    if (eosId !== undefined) ids.push(eosId)

    return {
      inputIds: ids.map(BigInt),
      attentionMask: ids.map(() => 1n),
    }
  }

  private getPluginDir(): string {
    const adapter = this.plugin.app.vault.adapter as FileSystemAdapter
    return path.join(adapter.getBasePath(), this.plugin.manifest.dir!)
  }

  private async getSession(): Promise<ort.InferenceSession> {
    if (this.session) return this.session

    // Configure WASM: point to plugin directory so Emscripten's fs.readFileSync can find it
    ort.env.wasm.numThreads = 1
    ort.env.wasm.wasmPaths = this.getPluginDir() + "/"

    await this.downloadModel()

    const modelDir = this.getModelDir()
    this.loadTokenizer(modelDir)

    const modelPath = path.join(modelDir, "onnx", "model.onnx")
    const modelBuffer = fs.readFileSync(modelPath)
    const externalDataPath = path.join(modelDir, "onnx", "model.onnx_data")
    const externalData = fs.readFileSync(externalDataPath)
    this.session = await ort.InferenceSession.create(modelBuffer.buffer, {
      externalData: [{ path: "model.onnx_data", data: externalData.buffer }],
    })

    return this.session
  }

  private meanPool(data: Float32Array, mask: bigint[], dims: readonly number[]): number[] {
    const [, seqLen, hiddenSize] = dims
    const result = new Array<number>(hiddenSize).fill(0)
    let maskSum = 0

    for (let i = 0; i < seqLen; i++) {
      const m = Number(mask[i])
      maskSum += m
      for (let j = 0; j < hiddenSize; j++) {
        result[j] += data[i * hiddenSize + j] * m
      }
    }

    for (let j = 0; j < hiddenSize; j++) {
      result[j] /= maskSum
    }

    return result
  }

  private normalize(vec: number[]): number[] {
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0))
    return vec.map(v => v / norm)
  }

  async getVector(text: string): Promise<number[]> {
    const session = await this.getSession()
    const { inputIds, attentionMask } = this.tokenize(`search_query: ${text}`)
    const seqLen = inputIds.length

    const feeds: Record<string, ort.Tensor> = {
      input_ids: new ort.Tensor("int64", inputIds, [1, seqLen]),
      attention_mask: new ort.Tensor("int64", attentionMask, [1, seqLen]),
    }

    const output = await session.run(feeds)
    const hidden = output["last_hidden_state"] ?? Object.values(output)[0]

    const pooled = this.meanPool(
      hidden.data as Float32Array,
      attentionMask,
      hidden.dims as readonly number[]
    )

    return this.normalize(pooled)
  }
}
