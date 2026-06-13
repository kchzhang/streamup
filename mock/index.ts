import type { Plugin, PluginOption } from 'vite'
import { viteMockServe } from 'vite-plugin-mock'
import fs from 'node:fs'
import path from 'node:path'

// ============ SSE 流式 Mock 配置 ============
interface SseMockRoute {
  url: string
  dataFile: string
  delay?: number // 每条 data 之间的延迟(ms)
}

// 在此集中管理所有 SSE 路由，后续新增只需往数组添加条目
const sseRoutes: SseMockRoute[] = [
  {
    url: '/api/chat',
    dataFile: 'mock/data',
    delay: 30,
  },
  // 示例：后续可继续添加
  // {
  //   url: '/api/chat/stream2',
  //   dataFile: 'mock/data-stream2',
  //   delay: 20,
  // },
]

// SSE 流式 Mock 插件
function sseMockPlugin(): Plugin {
  return {
    name: 'vite-plugin-sse-mock',
    configureServer(server) {
      for (const route of sseRoutes) {
        server.middlewares.use(route.url, async (_req, res) => {
          const dataPath = path.resolve(process.cwd(), route.dataFile)
          const content = fs.readFileSync(dataPath, 'utf-8')
          const lines = content.split('\n')
          const delay = route.delay ?? 30

          res.setHeader('Content-Type', 'text/event-stream')
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Connection', 'keep-alive')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              res.write(line + '\n\n')
              await new Promise((r) => setTimeout(r, delay))
            }
          }

          res.end()
        })
      }
    },
  }
}

// ============ 导出所有 Mock 插件 ============
export function setupMockPlugins(isDev: boolean): PluginOption[] {
  return [
    // 常规 REST Mock（扫描 mock/modules/ 目录下的 .ts 文件）
    viteMockServe({
      mockPath: 'mock/modules',
      localEnabled: isDev,
    } as any),
    // SSE 流式 Mock
    sseMockPlugin(),
  ]
}
