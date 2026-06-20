import { AsyncLock } from "../../core_infra/infra/async_lock.ts"
import { log_info, log_warn, log_error } from "../../core_infra/infra/global_logger.ts"
import type { IStorage } from "../../core_infra/core/i_storage.ts"
import type {
  DaemonStatus,
  DaemonConfig,
  DaemonMetrics,
  DaemonEvent,
} from "../../core_infra/core/i_daemon.ts"
import type { Planner } from "./planner.ts"
import type { PlanSummary } from "../../core_infra/core/i_plan.ts"

/**
 * 默认守护进程配置。
 */
export const DEFAULT_DAEMON_CONFIG: DaemonConfig = {
  health_check_interval_ms: 5000,
  plan_recovery_interval_ms: 3000,
  auto_recover_plans: true,
  max_recovery_failures: 5,
}

/**
 * 健康检查探针函数类型。
 *
 * 返回健康状态字符串："healthy" | "degraded" | "unhealthy"。
 */
export type HealthProbe = () => string

/**
 * 守护进程持久化数据。
 */
export type DaemonPersistData = {
  status: DaemonStatus
  started_at: number | null
  config: DaemonConfig
  metrics: DaemonMetrics
}

/**
 * Daemon - 守护进程（V10）。
 *
 * 系统的永续运行核心，负责：
 *   - 定期健康检查（调用 HealthProbe）
 *   - 自动恢复失败的计划（调用 Planner.resume_plan）
 *   - 自愈：检测异常并自动修复
 *   - 指标收集与可观测性
 *
 * 设计原则：
 *   - 永续运行：start 后持续运行直到 stop
 *   - 自愈：检测到 failed/paused 计划自动恢复
 *   - 可观测：记录运行指标和事件
 *   - 可配置：检查间隔、恢复策略可配置
 *   - 幂等：多次恢复操作不会产生副作用（Planner.resume_plan 本身幂等）
 *   - 容错：恢复失败计数超过阈值时停止恢复（避免无限重试）
 *
 * 状态机：
 *   stopped → start → running
 *   running → pause → paused → resume → running
 *   running/paused → stop → stopped
 */
export class Daemon {
  private status: DaemonStatus = "stopped"
  private readonly lock: AsyncLock = new AsyncLock()
  private readonly storage: IStorage | null
  private readonly storage_key: string = "daemon"
  private readonly config: DaemonConfig
  private readonly planner: Planner | null
  private readonly health_probe: HealthProbe | null

  private health_timer: ReturnType<typeof setInterval> | null = null
  private recovery_timer: ReturnType<typeof setInterval> | null = null

  private started_at: number | null = null
  private health_checks: number = 0
  private plan_recoveries: number = 0
  private recovery_failures: number = 0
  private last_health_check: number | null = null
  private last_plan_recovery: number | null = null
  private current_health: string = "unknown"

  private readonly events: DaemonEvent[] = []
  private readonly max_events: number = 100

  constructor(
    options: {
      storage?: IStorage
      planner?: Planner
      health_probe?: HealthProbe
      config?: Partial<DaemonConfig>
    } = {},
  ) {
    this.storage = options.storage ?? null
    this.planner = options.planner ?? null
    this.health_probe = options.health_probe ?? null
    this.config = { ...DEFAULT_DAEMON_CONFIG, ...options.config }
    log_info(
      `daemon_created: storage=${this.storage !== null} planner=${this.planner !== null} probe=${this.health_probe !== null}`,
    )
  }

