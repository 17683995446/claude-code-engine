#!/usr/bin/env node
/**
 * Resumable long-running stability test.
 * Saves progress to disk and resumes from last checkpoint.
 * Designed for environments where processes may be killed.
 */

import { ClaudeCodeEngine } from "./index.ts"
import { BatchProcessor } from "./core_infra/infra/batch_processor.ts"
import { MemoryCache } from "./core_infra/infra/memory_cache.ts"
import { TokenBucketLimiter } from "./core_infra/infra/token_bucket_limiter.ts"
import { CircuitBreaker } from "./core_infra/infra/circuit_breaker.ts"
import { QuotaManager } from "./core_infra/infra/quota_manager.ts"
import { SimpleScheduler } from "./core_infra/infra/simple_scheduler.ts"
import { FileStorage } from "./core_infra/infra/file_storage.ts"
import { MemoryRepository } from "./core_infra/infra/memory_repository.ts"
import { AlertManager } from "./core_infra/infra/alert_manager.ts"
import { MemoryNotifier } from "./core_infra/infra/memory_notifier.ts"
import { PluginManager } from "./core_infra/infra/plugin_manager.ts"
import { VersionRegistry } from "./core_infra/infra/version_registry.ts"
import { VersionedWrapper } from "./core_infra/infra/versioned_wrapper.ts"
import { DiContainer } from "./core_infra/infra/di_container.ts"
import type { QueryEngineConfig } from "./core_infra/core/query_engine_config.ts"

const fs = require("fs")
const LOG_DIR = "/workspace/claude_code/group_a/code/logs"
const STATE_FILE = `${LOG_DIR}/long_run_state.json`
const LOG_FILE = `${LOG_DIR}/long_run_${process.pid}_${Date.now()}.log`
const DURATION_MS = 5 * 60 * 60 * 1000
const INTERVAL_MS = 30 * 1000
const CLEANUP_EVERY = 100

function now(): string {
  return new Date().toISOString()
}

let fd: number = -1

function log(line: string): void {
  const text = `[${now()}] ${line}\n`
  if (fd >= 0) {
    fs.writeSync(fd, text)
  }
}

function mem_mb(): number {
  const u = process.memoryUsage()
  return Math.round((u.heapUsed || 0) / 1024 / 1024)
}

interface State {
  total_elapsed_ms: number
  total_cycles: number
  total_ops: number
  total_errors: number
  last_run_at: number
}

function load_state(): State {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8")
    return JSON.parse(raw) as State
  } catch {
    return { total_elapsed_ms: 0, total_cycles: 0, total_ops: 0, total_errors: 0, last_run_at: 0 }
  }
}

function save_state(s: State): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s))
}

