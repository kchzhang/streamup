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
npm install @knox/streamup
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
import { Stream, StreamMarkdown } from '@knox/streamup'

const source = {
  type: 'fetch',
  url: '/api/chat',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: 'Hello' }),
}
</script>
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
