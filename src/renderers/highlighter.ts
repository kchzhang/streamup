/**
 * 共享 Shiki 高亮器模块
 *
 * 提供单例 shiki highlighter，供 MarkdownRenderer 复用，
 * 同时封装 @shikijs/markdown-it 的 markdown-it 插件集成。
 */

/** Shiki 高亮器类型（避免硬依赖） */
export interface ShikiHighlighter {
  codeToHtml(code: string, options: { lang: string; theme: string }): string
  getLoadedLanguages(): string[]
}

let highlighterInstance: ShikiHighlighter | null = null
let highlighterLoadPromise: Promise<ShikiHighlighter | null> | null = null

export const DEFAULT_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'java',
  'go',
  'rust',
  'css',
  'html',
  'json',
  'bash',
  'markdown',
  'vue',
  'yaml',
  'sql',
  'shell',
]

export const DEFAULT_THEMES = ['github-dark', 'github-light']

/** 懒加载 shiki highlighter（单例） */
export async function getHighlighter(): Promise<ShikiHighlighter | null> {
  if (highlighterInstance) return highlighterInstance
  if (highlighterLoadPromise) return highlighterLoadPromise

  highlighterLoadPromise = (async () => {
    try {
      const { createHighlighter } = await import('shiki')
      highlighterInstance = await createHighlighter({
        themes: DEFAULT_THEMES,
        langs: DEFAULT_LANGUAGES,
      })
      return highlighterInstance
    } catch {
      console.warn('[streams] shiki not installed, falling back to plain code')
      return null
    }
  })()

  return highlighterLoadPromise
}

/** 同步获取已加载的 shiki highlighter 实例 */
export function getHighlighterSync(): ShikiHighlighter | null {
  return highlighterInstance
}

/**
 * 创建 markdown-it 代码高亮插件
 *
 * 使用 @shikijs/markdown-it 的 fromHighlighter 将共享的 shiki highlighter
 * 注入 markdown-it 渲染管线，使 markdown 中的代码块自动获得语法高亮。
 *
 * @returns markdown-it 插件函数，若 shiki 未安装则返回 null
 */
export async function createMdHighlightPlugin(): Promise<((md: any) => void) | null> {
  const highlighter = await getHighlighter()
  if (!highlighter) return null

  try {
    const { fromHighlighter } = await import('@shikijs/markdown-it')
    return fromHighlighter(highlighter as any, {
      themes: { dark: 'github-dark', light: 'github-light' },
      fallbackLanguage: 'plaintext' as any,
    })
  } catch {
    console.warn('[streams] @shikijs/markdown-it not installed, code blocks in markdown will not be highlighted')
    return null
  }
}
