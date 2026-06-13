<script setup lang="ts">
/**
 * Stream - Markdown 流式渲染组件
 *
 * source 接受两种类型：
 * - string: 全量内容，一次性渲染完成
 * - Ref<string>: 增量内容，watch 变化实时流式渲染
 *
 * 支持平滑渲染、虚拟滚动（长内容性能优化）、自动滚动。
 */
import { computed, ref, watch, onMounted, isRef } from 'vue'
import { useSmoothRenderer } from '../composables/useSmoothRenderer'
import { MarkdownRenderer } from '../renderers/markdownRenderer'
import { TextRenderer } from '../renderers/textRenderer'
import { AutoScrollManager } from '../utils/scroll'
import VirtualStreamContent from './VirtualStreamContent.vue'
import type { VirtualStreamOptions } from '../core/types'
import type { Ref } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Markdown 内容：string 为全量，Ref<string> 为增量流式 */
    source?: string | Ref<string>
    /** 是否仍在流式中（仅 source 为 Ref<string> 时生效） */
    streaming?: boolean
    /** 平滑渲染速度（每帧推进字符数），0 表示禁用，默认 2 */
    smoothSpeed?: number
    /** 是否自动滚动 */
    autoScroll?: boolean
    /** 是否启用虚拟滚动，传入对象可配置选项 */
    virtual?: boolean | VirtualStreamOptions
  }>(),
  {
    streaming: false,
    smoothSpeed: 2,
    autoScroll: true,
    virtual: false,
  },
)

const emit = defineEmits<{
  complete: []
  error: [error: Error]
}>()

const containerRef = ref<HTMLElement | null>(null)
const virtualContentRef = ref<InstanceType<typeof VirtualStreamContent> | null>(null)

// ── 判断 source 类型 ──
const isRefSource = computed(() => isRef(props.source))

// ── 获取原始内容 ──
const rawContent = computed(() => {
  if (isRefSource.value) return (props.source as Ref<string>).value
  return (props.source as string) ?? ''
})

// ── isStreaming ──
const isStreaming = computed(() => {
  if (!isRefSource.value) return false
  return props.streaming
})

// ── 平滑渲染（仅增量模式启用）──
const smoothSource = computed(() => isRefSource.value ? rawContent.value : '')
const smoothRenderer = useSmoothRenderer(smoothSource, {
  speed: props.smoothSpeed,
  enabled: isRefSource.value && props.smoothSpeed > 0,
})

// ── 最终显示内容 ──
const displayContent = computed(() => {
  if (!isRefSource.value) return rawContent.value
  return props.smoothSpeed > 0 ? smoothRenderer.displayed.value : rawContent.value
})

// ── Markdown 渲染 ──
const mdReadyVersion = ref(0)
const textRenderer = new TextRenderer()
const mdRenderer = new MarkdownRenderer()
mdRenderer.setFallback(textRenderer)
mdRenderer.onReady(() => {
  mdReadyVersion.value++
})

const renderedContent = computed(() => {
  void mdReadyVersion.value
  return mdRenderer.render(displayContent.value, isStreaming.value)
})

onMounted(() => {
  mdRenderer.preload()
})

// ── 虚拟滚动配置 ──
const isVirtualEnabled = computed(() => !!props.virtual)

const resolvedVirtualOptions = computed<VirtualStreamOptions>(() => {
  if (typeof props.virtual === 'object') {
    return { anchorToBottom: props.autoScroll, ...props.virtual }
  }
  return { anchorToBottom: props.autoScroll }
})

// ── 自动滚动（非虚拟模式）──
const scrollManager = new AutoScrollManager(isVirtualEnabled.value ? false : props.autoScroll)

watch(containerRef, (el) => {
  if (el) scrollManager.bind(el)
}, { immediate: true })

watch(renderedContent, () => {
  if (!isVirtualEnabled.value) {
    scrollManager.tryScroll()
  }
})

// ── 监听 streaming 变为 false 时触发 complete ──
watch(isStreaming, (val, oldVal) => {
  if (oldVal && !val) {
    emit('complete')
  }
})

defineExpose({
  skipSmooth: smoothRenderer.skip,
  scrollToBottom: () => {
    if (isVirtualEnabled.value) {
      virtualContentRef.value?.scrollToBottom()
    } else {
      scrollManager.tryScroll()
    }
  },
  reset: smoothRenderer.reset,
  content: displayContent,
  isStreaming,
})
</script>

<template>
  <div
    ref="containerRef"
    :class="['streams-markdown', isStreaming ? 'streams-status-streaming' : rawContent ? 'streams-status-completed' : 'streams-status-idle']"
  >
    <!-- 虚拟滚动渲染 -->
    <VirtualStreamContent
      v-if="isVirtualEnabled"
      ref="virtualContentRef"
      :html="renderedContent"
      :anchor-to-bottom="resolvedVirtualOptions.anchorToBottom"
      :estimate-height="resolvedVirtualOptions.estimateHeight"
      :overscan="resolvedVirtualOptions.overscan"
      :scroll-threshold="resolvedVirtualOptions.scrollThreshold"
      content-class="streams-md-content"
    />

    <!-- 传统渲染 -->
    <template v-else>
      <div
        class="streams-md-content"
        v-html="renderedContent"
      />
    </template>
  </div>
</template>

<style>
/* ── Markdown 模式 ── */
.streams-markdown {
  position: relative;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.7;
  word-break: break-word;
  overflow: hidden;
}

.streams-md-content {
  min-height: 1em;
}

.streams-md-content p {
  margin: 0.5em 0;
}

.streams-md-content .streams-code-wrapper {
  background: #f6f8fa;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  margin: 0.5em 0;
  overflow: hidden;
}

.streams-md-content .streams-code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: #f6f8fa;
  border-bottom: 1px solid #d0d7de;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 12px;
  color: #1f2328;
}

.streams-md-content .streams-code-lang {
  font-weight: 600;
}

.streams-md-content .streams-code-wrapper pre {
  background: #f6f8fa;
  border: none;
  border-radius: 0;
  padding: 16px;
  margin: 0;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
  font-size: 0.85em;
  line-height: 1.5;
}

.streams-md-content pre {
  background: #f6f8fa;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  padding: 16px;
  overflow-x: auto;
  margin: 0.5em 0;
  font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
  font-size: 0.85em;
  line-height: 1.5;
}

.streams-md-content code {
  background: rgba(175, 184, 193, 0.2);
  border-radius: 6px;
  padding: 0.2em 0.4em;
  font-size: 0.85em;
  font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
}

.streams-md-content pre code {
  background: none;
  border: none;
  padding: 0;
  font-size: inherit;
}

.streams-md-content ul,
.streams-md-content ol {
  padding-left: 1.5em;
  margin: 0.5em 0;
}

.streams-md-content blockquote {
  border-left: 4px solid #ddd;
  margin: 0.5em 0;
  padding: 0.25em 1em;
  color: #666;
}

.streams-md-content h1,
.streams-md-content h2,
.streams-md-content h3,
.streams-md-content h4,
.streams-md-content h5,
.streams-md-content h6 {
  margin: 0.8em 0 0.4em;
  line-height: 1.3;
}

.streams-md-content a {
  color: #4a90d9;
  text-decoration: none;
}

.streams-md-content a:hover {
  text-decoration: underline;
}

.streams-md-content table {
  border-collapse: collapse;
  margin: 0.5em 0;
  width: 100%;
}

.streams-md-content th,
.streams-md-content td {
  border: 1px solid #ddd;
  padding: 6px 12px;
  text-align: left;
}
</style>
