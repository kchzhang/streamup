/**
 * 文本渲染器 - 转义 HTML 并保留换行
 */

import { escapeHtml } from '../utils/dom'
import type { StreamRenderer } from '../core/types'

export class TextRenderer implements StreamRenderer {
  render(content: string, _isStreaming: boolean): string {
    return escapeHtml(content).replace(/\n/g, '<br>')
  }
}
