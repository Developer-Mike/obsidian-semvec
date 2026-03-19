import { Tensor } from "onnxruntime-web"

export interface TokenizedText {
  inputIds: bigint[]
  attentionMask: bigint[]
}

interface AddedToken {
  id: number
  content: string
  single_word?: boolean
  lstrip?: boolean
  rstrip?: boolean
  normalized?: boolean
  special?: boolean
}

interface PreTokenizer {
  type: string
  pretokenizers?: PreTokenizer[]
  split?: string
  add_prefix_space?: boolean
  use_regex?: boolean
}

interface Model {
  type: string
  vocab: Record<string, number> | [string, number][]
  merges?: string[]
}

export default class ModelTokenizer {
  private vocab: Map<string, number> = new Map()
  private idToToken: Map<number, string> = new Map()
  private addedTokens: Map<string, AddedToken> = new Map()
  private model: Model | null = null
  private preTokenizer: PreTokenizer | null = null
  private postProcessor: any = null
  private unknown = 0
  private bosToken: string | null = null
  private eosToken: string | null = null

  constructor(json: Record<string, any>) {
    this.load(json)
  }

  private load(json: Record<string, any>): void {
    this.vocab.clear()
    this.idToToken.clear()
    this.addedTokens.clear()

    const model = json.model
    if (model) {
      this.model = model as Model
      const vocab = model.vocab
      if (Array.isArray(vocab)) {
        for (const item of vocab) {
          if (Array.isArray(item) && item.length >= 2) {
            const [token, id] = item
            if (typeof token === "string" && typeof id === "number") {
              this.vocab.set(token, id)
              this.idToToken.set(id, token)
            }
          }
        }
      } else if (vocab && typeof vocab === "object") {
        for (const [token, id] of Object.entries(vocab)) {
          if (typeof token === "string" && typeof id === "number") {
            this.vocab.set(token, id)
            this.idToToken.set(id, token)
          }
        }
      }
    }

    const addedTokens = json.added_tokens
    if (Array.isArray(addedTokens)) {
      for (const token of addedTokens) {
        if (typeof token === "object" && token !== null) {
          const addedToken = token as AddedToken
          if (typeof addedToken.content === "string" && typeof addedToken.id === "number") {
            this.addedTokens.set(addedToken.content, addedToken)
            if (!this.vocab.has(addedToken.content)) {
              this.vocab.set(addedToken.content, addedToken.id)
              this.idToToken.set(addedToken.id, addedToken.content)
            }
          }
        }
      }
    }

    this.preTokenizer = json.pre_tokenizer ?? null
    this.postProcessor = json.post_processor ?? null

    this.unknown = this.vocab.get("<unk>") ?? this.vocab.get("[UNK]") ?? this.vocab.get("�") ?? 0

    const unkToken = this.vocab.get("<unk>") ?? this.vocab.get("[UNK]")
    if (unkToken !== undefined) this.unknown = unkToken

    if (this.vocab.has("<s>") || this.vocab.has("[CLS]")) {
      this.bosToken = this.vocab.has("<s>") ? "<s>" : "[CLS]"
    }
    if (this.vocab.has("</s>") || this.vocab.has("[SEP]")) {
      this.eosToken = this.vocab.has("</s>") ? "</s>" : "[SEP]"
    }
  }

  private preTokenize(text: string): string[] {
    if (this.preTokenizer?.type === "ByteLevel") {
      text = text.replace(/[\t\n\r]/g, " ")
      const tokens: string[] = []
      let current = ""
      for (const char of text) {
        if (char === " ") {
          if (current) tokens.push(current)
          current = " "
          tokens.push("Ġ")
        } else {
          current += char
        }
      }
      if (current) tokens.push(current)
      return tokens.filter(t => t !== "")
    }

    if (this.preTokenizer?.type === "WhitespaceSplit") {
      return text.split(/\s+/).filter(t => t !== "")
    }

    if (this.preTokenizer?.type === "Sequence" && this.preTokenizer.pretokenizers) {
      let tokens = [text]
      for (const pretok of this.preTokenizer.pretokenizers) {
        const newTokens: string[] = []
        for (const tok of tokens) {
          newTokens.push(...this.applyPreTokenizer(tok, pretok))
        }
        tokens = newTokens
      }
      return tokens
    }

    return text.split(/\s+/).filter(t => t !== "")
  }

