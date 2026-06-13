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
        html: false,
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

/** 为代码块添加 GitHub 风格外框和 header（仅限有语言标记的代码块） */
function wrapCodeBlocks(html: string): string {
  return html.replace(
    /<pre([^>]*)><code\s+class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
    (_match, attrs: string, lang: string, code: string) => {
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
    let html: string
    if (!isStreaming) {
      html = md.render(content)
    } else if (hasUnclosedBlocks(content)) {
      const closedContent = this.tryCloseBlocks(content)
      html = md.render(closedContent)
    } else {
      html = md.render(content)
    }

    html = wrapCodeBlocks(html)

    // 流式渲染时，移除末尾的 <hr> 标签
    // 原因：--- 在流式过程中被提前渲染为 <hr>，但后续内容到达后
    // 可能导致布局跳动。延迟到流式结束后再显示可避免抖动。
    // <hr> 在 HTML 中间（后有内容）则是稳定的，不受影响。
    if (isStreaming) {
      html = html.replace(/<hr\s*\/?>\s*$/i, '')
    }

    return html
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
