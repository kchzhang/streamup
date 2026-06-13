<script setup lang="ts">
/**
 * Streams 组件库 Demo - 接入真实流式 API
 *
 * 演示 source 接受 string（全量）和 Ref<string>（增量流式）两种模式。
 */
import { ref, computed } from 'vue'
import { Stream, FetchSSEStream } from './index'

// 提示词输入
const prompt = ref('你好，请用 Markdown 格式介绍 Vue 3 的组合式 API，包含代码示例')

// 流式内容
const content = ref('')
const isStreaming = ref(false)

// 当前活跃的流
let activeStream: FetchSSEStream | null = null

// 环境变量检查
const envReady = computed(() => {
  return !!import.meta.env.VITE_CHAT_API_KEY
})

// Demo 播放状态
const showMd = ref(false)

/**
 * 发送请求并实时更新 content
 */
async function sendStream() {
  const apiKey = import.meta.env.VITE_CHAT_API_KEY
  const model = import.meta.env.VITE_CHAT_MODEL

  if (!apiKey) {
    content.value = '⚠️ 未配置 API 环境变量，请在 .env.local 文件中设置 `VITE_CHAT_API_KEY`'
    return
  }

  content.value = ''
  isStreaming.value = true
  showMd.value = true

  activeStream = new FetchSSEStream({
    url: '/api/chat',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt.value }],
      stream: true,
      thinking: true,
    }),
  })

  try {
    for await (const event of activeStream) {
      content.value += event.content
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      content.value += `\n\n❌ 请求失败: ${(err as Error).message}`
    }
  } finally {
    isStreaming.value = false
    activeStream = null
  }
}

// 开始演示
function startDemo() {
  if (!prompt.value.trim()) return
  stopStream()
  sendStream()
}

// 停止当前流
function stopStream() {
  activeStream?.abort()
  activeStream = null
  isStreaming.value = false
  showMd.value = false
}

const isPlaying = computed(() => isStreaming.value || showMd.value)
</script>

<template>
  <div class="demo-app">
    <main class="demo-main">
      <!-- 提示词输入区 -->
      <div class="prompt-area">
        <div class="prompt-input-wrapper">
          <input
            v-model="prompt"
            type="text"
            placeholder="输入提示词..."
            class="prompt-input"
            @keydown.enter="startDemo"
          />
          <button
            v-if="!isPlaying"
            class="prompt-btn prompt-btn-send"
            :disabled="!prompt.trim() || !envReady"
            @click="startDemo"
          >
            发送
          </button>
          <button
            v-else
            class="prompt-btn prompt-btn-stop"
            @click="stopStream"
          >
            停止
          </button>
        </div>
        <p v-if="!envReady" class="env-warning">
          ⚠️ 未检测到 API 配置，请在 .env.local 中设置 VITE_CHAT_API_KEY
        </p>
      </div>

      <!-- Markdown Demo -->
      <section class="demo-section">
        <h2>Stream - Markdown 流式渲染（虚拟滚动）</h2>
        <Stream
          v-if="showMd"
          :source="content"
          :streaming="isStreaming"
          :smooth-speed="1"
          :auto-scroll="true"
          virtual
          class="demo-stream"
        />
      </section>
    </main>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f8fafc;
  color: #1a202c;
}

.demo-app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.demo-main {
  flex: 1;
  min-height: 0;
  padding: 10px 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 提示词输入区 */
.prompt-area {
  background: white;
  border-radius: 10px;
  padding: 12px 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.prompt-input-wrapper {
  display: flex;
  gap: 8px;
  align-items: center;
}

.prompt-input {
  flex: 1;
  padding: 8px 12px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.15s ease;
}

.prompt-input:focus {
  border-color: #4299e1;
}

.prompt-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.prompt-btn-send {
  background: #4299e1;
  color: white;
}

.prompt-btn-send:hover:not(:disabled) {
  background: #3182ce;
}

.prompt-btn-send:disabled {
  background: #a0aec0;
  cursor: not-allowed;
}

.prompt-btn-stop {
  background: #e53e3e;
  color: white;
}

.prompt-btn-stop:hover {
  background: #c53030;
}

.env-warning {
  margin-top: 10px;
  color: #e53e3e;
  font-size: 0.85rem;
}

/* Demo 区域 */
.demo-section {
  flex: 1;
  min-height: 0;
  padding: 24px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
}

.demo-section h2 {
  font-size: 1.2rem;
  margin-bottom: 16px;
  color: #2d3748;
  flex-shrink: 0;
}

.demo-stream {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
