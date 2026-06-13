# Streams

Vue 3 流式 Markdown 渲染组件库 — 专为流式数据实时输出而设计。

## 特性

- 🌊 **多数据源支持** — Fetch ReadableStream / SSE / WebSocket / 自定义处理器
- 📝 **增量 Markdown 渲染** — 基于 markdown-it，流式期间自动闭合未完成的结构
- 🎨 **代码语法高亮** — 基于 shiki，懒加载 + 降级回退
- 📜 **自动滚动** — 智能检测用户滚动，避免强制跳转
- ⚡ **RAF 批量更新** — 高频数据块合并后再触发响应式更新
- 🧩 **组合式 API** — useStream / useSmoothRenderer 等 composable
- 🪶 **零硬依赖** — markdown-it 和 shiki 为可选 peerDependencies

## 安装

```bash
npm install streams
# 可选依赖
npm install markdown-it shiki
```

## 快速开始

### 组件方式

```vue
<template>
  <!-- Markdown 流式渲染 -->
  <Stream :source="source" :smooth-speed="1" auto-scroll virtual />

  <!-- 或使用轻量级 StreamMarkdown -->
  <StreamMarkdown :source="source" />
</template>

<script setup>
import { Stream, StreamMarkdown } from 'streams'

const source = {
  type: 'fetch',
  url: '/api/chat',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: 'Hello' }),
}
</script>
```

### Composable 方式

```vue
<template>
  <div>{{ content }}</div>
  <button @click="start()">开始</button>
  <button @click="abort()">终止</button>
</template>

<script setup>
import { useStream } from 'streams'

const { content, status, start, abort } = useStream()

async function start() {
  await start({
    source: { type: 'sse', url: '/api/stream' },
  })
}
</script>
```

### 自定义数据源

```typescript
const { content, start } = useStream()

await start({
  source: {
    type: 'custom',
    handler: (controller) => {
      // 主动推送数据
      controller.push('Hello ')
      controller.push('World!')
      controller.complete()
    },
  },
})
```

## API

### 组件

| 组件                   | 说明                                      |
| ---------------------- | ----------------------------------------- |
| `Stream`               | Markdown 流式渲染，支持平滑渲染、虚拟滚动 |
| `StreamMarkdown`       | 轻量级 Markdown 渲染组件                  |
| `VirtualStreamContent` | 虚拟滚动内容容器                          |

### Composables

| 函数                                  | 说明             |
| ------------------------------------- | ---------------- |
| `useStream(options?)`                 | 核心流式数据管理 |
| `useStreamFetch(url, options?)`       | Fetch 专用       |
| `useStreamSSE(url, options?)`         | SSE 专用         |
| `useStreamWS(url, options?)`          | WebSocket 专用   |
| `useSmoothRenderer(source, options?)` | 平滑渲染         |

### 数据源配置

```typescript
// Fetch
{ type: 'fetch', url: string, method?: string, headers?: Record<string, string>, body?: BodyInit }

// SSE
{ type: 'sse', url: string, event?: string, withCredentials?: boolean }

// WebSocket
{ type: 'websocket', url: string, protocols?: string | string[] }

// 自定义
{ type: 'custom', handler: (controller) => void }
```

### 流状态

`idle` → `connecting` → `streaming` → `completed` / `error` / `aborted`

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
