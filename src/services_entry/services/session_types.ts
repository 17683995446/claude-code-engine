/**
 * 会话管理类型定义（V4）。
 *
 * 定义会话元数据、配置和持久化结构。
 * 每个会话拥有独立的对话历史和可选的 system prompt。
 */

/**
 * 会话元数据（列表/详情视图）。
 */
export type Session = {
  id: string
  title: string
  created_at: number
  updated_at: number
  system_prompt: string | null
  message_count: number
}

/**
 * 创建会话时的配置。
 */
export type SessionConfig = {
  title?: string
  system_prompt?: string
  max_history?: number
}

/**
 * 会话列表项（精简视图，不含 system_prompt）。
 */
export type SessionListItem = {
  id: string
  title: string
  created_at: number
  updated_at: number
  message_count: number
}

/**
 * 会话持久化结构（存储到 IStorage 的格式）。
 */
export type SessionPersistData = {
  id: string
  title: string
  created_at: number
  updated_at: number
  system_prompt: string | null
  max_history: number
  messages: Array<{
    id: string
    content: string
    role: "user" | "assistant" | "system"
    timestamp: number
  }>
}
