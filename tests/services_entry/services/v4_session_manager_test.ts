import { describe, it, expect, beforeEach } from "bun:test"
import { SessionManager } from "../../../src/services_entry/services/session_manager.ts"
import { MockLlmAdapter } from "../../../src/services_entry/services/llm_adapters.ts"
import type { IStorage } from "../../../src/core_infra/core/i_storage.ts"
import type { Session, SessionListItem } from "../../../src/services_entry/services/session_types.ts"

// ============================================================
// V4: SessionManager 单元测试
// ============================================================

// 内存存储实现，用于测试
class MockStorage implements IStorage {
  private data: Map<string, unknown> = new Map()
  async save(key: string, value: unknown): Promise<void> {
    this.data.set(key, value)
  }
  async load(key: string): Promise<unknown> {
    return this.data.get(key) ?? null
  }
  async delete(key: string): Promise<void> {
    this.data.delete(key)
  }
  async list_keys(prefix: string): Promise<string[]> {
    const keys: string[] = []
    for (const key of this.data.keys()) {
      if (key.startsWith(prefix)) {
        keys.push(key)
      }
    }
    return keys
  }
  close(): void {}
}

describe("V4 SessionManager basic CRUD", () => {
  let manager: SessionManager

  beforeEach(() => {
    const llm = new MockLlmAdapter("mock-v4")
    manager = new SessionManager(llm)
  })

  it("should create session with default config", async () => {
    const session: Session = await manager.create_session()
    expect(session.id).toBe("1")
    expect(session.title).toBe("Session 1")
    expect(session.created_at).toBeGreaterThan(0)
    expect(session.updated_at).toBe(session.created_at)
    expect(session.system_prompt).toBe(null)
    expect(session.message_count).toBe(0)
  })

  it("should create session with custom config", async () => {
    const session: Session = await manager.create_session({
      title: "My Chat",
      system_prompt: "You are a pirate",
      max_history: 20,
    })
    expect(session.title).toBe("My Chat")
    expect(session.system_prompt).toBe("You are a pirate")
  })

  it("should increment session IDs", async () => {
    const s1: Session = await manager.create_session()
    const s2: Session = await manager.create_session()
    const s3: Session = await manager.create_session()
    expect(s1.id).toBe("1")
    expect(s2.id).toBe("2")
    expect(s3.id).toBe("3")
  })

  it("should get session by id", async () => {
    const created: Session = await manager.create_session({ title: "Test" })
    const fetched: Session | null = await manager.get_session(created.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.title).toBe("Test")
  })

  it("should return null for non-existent session", async () => {
    const fetched: Session | null = await manager.get_session("999")
    expect(fetched).toBeNull()
  })

  it("should list all sessions sorted by updated_at desc", async () => {
    const s1: Session = await manager.create_session({ title: "First" })
    // 稍等以确保 updated_at 不同
    await new Promise((r) => setTimeout(r, 10))
    const s2: Session = await manager.create_session({ title: "Second" })
    const list: SessionListItem[] = await manager.list_sessions()
    expect(list.length).toBe(2)
    // 最新的在前
    expect(list[0].title).toBe("Second")
    expect(list[1].title).toBe("First")
  })

  it("should delete session", async () => {
    const session: Session = await manager.create_session()
    const deleted: boolean = await manager.delete_session(session.id)
    expect(deleted).toBe(true)
    const fetched: Session | null = await manager.get_session(session.id)
    expect(fetched).toBeNull()
  })

  it("should return false when deleting non-existent session", async () => {
    const deleted: boolean = await manager.delete_session("999")
    expect(deleted).toBe(false)
  })

  it("should count sessions", async () => {
    expect(await manager.count()).toBe(0)
    await manager.create_session()
    await manager.create_session()
    expect(await manager.count()).toBe(2)
  })
})

