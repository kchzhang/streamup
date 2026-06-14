/**
 * Streams - Vue 3 流式渲染组件库
 *
 * source 接受 string（全量）或 Ref<string>（增量流式），
 * 内置 Markdown 渲染、代码高亮、打字机效果、自动滚动等功能。
 */

// Core - FetchSSEStream（外部可独立使用的流式迭代器）
export { FetchSSEStream, FetchSSEError, createFetchSSEStream } from './core/fetchSSEStream'
export type { FetchSSEOptions, FetchSSEEvent } from './core/fetchSSEStream'

// Core types
export type {
  StreamRenderer,
  AutoScrollOptions,
  VirtualStreamOptions,
  CustomBlockInstance,
} from './core/types'

export { CUSTOM_BLOCK_RENDER_KEY, type CustomBlockRenderFn } from './core/customBlock'

// Composables
export { useSmoothRenderer } from './composables/useSmoothRenderer'
export { useVirtualStream } from './composables/useVirtualStream'
export type { VirtualStreamOptions as VirtualStreamOptionsType, ContentSegment, UseVirtualStreamReturn } from './composables/useVirtualStream'
export { splitHtmlToSegments } from './composables/useVirtualStream'

// Components
export { default as Stream } from './components/Stream.vue'
export { default as VirtualStreamContent } from './components/VirtualStreamContent.vue'
export { default as StreamSegmentRenderer } from './components/StreamSegmentRenderer.vue'

// Renderers
export { TextRenderer } from './renderers/textRenderer'
export { MarkdownRenderer } from './renderers/markdownRenderer'
export { decodeBase64 } from './renderers/markdownRenderer'
export { getHighlighter, getHighlighterSync, createMdHighlightPlugin, DEFAULT_LANGUAGES, DEFAULT_THEMES } from './renderers/highlighter'
export type { ShikiHighlighter } from './renderers/highlighter'

// Utils
export { ensureElement, escapeHtml, splitChars } from './utils/dom'
export { AutoScrollManager, isNearBottom, scrollToBottom, resolveAutoScrollOptions } from './utils/scroll'
