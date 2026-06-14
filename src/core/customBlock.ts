/**
 * 自定义块 provide/inject 通信
 */
import type { Component } from 'vue'
import type { CustomBlockInstance } from './types'

/** provide/inject key 用于传递自定义块渲染函数 */
export const CUSTOM_BLOCK_RENDER_KEY = Symbol('streams-custom-block-render')

/** 自定义块渲染组件类型（接收 block prop 的 Vue 组件） */
export type CustomBlockRenderFn = Component
