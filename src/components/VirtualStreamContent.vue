<script setup lang="ts">
/**
 * VirtualStreamContent - 虚拟滚动流式内容组件
 *
 * 接收渲染后的 HTML 字符串，自动拆分为块级片段，
 * 使用 @tanstack/vue-virtual 仅渲染可视区域内容。
 *
 * 优化：使用 StreamSegmentRenderer 替代 v-html，
 * 对代码块段做 DOM 差量更新，消除闪烁。
 */
import { ref, computed, watch, onUnmounted } from 'vue'
import { useVirtualStream } from '../composables/useVirtualStream'
import type { VirtualStreamOptions } from '../composables/useVirtualStream'
import StreamSegmentRenderer from './StreamSegmentRenderer.vue'

const props = withDefaults(
  defineProps<{
    /** 渲染后的 HTML 内容 */
    html: string
    /** 是否锚定底部 */
    anchorToBottom?: boolean
    /** 预估段高度（px） */
    estimateHeight?: number
    /** 预渲染缓冲区项数 */
    overscan?: number
    /** 自动滚动阈值（px） */
    scrollThreshold?: number
    /** 内容样式类 */
    contentClass?: string
  }>(),
  {
    anchorToBottom: true,
    estimateHeight: 40,
    overscan: 5,
    scrollThreshold: 80,
    contentClass: '',
  },
)

const containerRef = ref<HTMLElement | null>(null)
const containerHeight = ref<number>(0)
let resizeObserver: ResizeObserver | null = null
const htmlRef = computed(() => props.html)

const virtualStreamOptions = computed<VirtualStreamOptions>(() => ({
  estimateHeight: props.estimateHeight,
  overscan: props.overscan,
  anchorToBottom: props.anchorToBottom,
  scrollThreshold: props.scrollThreshold,
}))

const {
  segments,
  virtualItems,
  totalSize,
  measureElement,
  scrollToBottom,
  isUserScrolledAway,
} = useVirtualStream(htmlRef, containerRef, virtualStreamOptions.value)

// ── 动态监听父容器高度 ──
watch(containerRef, (el) => {
  resizeObserver?.disconnect()
  if (el?.parentElement) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerHeight.value = entry.contentBoxSize[0]?.blockSize ?? entry.contentRect.height
      }
    })
    resizeObserver.observe(el.parentElement)
  }
}, { immediate: true })

onUnmounted(() => {
  resizeObserver?.disconnect()
})

defineExpose({
  scrollToBottom,
  containerRef,
  isUserScrolledAway,
})
</script>

<template>
  <div
    ref="containerRef"
    class="streams-virtual-scroll"
    :style="containerHeight ? { height: `${containerHeight}px` } : undefined"
  >
    <div
      :style="{
        height: `${totalSize}px`,
        width: '100%',
        position: 'relative',
      }"
    >
      <div
        v-for="item in virtualItems"
        :key="String(item.key)"
        :ref="(el) => measureElement(el as Element | null)"
        :data-index="item.index"
        :class="contentClass"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${item.start}px)`,
        }"
      >
        <StreamSegmentRenderer
          :html="segments[item.index]?.html ?? ''"
          :index="item.index"
        />
      </div>
    </div>
  </div>
</template>

<style>
.streams-virtual-scroll {
  overflow-y: auto;
  padding-right: 20px;
}

/* 渲染隔离：段变化不影响兄弟段 */
.streams-virtual-scroll .stream-segment {
  contain: content;
}

/* 代码块防闪烁：确保未高亮时文字颜色与背景一致 */
.streams-virtual-scroll pre code {
  color: #d4d4d4;
}
</style>
