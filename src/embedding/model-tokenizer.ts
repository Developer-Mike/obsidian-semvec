import { Tensor } from "onnxruntime-web"

export interface TokenizedText {
  inputIds: bigint[]
  attentionMask: bigint[]
}

export default class ModelTokenizer {
  private json: Record<string, any>
  private vocab: Map<string, number> = new Map()
  private unknown = 0

  constructor(json: Record<string, any>) {
    this.json = json
    this.load()
  }

  private load(): void {
    this.vocab.clear()

    const vocab = this.json.model?.vocab
    if (Array.isArray(vocab)) {
      for (const [token, id] of vocab)
        this.vocab.set(token, id)
    } else if (vocab) {
      for (const [token, id] of Object.entries(vocab))
        this.vocab.set(token, id as number)
    }

    this.unknown = this.vocab.get("<unk>") ?? this.vocab.get("[UNK]") ?? 0
  }

  tokenize(text: string): TokenizedText {
    const ids: number[] = []

    const bosId = this.vocab.get("<s>") ?? this.vocab.get("[CLS]")
    if (bosId !== undefined) ids.push(bosId)

    for (const word of text.split(/\s+/)) {
      const id = this.vocab.get(word) ?? this.vocab.get(`▁${word}`) ?? this.unknown
      ids.push(id)
    }

    const eosId = this.vocab.get("</s>") ?? this.vocab.get("[SEP]")
    if (eosId !== undefined) ids.push(eosId)

    return {
      inputIds: ids.map(BigInt),
      attentionMask: ids.map(() => 1n),
    }
  }

  feed(tokenized: TokenizedText): Record<string, Tensor> {
    return {
      input_ids: new Tensor("int64", tokenized.inputIds, [1, tokenized.inputIds.length]),
      attention_mask: new Tensor("int64", tokenized.attentionMask, [1, tokenized.inputIds.length]),
    }
  }

  private meanPool(data: Float32Array, mask: bigint[], dims: readonly number[]): number[] {
    const [, seqLen, hiddenSize] = dims
    const result = new Array<number>(hiddenSize).fill(0)
    let maskSum = 0

    for (let i = 0; i < seqLen; i++) {
      const m = Number(mask[i])
      maskSum += m

      for (let j = 0; j < hiddenSize; j++)
        result[j] += data[i * hiddenSize + j] * m
    }

    for (let j = 0; j < hiddenSize; j++)
      result[j] /= maskSum

    return result
  }

  private normalize(vec: number[]): number[] {
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0))
    return vec.map(v => v / norm)
  }

  process(tokenized: TokenizedText, values: Record<string, Tensor>): number[] {
    const hidden = values["last_hidden_state"] ?? Object.values(values)[0]

    const pooled = this.meanPool(
      hidden.data as Float32Array,
      tokenized.attentionMask,
      hidden.dims as readonly number[]
    )

    return this.normalize(pooled)
  }
}
