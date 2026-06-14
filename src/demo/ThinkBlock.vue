<script setup lang="ts">
/**
 * ThinkBlock - 自定义 think 块渲染组件
 *
 * 用于 Stream 组件的 #think 插槽，
 * 将 ```think ... ``` 渲染为带紫色左边框的思考卡片。
 * 支持点击 header 展开/收起内容，带过渡动画。
 */
import { ref } from 'vue'
import type { CustomBlockInstance } from '../core/types'

defineProps<{
  block: CustomBlockInstance
}>()

const collapsed = ref(false)

function toggle() {
  collapsed.value = !collapsed.value
}
</script>

<template>
  <div class="think-block" :class="{ 'think-block--collapsed': collapsed }">
    <div class="think-header" @click="toggle">
      <span class="think-icon">💭</span>
      <span class="think-label">思考过程</span>
      <span class="think-toggle">{{ collapsed ? '▶' : '▼' }}</span>
    </div>
    <Transition name="think-expand">
      <div v-show="!collapsed" class="think-content">{{ block.content }}</div>
    </Transition>
  </div>
</template>

<style>
@keyframes think-fade-in {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.think-block {
  margin: 0.5em 0;
  border: 1px solid #e2e8f0;
  border-left: 3px solid #a78bfa;
  border-radius: 6px;
  background: #f8f7ff;
  overflow: hidden;
  animation: think-fade-in 0.4s ease both;
}

.think-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #ede9fe;
  font-size: 0.8rem;
  font-weight: 600;
  color: #7c3aed;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease;
}

.think-header:hover {
  background: #ddd6fe;
}

.think-icon {
  font-size: 1rem;
}

.think-label {
  letter-spacing: 0.5px;
  flex: 1;
}

.think-toggle {
  font-size: 0.65rem;
  opacity: 0.6;
  transition: transform 0.2s ease;
}

.think-content {
  padding: 12px 16px;
  font-size: 0.85rem;
  line-height: 1.6;
  color: #6b7280;
  white-space: pre-wrap;
}

/* 展开/收起过渡动画 */
.think-expand-enter-active,
.think-expand-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}

.think-expand-enter-from,
.think-expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.think-expand-enter-to,
.think-expand-leave-from {
  opacity: 1;
  max-height: 500px;
}
</style>
