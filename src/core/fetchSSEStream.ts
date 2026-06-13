/**
 * FetchSSEStream - 基于 Fetch + SSE 的流式迭代器
 *
 * 框架无关的 AsyncIterable 实现，支持：
 * - Fetch POST/GET + SSE 响应解析
 * - 自定义内容提取器（默认 OpenAI 格式）
 * - 主动 abort() 取消
 * - 外部 AbortSignal 联动取消
 */

/** SSE 事件 */
export interface FetchSSEEvent {
  /** 提取出的文本内容 */
  content: string
  /** 原始解析出的 JSON 数据 */
  raw: unknown
}

/** 配置选项 */
export interface FetchSSEOptions {
  /** 请求 URL */
  url: string
  /** 请求方法（默认 POST） */
  method?: string
  /** 请求头 */
  headers?: Record<string, string>
  /** 请求体 */
  body?: BodyInit | null
  /** 从解析的 JSON 中提取文本，默认 OpenAI 格式 */
  contentExtractor?: (data: unknown) => string
  /** 外部 AbortSignal，可用于链接多个取消源 */
  signal?: AbortSignal
  /** 额外 Fetch 配置 */
  fetchOptions?: Omit<RequestInit, 'method' | 'headers' | 'body' | 'signal'>
}

/** 专用错误类 */
export class FetchSSEError extends Error {
  readonly status: number
  readonly statusText: string

  constructor(status: number, statusText: string) {
    super(`Fetch SSE failed: ${status} ${statusText}`)
    this.name = 'FetchSSEError'
    this.status = status
    this.statusText = statusText
  }
}

/** 默认 OpenAI 风格提取器 */
function defaultOpenAIExtractor(data: unknown): string {
  const obj = data as Record<string, unknown> | undefined
  const choices = obj?.choices as Array<Record<string, unknown>> | undefined
  const delta = choices?.[0]?.delta as Record<string, unknown> | undefined
  return typeof delta?.content === 'string' ? delta.content : ''
}

/**
 * Fetch + SSE 流式迭代器
 *
 * @example
 * ```ts
 * const stream = new FetchSSEStream({ url: '/api/chat', body: '...' })
 * for await (const event of stream) {
 *   console.log(event.content)
 * }
 * // 主动取消
 * stream.abort()
 * ```
 */
export class FetchSSEStream implements AsyncIterable<FetchSSEEvent> {
  private abortController: AbortController
  private options: FetchSSEOptions

  constructor(options: FetchSSEOptions) {
    this.abortController = new AbortController()
    this.options = options

    // 链接外部 signal
    if (options.signal) {
      if (options.signal.aborted) {
        this.abortController.abort()
      } else {
        options.signal.addEventListener('abort', () => this.abort(), { once: true })
      }
    }
  }

  /** 主动取消流 */
  abort(): void {
    this.abortController.abort()
  }

  /** 是否已取消 */
  get aborted(): boolean {
    return this.abortController.signal.aborted
  }

  /** AsyncIterable 接口 — 每次 yield 一个 FetchSSEEvent */
  async *[Symbol.asyncIterator](): AsyncGenerator<FetchSSEEvent> {
    const { url, method, headers, body, contentExtractor, fetchOptions } = this.options
    const signal = this.abortController.signal
    const extract = contentExtractor ?? defaultOpenAIExtractor

    const response = await fetch(url, {
      method: method ?? 'POST',
      headers,
      body,
      signal,
      ...fetchOptions,
    })

    if (!response.ok) {
      throw new FetchSSEError(response.status, response.statusText)
    }

    if (!response.body) {
      throw new Error('[streams] Response body is not readable')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        if (signal.aborted) return

        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') return

          try {
            const json = JSON.parse(data)
            const content = extract(json)
            if (content) {
              yield { content, raw: json }
            }
          } catch {
            // 跳过无法解析的行
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}

/** 工厂函数 */
export function createFetchSSEStream(options: FetchSSEOptions): FetchSSEStream {
  return new FetchSSEStream(options)
}
