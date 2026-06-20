/**
 * 守护进程接口与类型定义（V10）。
 *
 * 守护进程（Daemon）是系统的永续运行核心：
 *   - 定期检查系统健康
 *   - 自动恢复失败的计划（断点续传）
 *   - 监控资源使用
 *   - 自愈：检测异常并自动修复
 *
 * 设计原则：
 *   - 永续运行：守护进程一旦启动，持续运行直到显式停止
 *   - 自愈：检测到失败计划自动恢复
 *   - 可观测：记录守护进程运行日志和指标
 *   - 可配置：检查间隔、恢复策略可配置
 *   - 幂等：多次恢复操作不会产生副作用
 */

/**
 * 守护进程状态。
 */
export type DaemonStatus = "stopped" | "running" | "paused"

/**
 * 守护进程配置。
 */
export type DaemonConfig = {
  /** 健康检查间隔（毫秒） */
  health_check_interval_ms: number
  /** 计划恢复检查间隔（毫秒） */
  plan_recovery_interval_ms: number
  /** 是否自动恢复失败的计划 */
  auto_recover_plans: boolean
  /** 最大连续恢复失败次数（超过则停止恢复） */
  max_recovery_failures: number
}

/**
 * 守护进程运行指标。
 */
export type DaemonMetrics = {
  /** 状态 */
  status: DaemonStatus
  /** 启动时间 */
  started_at: number | null
  /** 运行时长（毫秒） */
  uptime_ms: number
  /** 健康检查次数 */
  health_checks: number
  /** 计划恢复次数 */
  plan_recoveries: number
  /** 恢复失败次数 */
  recovery_failures: number
  /** 最后一次健康检查时间 */
  last_health_check: number | null
  /** 最后一次计划恢复时间 */
  last_plan_recovery: number | null
  /** 当前健康状态 */
  current_health: string
}

/**
 * 守护进程事件。
 */
export type DaemonEvent = {
  /** 事件类型 */
  type: "health_check" | "plan_recovery" | "recovery_failed" | "status_change"
  /** 时间戳 */
  timestamp: number
  /** 事件数据 */
  data: Record<string, unknown>
}