  private applyPreTokenizer(text: string, pretok: PreTokenizer): string[] {
    if (pretok.type === "WhitespaceSplit") {
      return text.split(/\s+/).filter(t => t !== "")
    }
    if (pretok.type === "Punctuation") {
      const pattern = /[^a-zA-Z0-9\s]/
      if (pretok.split === "merged_with_preceding") {
        return text.split(/(?=[^a-zA-Z0-9\s])/).filter(t => t !== "")
      }
      if (pretok.split === "merged_with_following") {
        return text.split(/(?<=[^a-zA-Z0-9\s])/).filter(t => t !== "")
      }
      return text.split(/([^[a-zA-Z0-9\s]])/).filter(t => t !== "")
    }
    if (pretok.type === "ByteLevel") {
      const tokens: string[] = []
      let current = ""
      for (const char of text) {
        if (char === " ") {
          if (current) tokens.push(current)
          current = ""
        } else {
          current += char
        }
      }
      if (current) tokens.push(current)
      return tokens.length ? tokens : [text]
    }
    return [text]
  }

  private tokenizeWord(word: string): number[] {
    if (!word) return []

    const directId = this.vocab.get(word)
    if (directId !== undefined) return [directId]

    const prefixId = this.vocab.get("Ġ" + word)
    if (prefixId !== undefined) return [prefixId]

    if (this.model?.type === "BPE" && this.model.merges) {
      return this.bpeTokenize(word)
    }

    if (this.model?.type === "Unigram") {
      return this.unigramTokenize(word)
    }

    return [this.unknown]
  }

  private bpeTokenize(word: string): number[] {
    const vocab = this.model!.vocab
    const vocabMap: Record<string, number> = {}

    if (Array.isArray(vocab)) {
      for (const item of vocab) {
        if (Array.isArray(item) && item.length >= 2) {
          const [token, id] = item
          if (typeof token === "string" && typeof id === "number") {
            vocabMap[token] = id
          }
        }
      }
    } else if (vocab && typeof vocab === "object") {
      for (const [token, id] of Object.entries(vocab)) {
        if (typeof id === "number") {
          vocabMap[token] = id
        }
      }
    }

    const merges = this.model!.merges
    if (!Array.isArray(merges)) return [this.unknown]

    if (vocabMap[word] !== undefined) {
      return [vocabMap[word]]
    }

    let chars = word.split("")
    if (!word.startsWith("Ġ") && !word.startsWith(" ")) {
      chars = ["Ġ", ...chars]
    }

    let tokens: string[] = []
    for (const char of chars) {
      if (typeof char !== "string") continue
      tokens.push(char)
    }

    for (const merge of merges) {
      if (typeof merge !== "string") continue
      const parts = merge.split(" ")
      if (parts.length < 2) continue
      const [first] = parts

      const newTokens: string[] = []
      let i = 0
      while (i < tokens.length) {
        let j = 0
        while (j < tokens.length && tokens[i + j] === first) {
          j++
        }
        if (j > 0) {
          const combined = tokens.slice(i, i + j).join("")
          newTokens.push(combined)
          i += j
        } else {
          newTokens.push(tokens[i])
          i++
        }
      }
      tokens = newTokens
    }

    const ids: number[] = []
    for (const token of tokens) {
      const id = vocabMap[token]
      if (id !== undefined) {
        ids.push(id)
      } else {
        ids.push(this.unknown)
      }
    }

    return ids.length ? ids : [this.unknown]
  }

  private unigramTokenize(word: string): number[] {
    const vocab = this.model!.vocab
    let vocabList: [string, number][]

    if (Array.isArray(vocab)) {
      vocabList = vocab as [string, number][]
    } else {
      vocabList = Object.entries(vocab as Record<string, number>)
    }

    vocabList.sort((a, b) => b[0].length - a[0].length)

    const ids: number[] = []
    let remaining = word.startsWith("▁") ? word.slice(1) : word

    while (remaining.length > 0) {
      let matched = false
      for (const [token, id] of vocabList) {
        const normalizedToken = token.startsWith("▁") ? token.slice(1) : token
        if (remaining.startsWith(normalizedToken)) {
          ids.push(id)
          remaining = remaining.slice(normalizedToken.length)
          matched = true
          break
        }
      }
      if (!matched) {
        ids.push(this.unknown)
        remaining = remaining.slice(1)
      }
    }

    return ids.length ? ids : [this.unknown]
  }

  tokenize(text: string): TokenizedText {
    const ids: number[] = []

    if (this.bosToken) {
      const bosId = this.vocab.get(this.bosToken)
      if (bosId !== undefined) ids.push(bosId)
    }

    const preTokens = this.preTokenize(text)
    for (const token of preTokens) {
      const subIds = this.tokenizeWord(token)
      ids.push(...subIds)
    }

    if (this.eosToken) {
      const eosId = this.vocab.get(this.eosToken)
      if (eosId !== undefined) ids.push(eosId)
    }

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
