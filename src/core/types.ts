/**
 * Streams - 流式渲染组件库核心类型定义
 */

/** 渲染器接口 */
export interface StreamRenderer {
  /** 渲染内容 */
  render(content: string, isStreaming: boolean): string
}

/** 自定义块实例 */
export interface CustomBlockInstance {
  /** 块类型（如 think、action 等） */
  type: string
  /** 块内容（原始文本） */
  content: string
}

/** 自动滚动配置 */
export interface AutoScrollOptions {
  /** 是否启用自动滚动 */
  enabled: boolean
  /** 滚动行为 */
  behavior?: ScrollBehavior
  /** 滚动容器选择器或元素 */
  container?: string | HTMLElement | (() => HTMLElement | null)
  /** 距底部的距离阈值，超过此值不自动滚动 */
  threshold?: number
}

/** 虚拟滚动配置 */
export interface VirtualStreamOptions {
  /** 预估段高度（px），默认 40 */
  estimateHeight?: number
  /** 预渲染缓冲区项数，默认 5 */
  overscan?: number
  /** 是否锚定底部（流式场景推荐 true），默认 true */
  anchorToBottom?: boolean
  /** 自动滚动阈值（px），默认 80 */
  scrollThreshold?: number
  /** 自动滚动行为，默认 'smooth' */
  scrollBehavior?: ScrollBehavior
}