describe("V4 SessionManager chat", () => {
  let manager: SessionManager

  beforeEach(() => {
    const llm = new MockLlmAdapter("mock-v4")
    manager = new SessionManager(llm)
  })

  it("should chat in session and get response", async () => {
    const session: Session = await manager.create_session()
    const response = await manager.chat(session.id, "hello")
    expect(response.content).toBe("[Mock] hello")
    expect(response.finish_reason).toBe("stop")
  })

  it("should update message_count after chat", async () => {
    const session: Session = await manager.create_session()
    await manager.chat(session.id, "msg1")
    const updated: Session | null = await manager.get_session(session.id)
    expect(updated!.message_count).toBe(2) // user + assistant
  })

  it("should update updated_at after chat", async () => {
    const session: Session = await manager.create_session()
    const original_updated: number = session.updated_at
    await new Promise((r) => setTimeout(r, 10))
    await manager.chat(session.id, "msg")
    const updated: Session | null = await manager.get_session(session.id)
    expect(updated!.updated_at).toBeGreaterThan(original_updated)
  })

  it("should maintain independent histories per session", async () => {
    const s1: Session = await manager.create_session({ title: "S1" })
    const s2: Session = await manager.create_session({ title: "S2" })
    await manager.chat(s1.id, "msg in s1")
    await manager.chat(s2.id, "msg in s2")
    const h1 = await manager.get_history(s1.id)
    const h2 = await manager.get_history(s2.id)
    expect(h1.length).toBe(2)
    expect(h2.length).toBe(2)
    expect(h1[0].content).toBe("msg in s1")
    expect(h2[0].content).toBe("msg in s2")
  })

  it("should return empty history for non-existent session", async () => {
    const history = await manager.get_history("999")
    expect(history.length).toBe(0)
  })

  it("should clear session history", async () => {
    const session: Session = await manager.create_session()
    await manager.chat(session.id, "msg1")
    await manager.chat(session.id, "msg2")
    expect((await manager.get_history(session.id)).length).toBe(4)
    const cleared: boolean = await manager.clear_history(session.id)
    expect(cleared).toBe(true)
    expect((await manager.get_history(session.id)).length).toBe(0)
  })

  it("should return false when clearing non-existent session", async () => {
    const cleared: boolean = await manager.clear_history("999")
    expect(cleared).toBe(false)
  })

  it("should support multi-turn conversation in session", async () => {
    const session: Session = await manager.create_session()
    const r1 = await manager.chat(session.id, "turn 1")
    const r2 = await manager.chat(session.id, "turn 2")
    const r3 = await manager.chat(session.id, "turn 3")
    expect(r1.content).toBe("[Mock] turn 1")
    expect(r2.content).toBe("[Mock] turn 2")
    expect(r3.content).toBe("[Mock] turn 3")
    const history = await manager.get_history(session.id)
    expect(history.length).toBe(6) // 3 turns × 2 messages
  })
})

describe("V4 SessionManager persistence", () => {
  it("should persist sessions to storage", async () => {
    const storage = new MockStorage()
    const llm = new MockLlmAdapter("mock-v4")
    const manager = new SessionManager(llm, { storage })
    const session: Session = await manager.create_session({ title: "Persistent" })
    await manager.chat(session.id, "hello")
    // 验证存储中有数据
    const data = await storage.load("sessions") as Array<{ id: string; title: string }>
    expect(data).not.toBeNull()
    expect(data.length).toBe(1)
    expect(data[0].title).toBe("Persistent")
  })

  it("should load sessions from storage", async () => {
    const storage = new MockStorage()
    // 先保存一些会话数据
    await storage.save("sessions", [
      {
        id: "1",
        title: "Loaded Session",
        created_at: Date.now() - 1000,
        updated_at: Date.now() - 500,
        system_prompt: "test prompt",
        max_history: 30,
        messages: [
          { id: "1", content: "old user msg", role: "user", timestamp: Date.now() - 500 },
          { id: "2", content: "old assistant msg", role: "assistant", timestamp: Date.now() - 400 },
        ],
      },
    ])
    const llm = new MockLlmAdapter("mock-v4")
    const manager = new SessionManager(llm, { storage })
    await manager.load_from_storage()
    // 验证恢复的会话
    const session: Session | null = await manager.get_session("1")
    expect(session).not.toBeNull()
    expect(session!.title).toBe("Loaded Session")
    expect(session!.system_prompt).toBe("test prompt")
    expect(session!.message_count).toBe(2)
    // 验证历史恢复
    const history = await manager.get_history("1")
    expect(history.length).toBe(2)
    expect(history[0].content).toBe("old user msg")
    // 验证可以继续对话
    const response = await manager.chat("1", "new msg")
    expect(response.content).toBe("[Mock] new msg")
    // 新对话后历史应增长
    const updated_history = await manager.get_history("1")
    expect(updated_history.length).toBe(4)
  })

  it("should handle empty storage gracefully", async () => {
    const storage = new MockStorage()
    const llm = new MockLlmAdapter("mock-v4")
    const manager = new SessionManager(llm, { storage })
    await manager.load_from_storage()
    expect(await manager.count()).toBe(0)
  })

  it("should continue ID counter after load", async () => {
    const storage = new MockStorage()
    await storage.save("sessions", [
      {
        id: "5",
        title: "Session 5",
        created_at: Date.now(),
        updated_at: Date.now(),
        system_prompt: null,
        max_history: 50,
        messages: [],
      },
    ])
    const llm = new MockLlmAdapter("mock-v4")
    const manager = new SessionManager(llm, { storage })
    await manager.load_from_storage()
    const new_session: Session = await manager.create_session()
    expect(new_session.id).toBe("6")
  })
})
