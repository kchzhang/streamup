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
import { computed, ref, watch, onMounted, isRef, provide, useSlots, defineComponent, type Component } from 'vue'
import { useSmoothRenderer } from '../composables/useSmoothRenderer'
import { MarkdownRenderer } from '../renderers/markdownRenderer'
import { TextRenderer } from '../renderers/textRenderer'
import { AutoScrollManager } from '../utils/scroll'
import VirtualStreamContent from './VirtualStreamContent.vue'
import { CUSTOM_BLOCK_RENDER_KEY, type CustomBlockRenderFn } from '../core/customBlock'
import { splitHtmlToSegments } from '../composables/useVirtualStream'
import type { VirtualStreamOptions } from '../core/types'
import type { CustomBlockInstance } from '../core/types'
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
    /** 自定义块类型列表（如 ['think', 'action']） */
    customBlocks?: string[]
  }>(),
  {
    streaming: false,
    smoothSpeed: 2,
    autoScroll: true,
    virtual: false,
    customBlocks: () => [],
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
const mdRenderer = new MarkdownRenderer(props.customBlocks)
mdRenderer.setFallback(textRenderer)
mdRenderer.onReady(() => {
  mdReadyVersion.value++
})

const renderedContent = computed(() => {
  void mdReadyVersion.value
  return mdRenderer.render(displayContent.value, isStreaming.value)
})

// ── 自定义块插槽渲染组件 ──
const slots = useSlots()

// 缓存组件定义，避免 computed 每次重算时创建新对象导致 <component :is> 反复卸载/挂载
const componentCache = new Map<string, Component>()

function getOrCreateBlockComponent(blockType: string): Component {
  if (!componentCache.has(blockType)) {
    componentCache.set(blockType, defineComponent({
      name: `StreamsCustomBlock_${blockType}`,
      props: { block: { type: Object as () => CustomBlockInstance, required: true } },
      setup(props) {
        // 渲染时动态访问 slots，确保始终使用最新的 slot 函数
        return () => {
          const slot = slots[blockType]
          return slot ? slot(props.block) : null
        }
      },
    }))
  }
  return componentCache.get(blockType)!
}

const customBlockRenders = computed<Record<string, Component>>(() => {
  const result: Record<string, Component> = {}
  for (const blockType of props.customBlocks) {
    result[blockType] = getOrCreateBlockComponent(blockType)
  }
  return result
})

provide(CUSTOM_BLOCK_RENDER_KEY, customBlockRenders)

// ── 传统渲染路径：混合段拆分 ──
const traditionalSegments = computed(() => {
  if (!props.customBlocks.length) return null
  return splitHtmlToSegments(renderedContent.value)
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
      <!-- 有自定义块时：混合段渲染 -->
      <template v-if="traditionalSegments">
        <template v-for="seg in traditionalSegments" :key="seg.key">
          <div
            v-if="seg.type === 'html'"
            class="streams-md-content"
            v-html="seg.html"
          />
          <component
            v-else-if="seg.type === 'custom-block' && seg.block && customBlockRenders[seg.block.type]"
            :is="customBlockRenders[seg.block.type]"
            :block="seg.block"
          />
        </template>
      </template>
      <!-- 无自定义块时：原始 v-html -->
      <div
        v-else
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
