/**
 * useVirtualStream - 虚拟滚动流式渲染 composable
 *
 * 基于 @tanstack/vue-virtual 实现长内容的虚拟滚动，
 * 将渲染后的 HTML 拆分为段落级片段，仅渲染可视区域。
 *
 * 核心特性：
 * - 增量式 HTML 段拆分：复用未变化段的对象引用，避免 Vue 不必要的 DOM 更新
 * - RAF 节流：与显示器刷新率对齐，避免每帧多次渲染
 * - 动态测量片段高度（measureElement）
 * - 流式场景锚定底部（anchorTo: 'end'）
 * - 用户上滚时不干扰，回到底部时恢复跟随
 */

import { ref, computed, watch, onUnmounted, type Ref, type ComputedRef } from 'vue'
import { useVirtualizer, type Virtualizer } from '@tanstack/vue-virtual'

/** 虚拟滚动配置 */
export interface VirtualStreamOptions {
  /** 预估段高度（px），默认 40 */
  estimateHeight?: number
  /** 预渲染缓冲区项数，默认 5 */
  overscan?: number
  /** 是否锚定底部（流式场景推荐 true），默认 true */
  anchorToBottom?: boolean
  /** 自动滚动阈值（px），超出此距离视为用户主动上滚，默认 80 */
  scrollThreshold?: number
  /** 自动滚动行为，默认 'smooth' */
  scrollBehavior?: ScrollBehavior
}

/** 内容片段 */
export interface ContentSegment {
  /** 片段 HTML */
  html: string
  /** 片段索引 */
  index: number
  /** 片段唯一 key */
  key: string
}

/** 虚拟项类型 */
type VirtualItem = { index: number; key: string | number | bigint; start: number; size: number; end: number }

/** useVirtualStream 返回值 */
export interface UseVirtualStreamReturn {
  /** 拆分后的内容片段 */
  segments: ComputedRef<ContentSegment[]>
  /** 虚拟化器实例 */
  virtualizer: Ref<Virtualizer<HTMLElement, Element>>
  /** 当前可视的虚拟项 */
  virtualItems: ComputedRef<VirtualItem[]>
  /** 内容总高度（px） */
  totalSize: ComputedRef<number>
  /** 测量元素实际高度（用作 :ref 回调） */
  measureElement: (el: Element | null | undefined) => void
  /** 滚动到底部 */
  scrollToBottom: (behavior?: ScrollBehavior) => void
  /** 用户是否主动上滚 */
  isUserScrolledAway: Ref<boolean>
}

/** 默认配置 */
const DEFAULT_OPTIONS: Required<VirtualStreamOptions> = {
  estimateHeight: 40,
  overscan: 5,
  anchorToBottom: true,
  scrollThreshold: 80,
  scrollBehavior: 'smooth',
}

// ── 增量式段拆分缓存 ──
let cachedHtml = ''
let cachedSegments: ContentSegment[] = []

/**
 * 将渲染后的 HTML 拆分为块级片段（增量式）
 *
 * 与全量拆分不同，此函数会缓存上一次的结果，
 * 对 HTML 字符串未变化的段复用旧对象引用，
 * 使 Vue 的响应式系统跳过未变化段的 DOM 更新。
 *
 * 流式场景下，前 N-1 个段通常不变，仅末尾段更新，
 * 因此增量复用可以大幅减少 v-html / 组件更新次数。
 */
function splitHtmlSegmentsIncremental(html: string): ContentSegment[] {
  if (!html?.trim()) {
    if (!cachedHtml) return []
    cachedHtml = ''
    cachedSegments = []
    return []
  }

  // 快速路径：HTML 完全相同则直接返回缓存
  if (html === cachedHtml) return cachedSegments

  // 解析新 HTML
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html

  const newRawSegments: { html: string }[] = []
  let idx = 0

  for (const child of Array.from(wrapper.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      newRawSegments.push({ html: (child as HTMLElement).outerHTML })
      idx++
    } else if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent
      if (text?.trim()) {
        newRawSegments.push({ html: text })
        idx++
      }
    }
  }

  // 增量复用：相同 HTML 字符串的段保持对象引用不变
  const result: ContentSegment[] = []
  const minLen = Math.min(cachedSegments.length, newRawSegments.length)

  for (let i = 0; i < newRawSegments.length; i++) {
    const raw = newRawSegments[i]!
    const prev = i < minLen ? cachedSegments[i] : null
    if (prev && prev.html === raw.html) {
      // HTML 未变，复用旧对象引用 → Vue 不触发子组件更新
      result.push(prev)
    } else {
      result.push({
        html: raw.html,
        index: i,
        key: `seg-${i}`,
      })
    }
  }

  cachedHtml = html
  cachedSegments = result
  return result
}

