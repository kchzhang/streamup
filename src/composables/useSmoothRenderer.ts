/**
 * useSmoothRenderer - 平滑流式渲染 composable
 *
 * 用 requestAnimationFrame 以可控速率推进显示内容。
 * 支持段级推进：每帧推进到下一个段落边界（双换行），
 * 保证每次推进都是完整段落，避免 Markdown 渲染器在段落中间切割
 * 导致块级元素结构突变和布局跳动。
 *
 * 段级推进有搜索范围限制，避免在代码块等大段内容中
 * 一次性跳过太多字符导致推进不均匀。
 */

import { computed, ref, watch, onUnmounted, type Ref } from 'vue'
import { splitChars } from '../utils/dom'

export interface UseSmoothRendererOptions {
  /** 每帧推进的字符数，越大越快，默认 2 */
  speed?: number
  /** 是否启用平滑渲染，false 则直接跟随源内容 */
  enabled?: boolean
  /** 是否启用段级推进，true 时每帧推进到段落边界，默认 false（保持原行为） */
  paragraphMode?: boolean
  /** 完成回调 */
  onComplete?: () => void
}

export function useSmoothRenderer(
  source: Ref<string>,
  options: UseSmoothRendererOptions = {},
) {
  const speed = options.speed ?? 2
  const enabled = options.enabled ?? true
  const paragraphMode = options.paragraphMode ?? false

  const displayed = ref('')
  const isAnimating = ref(false)

  let rafId: number | null = null
  let sourceChars: string[] = []
  let charIndex = 0
  let lastSourceLength = 0

  /**
   * @deprecated 仅保留向后兼容，displayed 整体渲染已取代 confirmed + tail 分割
   * 原因：tail fade-in span 会插入到块级元素外面，
   * 下一帧 tail 被吸收进 confirmed 后又回到块级元素内部，导致布局跳动
   */
  const tail = ref('')

  /**
   * @deprecated 仅保留向后兼容，等同于 displayed
   */
  const confirmed = computed(() => {
    const t = tail.value
    if (!t) return displayed.value
    return displayed.value.slice(0, displayed.value.length - t.length)
  })

  function cancelRaf(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  /**
   * 找到下一个段落边界的位置
   * 从 from 位置开始，至少推进 minAdvance 个字符，
   * 然后在有限范围内寻找最近的 \n\n 段落边界。
   *
   * 搜索范围限制为 minAdvance * 5，避免在代码块等
   * 大段内容中跳过太多字符导致推进不均匀。
   */
  function findNextParagraphBoundary(from: number, minAdvance: number): number {
    const minTarget = from + minAdvance
    if (minTarget >= sourceChars.length) return sourceChars.length

    // 限制搜索范围，避免在代码块内跳过太多内容
    const maxSearch = Math.min(from + minAdvance * 5, sourceChars.length)

    let i = minTarget
    while (i < maxSearch) {
      if (sourceChars[i - 1] === '\n' && sourceChars[i] === '\n') {
        return i + 1
      }
      i++
    }
    // 在搜索范围内没找到段落边界，回退到逐字符推进
    return minTarget
  }

  function animate(): void {
    if (charIndex < sourceChars.length) {
      let nextIndex: number

      if (paragraphMode) {
        // 段级推进：每帧推进到下一个段落边界
        nextIndex = findNextParagraphBoundary(charIndex, speed)
      } else {
        // 逐字符推进
        nextIndex = Math.min(charIndex + speed, sourceChars.length)
      }

      displayed.value = sourceChars.slice(0, nextIndex).join('')
      charIndex = nextIndex
      isAnimating.value = true
      rafId = requestAnimationFrame(animate)
    } else {
      tail.value = ''
      isAnimating.value = false
      rafId = null
      options.onComplete?.()
    }
  }

  watch(
    source,
    (newVal) => {
      if (!enabled) {
        displayed.value = newVal
        tail.value = ''
        charIndex = splitChars(newVal).length
        lastSourceLength = newVal.length
        return
      }

      if (newVal.length > lastSourceLength) {
        const newChars = splitChars(newVal.slice(lastSourceLength))
        sourceChars = [...sourceChars, ...newChars]
        lastSourceLength = newVal.length

        if (!isAnimating.value) {
          rafId = requestAnimationFrame(animate)
        }
      } else if (newVal.length < lastSourceLength) {
        sourceChars = splitChars(newVal)
        charIndex = sourceChars.length
        displayed.value = newVal
        tail.value = ''
        lastSourceLength = newVal.length
      }
    },
    { immediate: true },
  )

  function skip(): void {
    cancelRaf()
    displayed.value = source.value
    tail.value = ''
    sourceChars = splitChars(source.value)
    charIndex = sourceChars.length
    lastSourceLength = source.value.length
    isAnimating.value = false
  }

  function reset(): void {
    cancelRaf()
    displayed.value = ''
    tail.value = ''
    sourceChars = []
    charIndex = 0
    lastSourceLength = 0
    isAnimating.value = false
  }

  onUnmounted(() => {
    cancelRaf()
  })

  return {
    displayed,
    /** @deprecated 保留向后兼容，值始终为空字符串 */
    confirmed,
    /** @deprecated 保留向后兼容，值始终为空字符串 */
    tail,
    isAnimating,
    skip,
    reset,
  }
}
