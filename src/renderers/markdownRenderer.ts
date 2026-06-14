/**
 * Markdown 渲染器 - 基于 markdown-it 的增量渲染
 *
 * 采用 "confirmed vs preview" 策略：
 * - 已完成的 Markdown 块正常渲染
 * - 未完成的块以预览状态渲染
 *
 * 注：保持 md.render() 全量渲染，因为 markdown-it 需要全局上下文
 * （列表连续性、引用块连续性等），拆段单独渲染会产生错误 HTML。
 * 稳定性优化由下游 splitHtmlSegmentsIncremental + StreamSegmentRenderer 负责。
 */

import type { StreamRenderer } from '../core/types'
import { createMdHighlightPlugin } from './highlighter'

/** Markdown-it 实例类型（避免硬依赖） */
interface MarkdownItInstance {
  render(text: string): string
  use(plugin: (md: any, options?: any) => void, options?: any): MarkdownItInstance
}

let mdInstance: MarkdownItInstance | null = null
let mdLoadPromise: Promise<MarkdownItInstance | null> | null = null
let onGlobalReady: (() => void) | null = null

function setGlobalReadyCallback(cb: () => void): void {
  onGlobalReady = cb
}

/** 懒加载 markdown-it + shiki 高亮插件 */
async function getMarkdownIt(): Promise<MarkdownItInstance | null> {
  if (mdInstance) return mdInstance
  if (mdLoadPromise) return mdLoadPromise

  mdLoadPromise = (async () => {
    try {
      const { default: MarkdownIt } = await import('markdown-it')
      const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true,
      })

      // 尝试加载 shiki 代码高亮插件
      const highlightPlugin = await createMdHighlightPlugin()
      if (highlightPlugin) {
        md.use(highlightPlugin)
      }

      mdInstance = md
      onGlobalReady?.()
      return mdInstance
    } catch {
      console.warn('[streams] markdown-it not installed, falling back to plain text')
      return null
    }
  })()

  return mdLoadPromise
}

/** 同步获取已加载的 markdown-it 实例 */
function getMarkdownItSync(): MarkdownItInstance | null {
  return mdInstance
}

/** 检测文本中的未闭合 Markdown 结构 */
function hasUnclosedBlocks(text: string): boolean {
  // 检测未闭合的代码块
  const codeBlockCount = (text.match(/```/g) || []).length
  if (codeBlockCount % 2 !== 0) return true

  // 检测未闭合的行内代码
  const inlineCodeCount = (text.match(/(?<!`)`(?!`)/g) || []).length
  if (inlineCodeCount % 2 !== 0) return true

  return false
}

/** 将字符串编码为 base64（支持 Unicode） */
function encodeBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
}

/** 将 base64 解码为字符串 */
export function decodeBase64(b64: string): string {
  try {
    return decodeURIComponent(escape(atob(b64)))
  } catch {
    return atob(b64)
  }
}

/** 自定义块在 markdown 源码中的占位标记前缀（避免被 markdown-it / shiki 处理） */
const CUSTOM_BLOCK_PLACEHOLDER_PREFIX = '<!--STREAMS-CUSTOM-BLOCK-'

/**
 * 在 markdown 渲染前，将自定义块（```think 等）替换为 HTML 注释占位符
 *
 * 原因：shiki 高亮插件会将未知语言回退为 plaintext，
 * 导致 wrapCodeBlocks 正则无法匹配原始语言名。
 * 使用 HTML 注释作为占位符，markdown-it 会保留注释不修改，
 * 渲染后再从注释中还原自定义块。
 *
 * 注释格式：<!--STREAMS-CUSTOM-BLOCK-{key}-->
 * key 为自增索引，通过 extracted Map 可查找 type 和 content。
 */
function extractCustomBlocksFromMd(content: string, customBlocks: string[]): {
  processed: string
  extracted: Map<string, { type: string; content: string }>
} {
  const extracted = new Map<string, { type: string; content: string }>()
  if (!customBlocks.length) return { processed: content, extracted }

  // 匹配 ```lang\n...\n``` 中的自定义块
  const re = new RegExp(`^\\\`\\\`\\\`(${customBlocks.join('|')})\\s*\\n([\\s\\S]*?)\\n\\\`\\\`\\\`\\s*$`, 'gm')
  let idx = 0
  const processed = content.replace(re, (_match, lang: string, code: string) => {
    const key = `${idx}`
    const encoded = encodeBase64(code)
    extracted.set(key, { type: lang, content: encoded })
    idx++
    return `${CUSTOM_BLOCK_PLACEHOLDER_PREFIX}${key}-->`
  })

  return { processed, extracted }
}

/**
 * 在 markdown 渲染后，将占位注释还原为 data-streams-block 占位 div
 */
function restoreCustomBlockPlaceholders(html: string, extracted: Map<string, { type: string; content: string }>): string {
  if (!extracted.size) return html
  for (const [key, { type, content: encodedContent }] of extracted) {
    const comment = `${CUSTOM_BLOCK_PLACEHOLDER_PREFIX}${key}-->`
    const idx = html.indexOf(comment)
    if (idx === -1) continue
    const replacement = `<div data-streams-block="${type}" data-content="${encodedContent}"></div>`
    html = html.replace(comment, replacement)
  }
  return html
}