/**
 * 虚拟滚动流式渲染 composable
 *
 * @param html - 响应式渲染后 HTML 字符串
 * @param containerRef - 滚动容器元素引用
 * @param options - 虚拟滚动配置
 */
export function useVirtualStream(
  html: Ref<string>,
  containerRef: Ref<HTMLElement | null>,
  options: VirtualStreamOptions = {},
): UseVirtualStreamReturn {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // ── RAF 节流：确保每帧最多更新一次 ──
  const throttledHtml = ref(html.value)
  let rafId: number | null = null
  let lastHtml = html.value

  watch(html, (val) => {
    lastHtml = val
    if (!rafId) {
      rafId = requestAnimationFrame(() => {
        throttledHtml.value = lastHtml
        rafId = null
      })
    }
  }, { immediate: true })

  // ── HTML → 段落拆分（增量式） ──
  const segments = computed<ContentSegment[]>(() => {
    return splitHtmlSegmentsIncremental(throttledHtml.value)
  })

  // ── 虚拟化器 ──
  const virtualizer = useVirtualizer(
    computed(() => ({
      count: segments.value.length,
      getScrollElement: () => containerRef.value,
      estimateSize: (index: number) => {
        const seg = segments.value[index]
        if (!seg) return opts.estimateHeight
        // 代码块：基于换行数估算行数 × 行高
        if (seg.html.includes('<pre')) {
          const lineCount = Math.max((seg.html.match(/\n/g) || []).length, 2)
          return lineCount * 21 + 32 // 21px 行高 + 上下 padding
        }
        // 标题给予较小估算高度
        if (/<h[1-3][> ]/.test(seg.html)) return opts.estimateHeight * 1.5
        // 表格给予更大估算高度
        if (seg.html.includes('<table')) return opts.estimateHeight * 4
        return opts.estimateHeight
      },
      overscan: opts.overscan,
      // 流式场景锚定底部
      anchorTo: opts.anchorToBottom ? 'end' as const : 'start' as const,
    })),
  )

  // ── 虚拟项 & 总高度 ──
  const virtualItems = computed<VirtualItem[]>(() => virtualizer.value.getVirtualItems() as VirtualItem[])
  const totalSize = computed(() => virtualizer.value.getTotalSize())

  // ── 自动滚动状态 ──
  const isUserScrolledAway = ref(false)
  let scrollHandler: (() => void) | null = null

  function bindScrollListener() {
    const el = containerRef.value
    if (!el) return

    scrollHandler = () => {
      if (!el) return
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      isUserScrolledAway.value = distanceFromBottom > opts.scrollThreshold
    }
    el.addEventListener('scroll', scrollHandler, { passive: true })
  }

  function unbindScrollListener() {
    if (containerRef.value && scrollHandler) {
      containerRef.value.removeEventListener('scroll', scrollHandler)
    }
    scrollHandler = null
  }

  // ── 内容变化时自动跟随滚动 ──
  watch(throttledHtml, () => {
    if (!opts.anchorToBottom || isUserScrolledAway.value) return
    // 延迟一帧，确保虚拟化器已更新布局
    requestAnimationFrame(() => {
      const count = segments.value.length
      if (count > 0) {
        virtualizer.value.scrollToIndex(count - 1, { align: 'end', behavior: opts.scrollBehavior })
      }
    })
  })

  // ── 绑定容器 ──
  watch(containerRef, (el) => {
    unbindScrollListener()
    if (el) bindScrollListener()
  }, { immediate: true })

  onUnmounted(() => {
    unbindScrollListener()
    // 清理 RAF
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    // 清理段拆分缓存
    cachedHtml = ''
    cachedSegments = []
  })

  // ── 测量元素 ──
  function measureElement(el: Element | null | undefined): void {
    if (!el) return
    virtualizer.value.measureElement(el)
  }

  // ── 滚动到底部 ──
  function scrollToBottom(behavior?: ScrollBehavior): void {
    const el = containerRef.value
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: behavior ?? opts.scrollBehavior })
    isUserScrolledAway.value = false
  }

  return {
    segments,
    virtualizer,
    virtualItems,
    totalSize,
    measureElement,
    scrollToBottom,
    isUserScrolledAway,
  }
}