  /**
   * 启动守护进程。
   *
   * 创建两个定时器：
   *   - 健康检查定时器：按 health_check_interval_ms 间隔执行健康检查
   *   - 计划恢复定时器：按 plan_recovery_interval_ms 间隔检查并恢复失败计划
   *
   * @returns 启动后的状态
   */
  async start(): Promise<DaemonStatus> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      throw new Error("daemon_start_lock_failed")
    }
    try {
      if (this.status === "running") {
        log_warn("daemon_already_running")
        return this.status
      }
      this.status = "running"
      this.started_at = Date.now()
      this.record_event("status_change", { status: "running" })
      log_info(`daemon_start: interval_health=${this.config.health_check_interval_ms}ms interval_recovery=${this.config.plan_recovery_interval_ms}ms`)

      // 创建定时器（首次检查在间隔后执行，避免与 start 调用重叠）
      this.health_timer = setInterval(() => {
        void this.run_health_check()
      }, this.config.health_check_interval_ms)

      if (this.config.auto_recover_plans) {
        this.recovery_timer = setInterval(() => {
          void this.run_plan_recovery()
        }, this.config.plan_recovery_interval_ms)
      }

      await this.persist()
      return this.status
    } finally {
      this.lock.release()
    }
  }

  /**
   * 停止守护进程。
   *
   * 清理所有定时器，重置运行状态（保留指标）。
   */
  async stop(): Promise<DaemonStatus> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      throw new Error("daemon_stop_lock_failed")
    }
    try {
      if (this.status === "stopped") {
        log_warn("daemon_already_stopped")
        return this.status
      }
      this.clear_timers()
      this.status = "stopped"
      this.record_event("status_change", { status: "stopped" })
      log_info("daemon_stop")
      await this.persist()
      return this.status
    } finally {
      this.lock.release()
    }
  }

  /**
   * 暂停守护进程。
   *
   * 停止定时器但保留运行指标，可通过 resume 恢复。
   */
  async pause(): Promise<DaemonStatus> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      throw new Error("daemon_pause_lock_failed")
    }
    try {
      if (this.status !== "running") {
        log_warn(`daemon_pause_invalid_state: ${this.status}`)
        return this.status
      }
      this.clear_timers()
      this.status = "paused"
      this.record_event("status_change", { status: "paused" })
      log_info("daemon_pause")
      await this.persist()
      return this.status
    } finally {
      this.lock.release()
    }
  }

  /**
   * 恢复守护进程。
   *
   * 重新创建定时器，从暂停状态恢复运行。
   */
  async resume(): Promise<DaemonStatus> {
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      throw new Error("daemon_resume_lock_failed")
    }
    try {
      if (this.status !== "paused") {
        log_warn(`daemon_resume_invalid_state: ${this.status}`)
        return this.status
      }
      this.status = "running"
      this.record_event("status_change", { status: "running" })
      log_info("daemon_resume")

      this.health_timer = setInterval(() => {
        void this.run_health_check()
      }, this.config.health_check_interval_ms)

      if (this.config.auto_recover_plans) {
        this.recovery_timer = setInterval(() => {
          void this.run_plan_recovery()
        }, this.config.plan_recovery_interval_ms)
      }

      await this.persist()
      return this.status
    } finally {
      this.lock.release()
    }
  }

  /**
   * 获取当前状态。
   */
  get_status(): DaemonStatus {
    return this.status
  }

  /**
   * 获取当前配置。
   */
  get_config(): DaemonConfig {
    return { ...this.config }
  }

  /**
   * 获取运行指标。
   */
  get_metrics(): DaemonMetrics {
    const uptime_ms: number = this.started_at !== null && this.status !== "stopped"
      ? Date.now() - this.started_at
      : 0
    return {
      status: this.status,
      started_at: this.started_at,
      uptime_ms,
      health_checks: this.health_checks,
      plan_recoveries: this.plan_recoveries,
      recovery_failures: this.recovery_failures,
      last_health_check: this.last_health_check,
      last_plan_recovery: this.last_plan_recovery,
      current_health: this.current_health,
    }
  }

  /**
   * 获取最近事件列表（最多 max_events 条）。
   */
  get_events(): DaemonEvent[] {
    return [...this.events]
  }

  /**
   * 手动触发一次健康检查。
   */
  async run_health_check(): Promise<string> {
    if (this.status === "stopped") {
      return this.current_health
    }
    try {
      if (this.health_probe) {
        this.current_health = this.health_probe()
      } else {
        this.current_health = "healthy"
      }
    } catch (e) {
      log_warn(`daemon_health_check_exception: ${e}`)
      this.current_health = "unhealthy"
    }
    this.health_checks += 1
    this.last_health_check = Date.now()
    this.record_event("health_check", { health: this.current_health })
    log_info(`daemon_health_check: ${this.current_health}`)
    return this.current_health
  }

  /**
   * 手动触发一次计划恢复。
   *
   * 扫描所有计划，对 failed/paused 状态的计划调用 resume_plan。
   * 恢复失败计数超过 max_recovery_failures 时停止恢复。
   */
  async run_plan_recovery(): Promise<number> {
    if (this.status === "stopped") {
      return 0
    }
    if (!this.planner) {
      return 0
    }
    if (this.recovery_failures >= this.config.max_recovery_failures) {
      log_warn(`daemon_recovery_disabled: failures=${this.recovery_failures} max=${this.config.max_recovery_failures}`)
      return 0
    }

    let recovered: number = 0
    try {
      const plans: PlanSummary[] = await this.planner.list_plans()
      for (const plan of plans) {
        if (plan.status !== "failed" && plan.status !== "paused") {
          continue
        }
        try {
          log_info(`daemon_recover_plan: id=${plan.id} status=${plan.status}`)
          const status = await this.planner.resume_plan(plan.id)
          this.last_plan_recovery = Date.now()
          if (status === "failed") {
            // 恢复后仍为 failed，计为恢复失败
            this.recovery_failures += 1
            this.record_event("recovery_failed", { plan_id: plan.id, status, error: "still_failed" })
            log_warn(`daemon_recover_still_failed: id=${plan.id}`)
            if (this.recovery_failures >= this.config.max_recovery_failures) {
              log_error(`daemon_recovery_threshold_reached: ${this.recovery_failures}`)
              break
            }
          } else {
            this.plan_recoveries += 1
            this.record_event("plan_recovery", { plan_id: plan.id, status })
            recovered += 1
            log_info(`daemon_recovered: id=${plan.id} status=${status}`)
          }
        } catch (e) {
          this.recovery_failures += 1
          this.record_event("recovery_failed", { plan_id: plan.id, error: String((e as Error).message) })
          log_error(`daemon_recover_failed: id=${plan.id} error=${e}`)
          if (this.recovery_failures >= this.config.max_recovery_failures) {
            log_error(`daemon_recovery_threshold_reached: ${this.recovery_failures}`)
            break
          }
        }
      }
    } catch (e) {
      this.recovery_failures += 1
      log_error(`daemon_recovery_scan_failed: ${e}`)
    }
    return recovered
  }

  /**
   * 重置恢复失败计数（用于手动恢复后重新启用自动恢复）。
   */
  reset_recovery_failures(): void {
    this.recovery_failures = 0
    log_info("daemon_reset_recovery_failures")
  }

  // ===== 内部方法 =====

  private clear_timers(): void {
    if (this.health_timer) {
      clearInterval(this.health_timer)
      this.health_timer = null
    }
    if (this.recovery_timer) {
      clearInterval(this.recovery_timer)
      this.recovery_timer = null
    }
  }

  private record_event(type: DaemonEvent["type"], data: Record<string, unknown>): void {
    const event: DaemonEvent = {
      type,
      timestamp: Date.now(),
      data,
    }
    this.events.push(event)
    while (this.events.length > this.max_events) {
      this.events.shift()
    }
  }

  /**
   * 持久化守护进程状态到存储。
   */
  async persist(): Promise<void> {
    if (!this.storage) {
      return
    }
    const data: DaemonPersistData = {
      status: this.status,
      started_at: this.started_at,
      config: this.config,
      metrics: this.get_metrics(),
    }
    await this.storage.save(this.storage_key, data).catch((e: unknown) => {
      log_warn(`daemon_persist_failed: ${e}`)
    })
  }

  /**
   * 从存储加载守护进程状态。
   *
   * 注意：加载后守护进程状态为 stopped（不自动启动），
   * 调用方需要显式调用 start() 启动。
   * 但保留 started_at 和指标用于可观测性。
   */
  async load_from_storage(): Promise<boolean> {
    if (!this.storage) {
      return false
    }
    const acquired: boolean = await this.lock.acquire(5000)
    if (!acquired) {
      log_warn("daemon_load_lock_failed")
      return false
    }
    try {
      const data: unknown = await this.storage.load(this.storage_key)
      if (!data || typeof data !== "object") {
        return false
      }
      const persist_data = data as DaemonPersistData
      // 只恢复指标，状态重置为 stopped（不自动启动）
      this.started_at = persist_data.started_at
      this.health_checks = persist_data.metrics?.health_checks ?? 0
      this.plan_recoveries = persist_data.metrics?.plan_recoveries ?? 0
      this.recovery_failures = persist_data.metrics?.recovery_failures ?? 0
      this.last_health_check = persist_data.metrics?.last_health_check ?? null
      this.last_plan_recovery = persist_data.metrics?.last_plan_recovery ?? null
      this.current_health = persist_data.metrics?.current_health ?? "unknown"
      this.status = "stopped"
      log_info(`daemon_loaded: previous_status=${persist_data.status}`)
      return true
    } finally {
      this.lock.release()
    }
  }
}
