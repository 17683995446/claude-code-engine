import { log_info } from "../../../core_infra/infra/global_logger.ts"
import { json_response } from "../../../core_infra/infra/http_middlewares.ts"
import type { HttpHandler } from "../../../core_infra/infra/http_router.ts"
import type { ApiRoute } from "./api_routes.ts"
import { CLI_VERSION } from "../cli_sdk/cli_args.ts"

/**
 * V24: 仪表盘数据源描述。
 *
 * 每个数据源对应一个已有的 API 端点，前端通过轮询这些端点聚合实时状态。
 */
export interface DashboardDataSource {
  /** 数据源唯一键（前端用于匹配渲染容器） */
  key: string
  /** 显示名称 */
  label: string
  /** HTTP 方法 */
  method: "GET" | "POST"
  /** API 路径 */
  path: string
  /** 是否需要鉴权 */
  requires_auth: boolean
  /** 刷新间隔（毫秒），0 表示跟随全局刷新 */
  refresh_interval_ms: number
  /** 描述 */
  description: string
}

/**
 * V24: 仪表盘使用的数据源列表。
 *
 * 复用已有的 API 端点，避免引入新的服务依赖。
 */
export const DASHBOARD_DATA_SOURCES: DashboardDataSource[] = [
  {
    key: "health",
    label: "Health",
    method: "GET",
    path: "/health",
    requires_auth: false,
    refresh_interval_ms: 5000,
    description: "Overall engine health report",
  },
  {
    key: "agents",
    label: "Agents",
    method: "GET",
    path: "/api/agents",
    requires_auth: true,
    refresh_interval_ms: 5000,
    description: "Registered agents and their status",
  },
  {
    key: "skills",
    label: "Skills",
    method: "GET",
    path: "/api/skills",
    requires_auth: true,
    refresh_interval_ms: 10000,
    description: "Registered skills",
  },
  {
    key: "plans",
    label: "Plans",
    method: "GET",
    path: "/api/plans",
    requires_auth: true,
    refresh_interval_ms: 5000,
    description: "Long-running plans and their phases",
  },
  {
    key: "tasks",
    label: "Tasks",
    method: "GET",
    path: "/api/tasks",
    requires_auth: true,
    refresh_interval_ms: 5000,
    description: "Task orchestrator queue",
  },
  {
    key: "daemon",
    label: "Daemon",
    method: "GET",
    path: "/api/daemon/status",
    requires_auth: true,
    refresh_interval_ms: 5000,
    description: "Daemon status and metrics",
  },
  {
    key: "sessions",
    label: "Sessions",
    method: "GET",
    path: "/api/sessions",
    requires_auth: true,
    refresh_interval_ms: 10000,
    description: "Active conversation sessions",
  },
  {
    key: "config",
    label: "Config",
    method: "GET",
    path: "/api/config",
    requires_auth: true,
    refresh_interval_ms: 30000,
    description: "Runtime configuration",
  },
]

/**
 * V24: 生成实时状态仪表盘 HTML 页面。
 *
 * 提供一个交互式 Web 界面，用户可以：
 *   - 一览引擎整体健康状态
 *   - 查看 Agent / Skill / Plan / Task / Daemon / Session 实时列表
 *   - 配置 API Key 访问受保护端点
 *   - 调整自动刷新间隔或手动刷新
 *
 * 设计原则（与 V23 调试控制台一致）：
 *   - 零前端依赖：纯 HTML + CSS + JS
 *   - 复用已有 API 端点：不引入新的服务依赖
 *   - 渐进增强：无 API Key 时仍显示健康状态
 */
