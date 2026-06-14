<script setup lang="ts">
/**
 * StreamSegmentRenderer - 段级 DOM 差量渲染组件
 *
 * 核心优化：
 * - 代码块：保留 DOM 结构，只更新 <code> 内部文本（增量追加）
 * - 通用段：如果新 HTML 以旧 HTML 开头，只追加差异 DOM 节点
 * - 消除虚拟列表滚动/流式更新时的 DOM 销毁重建闪烁
 */
import { ref, watch, onMounted } from 'vue'

const props = defineProps<{
  /** 段 HTML 内容 */
  html: string
  /** 段索引 */
  index: number
}>()

const segmentRef = ref<HTMLElement | null>(null)

/** 当前已渲染的 HTML，用于跳过无变化更新 */
let renderedHtml = ''

/** 判断 HTML 是否是代码块 */
function isCodeBlock(html: string): boolean {
  return html.includes('<pre') && html.includes('language-')
}

/**
 * 判断两段代码块 HTML 是否只是内部文本增量变化（结构不变）
 * 策略：比较 <pre> 和 <code> 的开标签是否相同
 */
function isCodeBlockContentChange(oldHtml: string, newHtml: string): boolean {
  // 提取 <pre ...> 开标签
  const oldPreTag = oldHtml.match(/^<pre[^>]*>/)?.[0]
  const newPreTag = newHtml.match(/^<pre[^>]*>/)?.[0]
  if (oldPreTag !== newPreTag) return false

  // 提取 <code ...> 开标签
  const oldCodeTag = oldHtml.match(/<code[^>]*>/)?.[0]
  const newCodeTag = newHtml.match(/<code[^>]*>/)?.[0]
  if (oldCodeTag !== newCodeTag) return false

  return true
}

/**
 * 代码块增量修补：流式场景下只追加差异部分，避免全量 innerHTML 导致跳动
 */
function patchCodeBlock(container: HTMLElement, newHtml: string): void {
  const codeEl = container.querySelector('code')
  if (!codeEl) {
    container.innerHTML = newHtml
    return
  }

  const codeContentMatch = newHtml.match(/<code[^>]*>([\s\S]*)<\/code>/)
  if (!codeContentMatch) {
    container.innerHTML = newHtml
    return
  }

  const newContent = codeContentMatch?.[1]
  if (!newContent) {
    container.innerHTML = newHtml
    return
  }

  const oldContent = codeEl.innerHTML

  // 真正增量：如果新内容以旧内容开头（流式追加），只 append 差异
  if (newContent.startsWith(oldContent) && oldContent.length > 0) {
    const delta = newContent.slice(oldContent.length)
    if (delta) {
      const temp = document.createElement('div')
      temp.innerHTML = delta
      while (temp.firstChild) {
        codeEl.appendChild(temp.firstChild)
      }
    }
  } else {
    // 非追加场景（如语法高亮重解析导致结构变化）：全量替换
    codeEl.innerHTML = newContent
  }
}

/**
 * 通用增量修补：如果新 HTML 以旧 HTML 开头，只追加差异 DOM 节点
 * 适用于 <p>、<ul>、<blockquote> 等普通段落的流式追加场景
 */
function tryIncrementalPatch(container: HTMLElement, oldHtml: string, newHtml: string): boolean {
  if (!oldHtml || oldHtml.length === 0) return false

  // 新 HTML 以旧 HTML 开头 → 纯追加场景
  if (newHtml.startsWith(oldHtml)) {
    const delta = newHtml.slice(oldHtml.length)
    if (delta) {
      const temp = document.createElement('div')
      temp.innerHTML = delta
      while (temp.firstChild) {
        container.appendChild(temp.firstChild)
      }
    }
    return true
  }

  // 尝试提取标签结构做更精细的增量比对
  // 例如 <p>old</p> → <p>old+new</p>，标签不变只内容追加
  const oldTagMatch = oldHtml.match(/^<(\w+)([^>]*)>([\s\S]*)<\/\1>$/)
  const newTagMatch = newHtml.match(/^<(\w+)([^>]*)>([\s\S]*)<\/\1>$/)
  if (oldTagMatch && newTagMatch && oldTagMatch[1] === newTagMatch[1] && oldTagMatch[2] === newTagMatch[2]) {
    const oldInner = oldTagMatch[3] ?? ''
    const newInner = newTagMatch[3] ?? ''
    if (newInner.startsWith(oldInner) && oldInner.length > 0) {
      const delta = newInner.slice(oldInner.length)
      if (delta) {
        // 找到容器内的第一个子元素，更新其 innerHTML
        const firstChild = container.firstElementChild
        if (firstChild) {
          const temp = document.createElement('div')
          temp.innerHTML = delta
          while (temp.firstChild) {
            firstChild.appendChild(temp.firstChild)
          }
        } else {
          // 没有子元素，直接追加到容器
          const temp = document.createElement('div')
          temp.innerHTML = delta
          while (temp.firstChild) {
            container.appendChild(temp.firstChild)
          }
        }
      }
      return true
    }
  }

  return false
}

onMounted(() => {
  if (segmentRef.value && props.html) {
    segmentRef.value.innerHTML = props.html
    renderedHtml = props.html
  }
})

watch(() => props.html, (newHtml) => {
  const el = segmentRef.value
  if (!el) return

  // 跳过无变化更新
  if (newHtml === renderedHtml) return

  const wasCodeBlock = isCodeBlock(renderedHtml)
  const isCode = isCodeBlock(newHtml)

  if (isCode && wasCodeBlock && isCodeBlockContentChange(renderedHtml, newHtml)) {
    // 代码块增量更新：保留 DOM 结构，只更新 code 内部文本
    patchCodeBlock(el, newHtml)
  } else if (!isCode && !wasCodeBlock) {
    // 通用段增量修补：尝试只追加差异 DOM 节点
    if (!tryIncrementalPatch(el, renderedHtml, newHtml)) {
      // 无法增量修补（结构变化），全量替换
      el.innerHTML = newHtml
    }
  } else {
    // 代码块 ↔ 非代码块切换 / 首次渲染：直接设置 innerHTML
    el.innerHTML = newHtml
  }

  renderedHtml = newHtml
})
</script>

<template>
  <div ref="segmentRef" class="stream-segment" />
</template>

<style>
.stream-segment {
  contain: content;
}
</style>