/** 为代码块添加 GitHub 风格外框和 header（仅限有语言标记的代码块） */
function wrapCodeBlocks(html: string, customBlocks?: string[]): string {
  return html.replace(
    /<pre([^>]*)><code\s+class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
    (_match, attrs: string, lang: string, code: string) => {
      // 如果是自定义块类型，输出占位符
      if (customBlocks?.includes(lang)) {
        // 从 code 内部提取纯文本内容（去除 HTML 标签）
        const tempDiv = document.createElement('div')
        tempDiv.innerHTML = code
        const rawContent = tempDiv.textContent ?? ''
        const encoded = encodeBase64(rawContent)
        return `<div data-streams-block="${lang}" data-content="${encoded}"></div>`
      }
      const langLabel = LANG_MAP[lang] ?? lang.charAt(0).toUpperCase() + lang.slice(1)
      return (
        `<div class="streams-code-wrapper" data-lang="${lang}">` +
        `<div class="streams-code-header">` +
        `<span class="streams-code-lang">${langLabel}</span>` +
        `</div>` +
        `<pre${attrs}><code class="language-${lang}">${code}</code></pre>` +
        `</div>`
      )
    },
  )
}

const LANG_MAP: Record<string, string> = {
  js: 'JavaScript', ts: 'TypeScript', py: 'Python', rb: 'Ruby',
  go: 'Go', rs: 'Rust', java: 'Java', cpp: 'C++', c: 'C',
  cs: 'C#', php: 'PHP', swift: 'Swift', kt: 'Kotlin',
  sh: 'Shell', bash: 'Bash', zsh: 'Zsh', sql: 'SQL',
  html: 'HTML', css: 'CSS', scss: 'SCSS', less: 'Less',
  json: 'JSON', yaml: 'YAML', toml: 'TOML', xml: 'XML',
  md: 'Markdown', dockerfile: 'Dockerfile', makefile: 'Makefile',
  vue: 'Vue', jsx: 'JSX', tsx: 'TSX', dart: 'Dart',
}

export class MarkdownRenderer implements StreamRenderer {
  private fallbackRenderer: StreamRenderer | null = null
  private _onReady: (() => void) | null = null
  private customBlocks: string[]

  constructor(customBlocks?: string[]) {
    this.customBlocks = customBlocks ?? []
  }

  /** 设置降级渲染器 */
  setFallback(renderer: StreamRenderer): void {
    this.fallbackRenderer = renderer
  }

  /** 设置 markdown-it 加载完成回调 */
  onReady(callback: () => void): void {
    this._onReady = callback
    setGlobalReadyCallback(callback)
  }

  /** 同步渲染 - 如果 markdown-it 尚未加载则使用降级渲染 */
  render(content: string, isStreaming: boolean): string {
    const md = getMarkdownItSync()
    if (!md) {
      return this.fallbackRenderer?.render(content, isStreaming) ?? content
    }
    return this.renderWithMd(md, content, isStreaming)
  }

  /** 异步渲染 - 确保 markdown-it 已加载 */
  async renderAsync(content: string, isStreaming: boolean): Promise<string> {
    const md = await getMarkdownIt()
    if (!md) {
      return this.fallbackRenderer?.render(content, isStreaming) ?? content
    }
    return this.renderWithMd(md, content, isStreaming)
  }

  private renderWithMd(md: MarkdownItInstance, content: string, isStreaming: boolean): string {
    // 1. 流式渲染时，先闭合未完成的 Markdown 结构（确保自定义块正则能匹配完整块）
    let prepared = content
    if (isStreaming && hasUnclosedBlocks(prepared)) {
      prepared = this.tryCloseBlocks(prepared)
    }

    // 2. 在 markdown-it 渲染前，提取自定义块为占位注释（避免被 shiki 回退为 plaintext）
    const { processed, extracted } = extractCustomBlocksFromMd(prepared, this.customBlocks)

    const html = md.render(processed)

    // 3. 还原自定义块占位注释为 data-streams-block div
    let result = restoreCustomBlockPlaceholders(html, extracted)

    // 4. 处理普通代码块（非自定义块）的 GitHub 风格外框
    result = wrapCodeBlocks(result, this.customBlocks)

    // 流式渲染时，移除末尾的 <hr> 标签
    // 原因：--- 在流式过程中被提前渲染为 <hr>，但后续内容到达后
    // 可能导致布局跳动。延迟到流式结束后再显示可避免抖动。
    // <hr> 在 HTML 中间（后有内容）则是稳定的，不受影响。
    if (isStreaming) {
      result = result.replace(/<hr\s*\/?>\s*$/i, '')
    }

    return result
  }

  /** 尝试闭合未完成的 Markdown 结构 */
  private tryCloseBlocks(text: string): string {
    let result = text

    // 闭合代码块
    const codeBlockCount = (result.match(/```/g) || []).length
    if (codeBlockCount % 2 !== 0) {
      result += '\n```'
    }

    // 闭合行内代码
    const inlineCodeCount = (result.match(/(?<!`)`(?!`)/g) || []).length
    if (inlineCodeCount % 2 !== 0) {
      result += '`'
    }

    return result
  }

  /** 预加载 markdown-it */
  async preload(): Promise<void> {
    await getMarkdownIt()
  }

}