export function generate_dashboard_html(base_url: string = ""): string {
  const sources_json = JSON.stringify(DASHBOARD_DATA_SOURCES)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Code Engine - Status Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f0f2f5; color: #333; font-size: 14px; }
    .header { background: linear-gradient(135deg, #2c3e50 0%, #1a252f 100%); color: white; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
    .header h1 { font-size: 18px; display: flex; align-items: center; gap: 10px; }
    .header .version { font-size: 12px; opacity: 0.8; background: rgba(255,255,255,0.15); padding: 2px 8px; border-radius: 10px; }
    .header-controls { display: flex; align-items: center; gap: 10px; }
    .header-controls label { font-size: 12px; opacity: 0.9; }
    .header-controls input[type="text"] { padding: 5px 8px; border: none; border-radius: 3px; font-size: 12px; width: 180px; font-family: monospace; }
    .header-controls input[type="number"] { padding: 5px 8px; border: none; border-radius: 3px; font-size: 12px; width: 70px; }
    .header-controls button { padding: 5px 12px; border: none; border-radius: 3px; cursor: pointer; font-size: 12px; background: #3498db; color: white; }
    .header-controls button:hover { background: #2980b9; }
    .header-controls button.refresh-btn { background: #2ecc71; }
    .header-controls button.refresh-btn:hover { background: #27ae60; }
    .header-controls .toggle { display: flex; align-items: center; gap: 5px; }
    .header-controls .toggle input { width: auto; }

    .container { padding: 20px; max-width: 1600px; margin: 0 auto; }

    .overview { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
    .stat-card { background: white; border-radius: 8px; padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border-left: 4px solid #3498db; transition: transform 0.15s; }
    .stat-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.12); }
    .stat-card .stat-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
    .stat-card .stat-value { font-size: 28px; font-weight: 700; color: #2c3e50; }
    .stat-card .stat-detail { font-size: 11px; color: #666; margin-top: 4px; }
    .stat-card.health-good { border-left-color: #2ecc71; }
    .stat-card.health-warn { border-left-color: #f39c12; }
    .stat-card.health-bad { border-left-color: #e74c3c; }
    .stat-card.health-unknown { border-left-color: #95a5a6; }

    .panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 15px; }
    .panel { background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden; display: flex; flex-direction: column; }
    .panel-header { padding: 12px 15px; background: #f8f9fa; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
    .panel-header h3 { font-size: 14px; color: #2c3e50; display: flex; align-items: center; gap: 8px; }
    .panel-header .panel-status { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: #ecf0f1; color: #7f8c8d; }
    .panel-status.ok { background: #d5f5e3; color: #1e8449; }
    .panel-status.error { background: #fadbd8; color: #c0392b; }
    .panel-status.loading { background: #d6eaf8; color: #2471a3; }
    .panel-body { padding: 12px 15px; overflow-y: auto; max-height: 350px; font-size: 13px; }
    .panel-body .empty { color: #999; font-style: italic; text-align: center; padding: 20px; }
    .panel-body .error-msg { color: #c0392b; font-family: monospace; font-size: 12px; padding: 8px; background: #fdf2f2; border-radius: 4px; }

    .item-row { padding: 8px 0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
    .item-row:last-child { border-bottom: none; }
    .item-row .item-main { flex: 1; min-width: 0; }
    .item-row .item-title { font-weight: 600; color: #2c3e50; word-break: break-word; }
    .item-row .item-sub { font-size: 11px; color: #888; margin-top: 2px; font-family: monospace; }
    .item-row .item-meta { font-size: 11px; color: #666; text-align: right; white-space: nowrap; }

    .status-pill { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
    .status-pill.running, .status-pill.active, .status-pill.ready, .status-pill.ok, .status-pill.success, .status-pill.in_progress { background: #d5f5e3; color: #1e8449; }
    .status-pill.stopped, .status-pill.paused, .status-pill.pending, .status-pill.queued { background: #fef9e7; color: #b7950b; }
    .status-pill.failed, .status-pill.error, .status-pill.cancelled, .status-pill.dead { background: #fadbd8; color: #c0392b; }
    .status-pill.completed, .status-pill.done { background: #d6eaf8; color: #1f618d; }
    .status-pill.unknown { background: #ecf0f1; color: #7f8c8d; }

    .footer { text-align: center; padding: 15px; color: #999; font-size: 11px; margin-top: 20px; }
    .footer .last-refresh { font-family: monospace; }

    .health-bar { height: 6px; background: #ecf0f1; border-radius: 3px; overflow: hidden; margin-top: 8px; }
    .health-bar-fill { height: 100%; background: #2ecc71; transition: width 0.3s; }
    .health-bar-fill.warn { background: #f39c12; }
    .health-bar-fill.bad { background: #e74c3c; }

    .config-grid { display: grid; grid-template-columns: 1fr 2fr; gap: 4px 12px; font-size: 12px; }
    .config-grid .config-key { color: #7f8c8d; font-family: monospace; }
    .config-grid .config-val { color: #2c3e50; font-family: monospace; word-break: break-all; }
  </style>
</head>
<body>
  <div class="header">
    <h1>
      <span>Claude Code Engine - Status Dashboard</span>
      <span class="version">v${CLI_VERSION}</span>
    </h1>
    <div class="header-controls">
      <div class="toggle">
        <label>Auto-refresh</label>
        <input type="checkbox" id="autoRefresh" checked>
      </div>
      <label>Interval (s)</label>
      <input type="number" id="refreshInterval" value="5" min="1" max="60">
      <label>API Key</label>
      <input type="text" id="apiKey" placeholder="Optional, for protected endpoints">
      <button class="refresh-btn" id="refreshBtn">Refresh Now</button>
    </div>
  </div>

  <div class="container">
    <div class="overview" id="overview"></div>
    <div class="panels" id="panels"></div>
    <div class="footer">
      Last refresh: <span class="last-refresh" id="lastRefresh">never</span>
    </div>
  </div>

  <script>
    const dataSources = ${sources_json};
    const baseUrl = "${base_url}";
    let autoRefreshEnabled = true;
    let refreshIntervalSec = 5;
    let refreshTimer = null;

    // ---- Helpers ----
    function $(id) { return document.getElementById(id); }

    function statusPill(status) {
      if (!status) return '<span class="status-pill unknown">unknown</span>';
      const s = String(status).toLowerCase();
      return '<span class="status-pill ' + s + '">' + s + '</span>';
    }

    function escapeHtml(s) {
      if (s === null || s === undefined) return '';
      return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    function formatTime(ts) {
      if (!ts) return '-';
      const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
      if (isNaN(d.getTime())) return String(ts);
      return d.toLocaleTimeString();
    }

    async function fetchSource(src) {
      const headers = { "Accept": "application/json" };
      if (src.requires_auth) {
        const key = $("apiKey").value.trim();
        if (key) headers["Authorization"] = "Bearer " + key;
      }
      const url = baseUrl + src.path;
      const resp = await fetch(url, { headers });
      if (!resp.ok) {
        throw new Error("HTTP " + resp.status + " " + resp.statusText);
      }
      const text = await resp.text();
      try { return JSON.parse(text); } catch { return { raw: text }; }
    }

    // ---- Overview cards ----
    function renderOverview(results) {
      const cards = [];
      const health = results.health && results.health.data;
      const healthStatus = health ? (health.status || health.overall || "unknown") : "unknown";
      const healthClass = healthStatus === "healthy" || healthStatus === "ok" || healthStatus === "up"
        ? "health-good"
        : healthStatus === "degraded" || healthStatus === "warn"
        ? "health-warn"
        : healthStatus === "unhealthy" || healthStatus === "down" || healthStatus === "error"
        ? "health-bad"
        : "health-unknown";

      cards.push({
        label: "Health",
        value: healthStatus,
        detail: health && health.checks ? health.checks.length + " checks" : "",
        cls: healthClass,
      });

      const agents = results.agents && results.agents.data;
      const agentCount = agents ? (agents.count || (agents.agents || []).length || 0) : 0;
      const runningAgents = agents && agents.agents ? agents.agents.filter(a => (a.status || "").toLowerCase() === "running").length : 0;
      cards.push({
        label: "Agents",
        value: agentCount,
        detail: runningAgents + " running",
        cls: agentCount > 0 ? "health-good" : "health-unknown",
      });

      const skills = results.skills && results.skills.data;
      const skillCount = skills ? (skills.count || (skills.skills || []).length || 0) : 0;
      cards.push({
        label: "Skills",
        value: skillCount,
        detail: skillCount > 0 ? "registered" : "none",
        cls: skillCount > 0 ? "health-good" : "health-unknown",
      });

      const plans = results.plans && results.plans.data;
      const planCount = plans ? (plans.count || (plans.plans || []).length || 0) : 0;
      const activePlans = plans && plans.plans ? plans.plans.filter(p => ["running", "in_progress", "active"].includes((p.status || "").toLowerCase())).length : 0;
      cards.push({
        label: "Plans",
        value: planCount,
        detail: activePlans + " active",
        cls: planCount > 0 ? "health-good" : "health-unknown",
      });

      const tasks = results.tasks && results.tasks.data;
      const taskCount = tasks ? (tasks.count || (tasks.tasks || []).length || 0) : 0;
      cards.push({
        label: "Tasks",
        value: taskCount,
        detail: taskCount > 0 ? "in queue" : "idle",
        cls: taskCount > 0 ? "health-good" : "health-unknown",
      });

      const sessions = results.sessions && results.sessions.data;
      const sessionCount = sessions ? (sessions.count || (sessions.sessions || []).length || 0) : 0;
      cards.push({
        label: "Sessions",
        value: sessionCount,
        detail: sessionCount > 0 ? "active" : "none",
        cls: sessionCount > 0 ? "health-good" : "health-unknown",
      });

      const daemon = results.daemon && results.daemon.data;
      const daemonStatus = daemon ? (daemon.status || daemon.state || "unknown") : "unknown";
      const daemonClass = ("" + daemonStatus).toLowerCase() === "running" ? "health-good" : "health-unknown";
      cards.push({
        label: "Daemon",
        value: daemonStatus,
        detail: daemon && daemon.metrics ? daemon.metrics.plans_recovered + " recovered" : "",
        cls: daemonClass,
      });

      const config = results.config && results.config.data;
      const configCount = config ? Object.keys(config).length : 0;
      cards.push({
        label: "Config Keys",
        value: configCount,
        detail: configCount > 0 ? "loaded" : "none",
        cls: configCount > 0 ? "health-good" : "health-unknown",
      });

      $("overview").innerHTML = cards.map(c =>
        '<div class="stat-card ' + c.cls + '">' +
          '<div class="stat-label">' + escapeHtml(c.label) + '</div>' +
          '<div class="stat-value">' + escapeHtml(c.value) + '</div>' +
          '<div class="stat-detail">' + escapeHtml(c.detail) + '</div>' +
        '</div>'
      ).join("");
    }

    // ---- Panels ----
    function renderPanels(results) {
      const html = dataSources.map(src => {
        const result = results[src.key];
        let body = "";
        let statusCls = "loading";
        let statusText = "loading";

        if (!result) {
          body = '<div class="empty">Waiting...</div>';
        } else if (result.error) {
          body = '<div class="error-msg">' + escapeHtml(result.error) + '</div>';
          statusCls = "error";
          statusText = "error";
        } else {
          statusCls = "ok";
          statusText = "ok";
          body = renderPanelBody(src.key, result.data);
        }

        return '<div class="panel">' +
          '<div class="panel-header">' +
            '<h3>' + escapeHtml(src.label) + '</h3>' +
            '<span class="panel-status ' + statusCls + '">' + statusText + '</span>' +
          '</div>' +
          '<div class="panel-body">' + body + '</div>' +
        '</div>';
      }).join("");
      $("panels").innerHTML = html;
    }

    function renderPanelBody(key, data) {
      if (data === null || data === undefined) return '<div class="empty">No data</div>';

      if (key === "health") {
        const status = data.status || data.overall || "unknown";
        const checks = data.checks || [];
        const pct = checks.length > 0
          ? Math.round(checks.filter(c => c.healthy || c.status === "ok").length / checks.length * 100)
          : (status === "healthy" ? 100 : 0);
        const barCls = pct === 100 ? "" : pct >= 50 ? "warn" : "bad";
        let html = '<div>' + statusPill(status) + ' ' + pct + '% healthy</div>';
        html += '<div class="health-bar"><div class="health-bar-fill ' + barCls + '" style="width:' + pct + '%"></div></div>';
        if (checks.length > 0) {
          html += checks.map(c =>
            '<div class="item-row"><div class="item-main"><div class="item-title">' + escapeHtml(c.name || c.component) + '</div></div><div class="item-meta">' + statusPill(c.healthy ? "ok" : "bad") + '</div></div>'
          ).join("");
        }
        return html;
      }

      if (key === "agents") {
        const list = data.agents || [];
        if (list.length === 0) return '<div class="empty">No agents registered</div>';
        return list.map(a =>
          '<div class="item-row">' +
            '<div class="item-main"><div class="item-title">' + escapeHtml(a.name || a.id) + '</div><div class="item-sub">' + escapeHtml(a.id) + (a.capabilities ? ' | ' + a.capabilities.join(', ') : '') + '</div></div>' +
            '<div class="item-meta">' + statusPill(a.status) + '</div>' +
          '</div>'
        ).join("");
      }

      if (key === "skills") {
        const list = data.skills || [];
        if (list.length === 0) return '<div class="empty">No skills registered</div>';
        return list.map(s =>
          '<div class="item-row">' +
            '<div class="item-main"><div class="item-title">' + escapeHtml(s.name || s.id) + '</div><div class="item-sub">' + escapeHtml(s.id) + (s.description ? ' | ' + s.description : '') + '</div></div>' +
            '<div class="item-meta">' + (s.version || '') + '</div>' +
          '</div>'
        ).join("");
      }

      if (key === "plans") {
        const list = data.plans || [];
        if (list.length === 0) return '<div class="empty">No plans</div>';
        return list.map(p =>
          '<div class="item-row">' +
            '<div class="item-main"><div class="item-title">' + escapeHtml(p.name || p.id) + '</div><div class="item-sub">' + escapeHtml(p.id) + (p.current_phase !== undefined ? ' | phase ' + p.current_phase + '/' + (p.total_phases || '?') : '') + '</div></div>' +
            '<div class="item-meta">' + statusPill(p.status) + '</div>' +
          '</div>'
        ).join("");
      }

      if (key === "tasks") {
        const list = data.tasks || data.summaries || [];
        if (list.length === 0) return '<div class="empty">No tasks</div>';
        return list.map(t =>
          '<div class="item-row">' +
            '<div class="item-main"><div class="item-title">' + escapeHtml(t.name || t.id) + '</div><div class="item-sub">' + escapeHtml(t.id) + (t.description ? ' | ' + t.description : '') + '</div></div>' +
            '<div class="item-meta">' + statusPill(t.status) + '</div>' +
          '</div>'
        ).join("");
      }

      if (key === "daemon") {
        const status = data.status || data.state || "unknown";
        let html = '<div class="item-row"><div class="item-main"><div class="item-title">Daemon State</div></div><div class="item-meta">' + statusPill(status) + '</div></div>';
        if (data.metrics) {
          const m = data.metrics;
          html += '<div class="item-row"><div class="item-main"><div class="item-title">Uptime</div></div><div class="item-meta">' + escapeHtml(formatTime(m.started_at)) + '</div></div>';
          html += '<div class="item-row"><div class="item-main"><div class="item-title">Plans Recovered</div></div><div class="item-meta">' + escapeHtml(m.plans_recovered || 0) + '</div></div>';
          html += '<div class="item-row"><div class="item-main"><div class="item-title">Recovery Failures</div></div><div class="item-meta">' + escapeHtml(m.recovery_failures || 0) + '</div></div>';
          html += '<div class="item-row"><div class="item-main"><div class="item-title">Health Checks</div></div><div class="item-meta">' + escapeHtml(m.health_checks || 0) + '</div></div>';
        }
        return html;
      }

      if (key === "sessions") {
        const list = data.sessions || [];
        if (list.length === 0) return '<div class="empty">No active sessions</div>';
        return list.map(s =>
          '<div class="item-row">' +
            '<div class="item-main"><div class="item-title">' + escapeHtml(s.title || s.id) + '</div><div class="item-sub">' + escapeHtml(s.id) + (s.message_count !== undefined ? ' | ' + s.message_count + ' msgs' : '') + '</div></div>' +
            '<div class="item-meta">' + escapeHtml(formatTime(s.updated_at || s.created_at)) + '</div>' +
          '</div>'
        ).join("");
      }

      if (key === "config") {
        const keys = Object.keys(data).filter(k => k !== "status" && k !== "loaded_at");
        if (keys.length === 0) return '<div class="empty">No config keys</div>';
        const shown = keys.slice(0, 30);
        let html = '<div class="config-grid">';
        for (const k of shown) {
          html += '<div class="config-key">' + escapeHtml(k) + '</div><div class="config-val">' + escapeHtml(JSON.stringify(data[k])) + '</div>';
        }
        html += '</div>';
        if (keys.length > 30) html += '<div class="empty">... and ' + (keys.length - 30) + ' more</div>';
        return html;
      }

      // Fallback: pretty-print JSON
      return '<pre style="font-size:11px;white-space:pre-wrap;word-break:break-all;">' + escapeHtml(JSON.stringify(data, null, 2)) + '</pre>';
    }

    // ---- Refresh logic ----
    async function refreshAll() {
      const results = {};
      const promises = dataSources.map(async src => {
        try {
          const data = await fetchSource(src);
          results[src.key] = { data, error: null };
        } catch (e) {
          results[src.key] = { data: null, error: e.message };
        }
      });
      await Promise.all(promises);
      renderOverview(results);
      renderPanels(results);
      $("lastRefresh").textContent = new Date().toLocaleTimeString();
    }

    function scheduleRefresh() {
      if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
      if (autoRefreshEnabled) {
        refreshTimer = setInterval(refreshAll, refreshIntervalSec * 1000);
      }
    }

    // ---- Event handlers ----
    $("refreshBtn").onclick = () => { refreshAll(); };
    $("autoRefresh").onchange = (e) => {
      autoRefreshEnabled = e.target.checked;
      scheduleRefresh();
    };
    $("refreshInterval").onchange = (e) => {
      refreshIntervalSec = Math.max(1, Math.min(60, parseInt(e.target.value) || 5));
      scheduleRefresh();
    };

    // ---- Initial load ----
    refreshAll();
    scheduleRefresh();
  </script>
</body>
</html>`
}

/**
 * V24: 设置状态仪表盘路由。
 *
 * 提供两个端点：
 *   GET /api/dashboard       - 交互式状态仪表盘（HTML 页面）
 *   GET /api/dashboard/spec  - 仪表盘数据源元数据（JSON）
 *
 * 无需鉴权，方便运维人员快速查看状态。
 * 受保护的 API 端点仍需通过仪表盘页面的 API Key 输入框提供凭据。
 */
export function setup_dashboard_routes(): ApiRoute[] {
  log_info("dashboard_routes_setup")

  const dashboard_handler: HttpHandler = async () => {
    const html: string = generate_dashboard_html()
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })
  }

  const spec_handler: HttpHandler = async () => {
    return json_response({
      data_sources: DASHBOARD_DATA_SOURCES,
      total: DASHBOARD_DATA_SOURCES.length,
      version: CLI_VERSION,
    }, 200)
  }

  return [
    { method: "GET", path: "/api/dashboard", handler: dashboard_handler },
    { method: "GET", path: "/api/dashboard/spec", handler: spec_handler },
  ]
}
