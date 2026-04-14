/**
 * Main -> Worker:
 *  { type: "init", id, wasmBinary, modelBuffer, modelData, tokenizerJson, tokenizerConfigJson }
 *  { type: "getVector", id, text }
 *
 * Worker -> Main:
 *   { type: "ready", id }
 *   { type: "vector", id, vector }
 *   { type: "error", id, message }
 */

import * as ort from "onnxruntime-web"
import { InferenceSession, Tensor } from "onnxruntime-web"
import { Tokenizer } from "@huggingface/tokenizers"

let session: InferenceSession | null = null
let tokenizer: Tokenizer | null = null
let kvCache: { numLayers: number; numKvHeads: number; headDim: number } | null = null

async function handleInit(data: any): Promise<void> {
  const { wasmBinary, modelBuffer, modelData, tokenizerJson, tokenizerConfigJson, kvCache: kvc } = data

  console.log("[Embedding] Initializing with tokenizer config...")

  const env = ort.env as any
  env.wasm.numThreads = 1
  env.wasm.wasmBinary = wasmBinary

  tokenizer = new Tokenizer(JSON.parse(tokenizerJson), JSON.parse(tokenizerConfigJson))
  console.log("[Embedding] Tokenizer initialized")

  kvCache = kvc ?? null

  console.log("[Embedding] Loading ONNX model...")
  session = await InferenceSession.create(
    new Uint8Array(modelBuffer),
    { externalData: [{ path: "model.onnx_data", data: new Uint8Array(modelData) }] }
  )
  console.log("[Embedding] ONNX model loaded")
}

function meanPool(data: Float32Array, mask: (number | bigint)[], dims: readonly number[]): number[] {
  const [, seqLen, hiddenSize] = dims
  const result = new Array<number>(hiddenSize).fill(0)
  let maskSum = 0

  for (let i = 0; i < seqLen; i++) {
    const m = typeof mask[i] === "bigint" ? Number(mask[i]) : mask[i]
    maskSum += m

    for (let j = 0; j < hiddenSize; j++)
      result[j] += data[i * hiddenSize + j] * m
  }

  for (let j = 0; j < hiddenSize; j++)
    result[j] /= maskSum

  return result
}

function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0))
  return vec.map(v => v / norm)
}

async function getVector(text: string): Promise<number[]> {
  if (!session || !tokenizer)
    throw new Error("Worker not initialized")

  console.log("[Embedding] Tokenizing:", text.substring(0, 50))
  const encoded = tokenizer.encode(text)
  const ids = encoded.ids
  const mask = encoded.attention_mask
  console.log("[Embedding] Token count:", ids.length)

  const seqLen = ids.length

  const toBigInt = (arr: (number | bigint)[]) => BigInt64Array.from(arr.map(x => typeof x === "bigint" ? x : BigInt(x)))

  const feed: Record<string, Tensor> = {
    input_ids: new Tensor("int64", toBigInt(ids), [1, seqLen]),
    attention_mask: new Tensor("int64", toBigInt(mask), [1, seqLen]),
  }

  if (kvCache) {
    const { numLayers, numKvHeads, headDim } = kvCache
    const emptyKv = new Float32Array(0)
    for (let i = 0; i < numLayers; i++) {
      feed[`past_key_values.${i}.key`] = new Tensor("float32", emptyKv, [1, numKvHeads, 0, headDim])
      feed[`past_key_values.${i}.value`] = new Tensor("float32", emptyKv, [1, numKvHeads, 0, headDim])
    }
  }

  const values = await session.run(feed)

  const hidden = values["last_hidden_state"] ?? Object.values(values)[0]

  const pooled = meanPool(
    hidden.data as Float32Array,
    mask,
    hidden.dims as readonly number[]
  )

  return normalize(pooled)
}

const ctx = globalThis as unknown as Worker
ctx.onmessage = async (e: MessageEvent) => {
  const { type, id } = e.data

  try {
    switch (type) {
      case "init":
        await handleInit(e.data)
        ctx.postMessage({ type: "ready", id })
        break

      case "getVector":
        const vector = await getVector(e.data.text)
        ctx.postMessage({ type: "vector", id, vector })
        break

      default:
        ctx.postMessage({ type: "error", id, message: `Unknown message type: ${type}` })
    }
  } catch (err: any) {
    ctx.postMessage({ type: "error", id, message: err?.message ?? String(err) })
  }
}