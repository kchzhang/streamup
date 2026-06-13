/**
 * 自动滚动工具
 */

import { ensureElement } from './dom'
import type { AutoScrollOptions } from '../core/types'

/** 解析自动滚动配置 */
export function resolveAutoScrollOptions(options: boolean | AutoScrollOptions | undefined): Required<AutoScrollOptions> {
  const defaults: Required<AutoScrollOptions> = {
    enabled: true,
    behavior: 'smooth',
    container: undefined as unknown as string | HTMLElement | (() => HTMLElement | null),
    threshold: 100,
  }
  if (!options) return { ...defaults, enabled: false }
  if (options === true) return defaults
  return { ...defaults, ...options }
}

/** 检查是否在底部附近 */
export function isNearBottom(container: HTMLElement, threshold = 100): boolean {
  const { scrollTop, scrollHeight, clientHeight } = container
  return scrollHeight - scrollTop - clientHeight <= threshold
}

/** 滚动到底部 */
export function scrollToBottom(container: HTMLElement, behavior: ScrollBehavior = 'smooth'): void {
  container.scrollTo({
    top: container.scrollHeight,
    behavior,
  })
}

/** 自动滚动管理器 */
export class AutoScrollManager {
  private container: HTMLElement | null = null
  private options: Required<AutoScrollOptions>
  private userScrolled = false
  private handleUserScroll: (() => void) | null = null

  constructor(options: boolean | AutoScrollOptions | undefined) {
    this.options = resolveAutoScrollOptions(options)
  }

  /** 绑定滚动容器 */
  bind(containerOrSelector: string | HTMLElement | (() => HTMLElement | null)): void {
    this.unbind()
    this.container = ensureElement(containerOrSelector)
    if (!this.container) return

    this.userScrolled = false
    this.handleUserScroll = () => {
      if (!this.container) return
      this.userScrolled = !isNearBottom(this.container, this.options.threshold)
    }
    this.container.addEventListener('scroll', this.handleUserScroll, { passive: true })
  }

  /** 解绑滚动容器 */
  unbind(): void {
    if (this.container && this.handleUserScroll) {
      this.container.removeEventListener('scroll', this.handleUserScroll)
    }
    this.container = null
    this.handleUserScroll = null
    this.userScrolled = false
  }

  /** 尝试自动滚动 */
  tryScroll(): void {
    if (!this.options.enabled || !this.container || this.userScrolled) return
    scrollToBottom(this.container, this.options.behavior)
  }

  /** 更新配置 */
  updateOptions(options: boolean | AutoScrollOptions | undefined): void {
    this.options = resolveAutoScrollOptions(options)
  }

  /** 销毁 */
  destroy(): void {
    this.unbind()
  }
}
