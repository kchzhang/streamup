/**
 * DOM 工具函数
 */

/** 创建或获取 DOM 元素 */
export function ensureElement(target: string | HTMLElement | (() => HTMLElement | null)): HTMLElement | null {
  if (typeof target === 'string') {
    return document.querySelector<HTMLElement>(target)
  }
  if (typeof target === 'function') {
    return target()
  }
  return target
}

/** 转义 HTML 特殊字符 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (m) => map[m] ?? m)
}

/** 将文本按字符拆分为数组（支持 Unicode 代理对） */
export function splitChars(text: string): string[] {
  return Array.from(text)
}