async function main(): Promise<void> {
  fs.mkdirSync(LOG_DIR, { recursive: true })
  fd = fs.openSync(LOG_FILE, "a")

  const state = load_state()
  const session_start = Date.now()

  log("=== LONG RUN START ===")
  log(`Duration: ${DURATION_MS}ms, Interval: ${INTERVAL_MS}ms`)
  log(`Node: ${process.version}, PID: ${process.pid}`)
  log(`Resumed: elapsed=${state.total_elapsed_ms}ms cycles=${state.total_cycles} ops=${state.total_ops} errors=${state.total_errors}`)

  if (state.total_elapsed_ms >= DURATION_MS) {
    log("TARGET ALREADY REACHED")
    return
  }

  const config: QueryEngineConfig = {
    cwd: process.cwd(),
    max_turns: 100,
    initial_messages: [],
    verbose: false,
  }

  const engine = new ClaudeCodeEngine(config)
  await engine.start()
  log("Engine started: " + engine.health_check())

  const cache = new MemoryCache<string>(60000)
  const limiter = new TokenBucketLimiter(100, 100)
  const quota = new QuotaManager(10000)
  const breaker = new CircuitBreaker(50, 5000)
  const scheduler = new SimpleScheduler()
  const storage = new FileStorage()
  const repo = new MemoryRepository<number>(storage, "numbers")
  const notifier = new MemoryNotifier()
  const alerts = new AlertManager(notifier)
  const registry = new VersionRegistry()
  const plugins = new PluginManager(new DiContainer())

  let cycle = state.total_cycles
  let totalOps = state.total_ops
  let errors = state.total_errors
  const startTime = Date.now()

  scheduler.register({
    id: "heartbeat",
    interval_ms: 60000,
    enabled: true,
    async execute(): Promise<void> {
      log(`HEARTBEAT: scheduler alive, mem=${mem_mb()}MB`)
    },
  })
  scheduler.start()

  while (state.total_elapsed_ms + (Date.now() - startTime) < DURATION_MS) {
    cycle++
    const cycleStart = Date.now()
    let cycleOps = 0
    let cycleErrors = 0

    try {
      const msg = engine.get_messages()
      msg.add(`cycle_${cycle}`, "user")
      msg.add(`response_${cycle}`, "assistant")
      cycleOps += 2

      const auth = engine.get_auth()
      auth.validate()
      cycleOps++

      const gateway = engine.get_gateway()
      gateway.handle_request({ action: `test_${cycle}`, payload: { n: cycle } })
      cycleOps++

      cache.set(`key_${cycle}`, `value_${cycle}`, 5000)
      cache.get(`key_${cycle}`)
      cycleOps += 2

      limiter.try_acquire()
      cycleOps++

      quota.acquire("longrun", "api", 1)
      quota.release("longrun", "api", 1)
      cycleOps += 2

      breaker.execute(() => cycle % 10 !== 0, false)
      cycleOps++

      repo.add(`id_${cycle}`, cycle)
      repo.get(`id_${cycle}`)
      cycleOps += 2

      alerts.evaluate()
      cycleOps++

      registry.register("svc", new VersionedWrapper("1.0.0", {}))
      registry.resolve("svc", "1.0.0")
      cycleOps += 2

      engine.health_check()
      cycleOps++

      engine.get_audit_log()
      cycleOps++

      const batch = new BatchProcessor<number, number>(async (n) => n * 2, 4)
      batch.submit([1, 2, 3])
      await batch.execute()
      cycleOps += 3

      await repo.persist()
      cycleOps++

      plugins.list()
      cycleOps++
    } catch (err) {
      cycleErrors++
      errors++
      log(`CYCLE_ERROR: cycle=${cycle} err=${err}`)
    }

    totalOps += cycleOps
    const cycleElapsed = Date.now() - cycleStart

    if (cycle % 10 === 0) {
      const elapsed = state.total_elapsed_ms + (Date.now() - startTime)
      log(`PROGRESS: cycle=${cycle} ops=${totalOps} errors=${errors} elapsed=${elapsed}ms mem=${mem_mb()}MB`)
    }

    if (cycle % CLEANUP_EVERY === 0) {
      log(`CLEANUP: cycle=${cycle}`)
      engine.get_messages().clear()
      repo.clear()
      registry.clear("svc")
      if (global.gc) {
        global.gc()
        log(`GC: mem=${mem_mb()}MB`)
      }
    }

    const sleepTime = Math.max(0, INTERVAL_MS - cycleElapsed)
    await new Promise((res) => setTimeout(res, sleepTime))

    // Save checkpoint every cycle
    save_state({
      total_elapsed_ms: state.total_elapsed_ms + (Date.now() - startTime),
      total_cycles: cycle,
      total_ops: totalOps,
      total_errors: errors,
      last_run_at: Date.now(),
    })
  }

  scheduler.stop()
  engine.stop()

  const finalElapsed = state.total_elapsed_ms + (Date.now() - startTime)
  log("=== LONG RUN COMPLETE ===")
  log(`Cycles: ${cycle}`)
  log(`TotalOps: ${totalOps}`)
  log(`Errors: ${errors}`)
  log(`Elapsed: ${finalElapsed}ms`)
  log(`AvgOpsPerCycle: ${(totalOps / cycle).toFixed(2)}`)

  save_state({
    total_elapsed_ms: finalElapsed,
    total_cycles: cycle,
    total_ops: totalOps,
    total_errors: errors,
    last_run_at: Date.now(),
  })

  if (fd >= 0) {
    fs.closeSync(fd)
    fd = -1
  }
}

main().catch((err) => {
  log(`FATAL: ${err}`)
  if (fd >= 0) {
    fs.closeSync(fd)
    fd = -1
  }
  process.exit(1)
})
