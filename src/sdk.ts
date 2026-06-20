#!/usr/bin/env bun
/**
 * Claude Code Engine - SDK Demo Entry Point
 *
 * Usage:
 *   bun run src/sdk.ts
 *   bun run sdk
 */

import { log_info } from "./core_infra/infra/global_logger.ts"
import { ClaudeCodeEngine } from "./index.ts"
import { BatchProcessor } from "./core_infra/infra/batch_processor.ts"
import { MemoryCache } from "./core_infra/infra/memory_cache.ts"
import { TokenBucketLimiter } from "./core_infra/infra/token_bucket_limiter.ts"
import { CircuitBreaker } from "./core_infra/infra/circuit_breaker.ts"
import { QuotaManager } from "./core_infra/infra/quota_manager.ts"
import type { QueryEngineConfig } from "./core_infra/core/query_engine_config.ts"

function get_config(): QueryEngineConfig {
  log_info("sdk_get_config")
  return {
    cwd: process.cwd(),
    max_turns: 100,
    initial_messages: [],
    verbose: false,
  }
}

async function main(): Promise<void> {
  log_info("sdk_main_start")
  const config: QueryEngineConfig = get_config()
  const engine: ClaudeCodeEngine = new ClaudeCodeEngine(config)
  await engine.start()

  console.log("========================================")
  console.log("  Claude Code Engine SDK Demo")
  console.log("  Health: " + engine.health_check())
  console.log("========================================")

  // Demo 1: Message Service
  const msg = engine.get_messages()
  msg.add("Hello from SDK", "user")
  msg.add("Ready to assist", "assistant")
  console.log("\n[1] Messages:")
  console.log("  Count: " + msg.get_all().length)

  // Demo 2: Auth Service
  const auth = engine.get_auth()
  console.log("\n[2] Auth:")
  console.log("  Has valid token: " + auth.validate())
  console.log("  Status: " + JSON.stringify(auth.get_status()))
  console.log("  Expired: " + auth.is_token_expired())

  // Demo 3: Batch Processing
  console.log("\n[3] Batch Processing:")
  const batch = new BatchProcessor<number, number>(async (n) => n * n, 4)
  batch.submit([1, 2, 3, 4, 5])
  const batch_result = await batch.execute()
  console.log("  Total: " + batch_result.total)
  console.log("  Succeeded: " + batch_result.succeeded)
  console.log("  Results: " + batch_result.results.map((r) => r.data).join(", "))

  // Demo 4: Cache
  console.log("\n[4] Cache:")
  const cache = new MemoryCache<string>(60000)
  cache.set("key1", "value1", 1000)
  console.log("  Get: " + cache.get("key1"))
  console.log("  Missing: " + cache.get("missing"))

  // Demo 5: Rate Limiting + Quota
  console.log("\n[5] Rate Limit & Quota:")
  const limiter = new TokenBucketLimiter(10, 10)
  const quota = new QuotaManager(100)
  let allowed = 0
  for (let i = 0; i < 15; i++) {
    if (limiter.try_acquire() && quota.acquire("demo", "api", 1)) {
      allowed++
    }
  }
  console.log("  Requests: 15, Allowed: " + allowed)

  // Demo 6: Circuit Breaker
  console.log("\n[6] Circuit Breaker:")
  const breaker = new CircuitBreaker(3, 100)
  let success = 0
  for (let i = 0; i < 10; i++) {
    const ok = breaker.execute(() => i < 2, false)
    if (ok) success++
  }
  console.log("  Success: " + success + ", State: " + breaker.get_state())

  // Demo 7: Audit Log
  console.log("\n[7] Audit Log:")
  console.log("  Events: " + engine.get_audit_log().split("\n").length)

  console.log("\n========================================")
  console.log("  SDK Demo Complete")
  console.log("========================================")

  engine.stop()
  log_info("sdk_main_done")
}

main().catch((err) => {
  console.error("SDK failed:", err)
  process.exit(1)
})
