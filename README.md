# StreamUp

Vue 3 流式 Markdown 渲染组件库 — 专为流式数据实时输出而设计。

## 特性

- 🌊 **多数据源支持** — Fetch SSE / WebSocket / 自定义 AsyncIterable
- 📝 **增量 Markdown 渲染** — 基于 markdown-it，流式期间自动闭合未完成的结构
- 🎨 **代码语法高亮** — 基于 shiki，懒加载 + 降级回退
- 📜 **自动滚动** — 智能检测用户滚动，避免强制跳转
- ⚡ **RAF 批量更新** — 高频数据块合并后再触发响应式更新
- 🧩 **组合式 API** — useSmoothRenderer / useVirtualStream 等 composable
- 🧱 **自定义块** — 支持 think / action 等自定义块类型，通过插槽渲染
- 🪶 **零硬依赖** — markdown-it、shiki、@tanstack/vue-virtual 为可选 peerDependencies

## 安装

```bash
npm install @knoxzhang/streamup
# 可选依赖（按需安装）
npm install markdown-it shiki @shikijs/markdown-it @tanstack/vue-virtual
```

## 快速开始

### 组件方式

```vue
<template>
  <Stream :source="content" :streaming="isStreaming" auto-scroll />
</template>

<script setup>
import { ref } from 'vue'
import { Stream, FetchSSEStream } from '@knoxzhang/streamup'

const content = ref('')
const isStreaming = ref(true)

const stream = new FetchSSEStream({
  url: '/api/chat',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: 'Hello' }),
})

;(async () => {
  for await (const event of stream) {
    content.value += event.content
  }
  isStreaming.value = false
})()
</script>
```

### 虚拟滚动（长内容性能优化）

```vue
<template>
  <Stream :source="content" :streaming="isStreaming" :virtual="{ estimateHeight: 40, overscan: 5 }" />
</template>
```

### 自定义块（think / action 等）

```vue
<template>
  <Stream :source="content" :streaming="isStreaming" :custom-blocks="['think']">
    <template #think="{ content }">
      <div class="think-block">{{ content }}</div>
    </template>
  </Stream>
</template>
```

## API

### 组件 `<Stream>`

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `source` | `string \| Ref<string>` | — | Markdown 内容：string 为全量，Ref\<string\> 为增量流式 |
| `streaming` | `boolean` | `false` | 是否仍在流式中（仅 source 为 Ref\<string\> 时生效） |
| `smoothSpeed` | `number` | `2` | 平滑渲染速度（每帧推进字符数），0 表示禁用 |
| `autoScroll` | `boolean` | `true` | 是否自动滚动 |
| `virtual` | `boolean \| VirtualStreamOptions` | `false` | 是否启用虚拟滚动，传入对象可配置选项 |
| `customBlocks` | `string[]` | `[]` | 自定义块类型列表（如 `['think', 'action']`） |

| Event | 参数 | 说明 |
|-------|------|------|
| `complete` | — | 流式结束时触发 |
| `error` | `error: Error` | 发生错误时触发 |

| Expose 方法 | 说明 |
|-------------|------|
| `skipSmooth()` | 跳过平滑渲染，直接显示全部内容 |
| `scrollToBottom()` | 滚动到底部 |
| `reset()` | 重置平滑渲染状态 |
| `content` | 当前显示内容（computed） |
| `isStreaming` | 是否正在流式（computed） |

### `<VirtualStreamContent>` / `<StreamSegmentRenderer>`

内部组件，由 `<Stream>` 在虚拟滚动模式下自动使用。也可直接导入用于自定义渲染场景。

### Composables

#### `useSmoothRenderer(source, options?)`

平滑流式渲染，基于 requestAnimationFrame 以可控速率推进显示内容。

```ts
import { useSmoothRenderer } from '@knoxzhang/streamup'

const { displayed, isAnimating, skip, reset } = useSmoothRenderer(sourceRef, {
  speed: 2,        // 每帧推进字符数
  enabled: true,   // 是否启用
  paragraphMode: false, // 段级推进（每帧推进到段落边界）
  onComplete: () => {}, // 完成回调
})
```

#### `useVirtualStream(html, containerRef, options?)`

虚拟滚动流式渲染，基于 @tanstack/vue-virtual。

```ts
import { useVirtualStream } from '@knoxzhang/streamup'

const {
  segments,        // 拆分后的内容片段
  virtualizer,     // 虚拟化器实例
  virtualItems,    // 当前可视虚拟项
  totalSize,       // 内容总高度
  measureElement,  // 测量元素实际高度
  scrollToBottom,  // 滚动到底部
  isUserScrolledAway, // 用户是否主动上滚
} = useVirtualStream(htmlRef, containerRef, {
  estimateHeight: 40,
  overscan: 5,
  anchorToBottom: true,
  scrollThreshold: 80,
  scrollBehavior: 'smooth',
})
```

### Core

#### `FetchSSEStream`

框架无关的 Fetch + SSE 流式迭代器（AsyncIterable），默认支持 OpenAI 格式。

```ts
import { FetchSSEStream, FetchSSEError } from '@knoxzhang/streamup'

const stream = new FetchSSEStream({
  url: '/api/chat',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: 'Hello' }),
  // 自定义内容提取器
  contentExtractor: (data) => data.text,
  // 外部 AbortSignal
  signal: someSignal,
})

for await (const event of stream) {
  console.log(event.content)         // 提取的文本内容
  console.log(event.reasoningContent) // 推理/思考内容（可选）
  console.log(event.raw)             // 原始 JSON 数据
}

// 主动取消
stream.abort()
```

也支持工厂函数：`createFetchSSEStream(options)`

### Renderers

#### `MarkdownRenderer`

基于 markdown-it 的流式 Markdown 渲染器，支持自定义块解析。

```ts
import { MarkdownRenderer } from '@knoxzhang/streamup'

const renderer = new MarkdownRenderer(['think', 'action'])
renderer.setFallback(new TextRenderer()) // 降级回退
renderer.onReady(() => { /* shiki 加载完成 */ })
renderer.preload() // 预加载 shiki

const html = renderer.render(content, isStreaming)
```

#### `TextRenderer`

纯文本渲染器（不做 Markdown 解析），可作为 MarkdownRenderer 的降级回退。

#### `decodeBase64(str)`

Base64 解码工具函数，用于自定义块内容的解码。

#### 代码高亮

```ts
import {
  getHighlighter,      // 懒加载 shiki highlighter（单例）
  getHighlighterSync,  // 同步获取已加载实例
  createMdHighlightPlugin, // 创建 markdown-it 代码高亮插件
  DEFAULT_LANGUAGES,   // 默认语言列表
  DEFAULT_THEMES,      // 默认主题列表
} from '@knoxzhang/streamup'
```

### Utils

```ts
import {
  ensureElement,  // 确保 DOM 元素存在
  escapeHtml,     // HTML 转义
  splitChars,     // 按字符拆分字符串
} from '@knoxzhang/streamup'

import {
  AutoScrollManager,   // 自动滚动管理器
  isNearBottom,        // 判断是否接近底部
  scrollToBottom,      // 滚动到底部
  resolveAutoScrollOptions, // 解析自动滚动配置
} from '@knoxzhang/streamup'
```

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build

# 类型检查
pnpm type-check

# 单元测试
pnpm test:unit
```

## License

MIT
