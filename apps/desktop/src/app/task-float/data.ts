/**
 * Task-float data layer.
 *
 * Everything comes from the same two doors the rest of the app uses: gateway
 * JSON-RPC (`host.request`) and the inbound event tap (`onGatewayEvent`).
 *
 *   - 会话     `session.active_list` polled. The poll is what makes other
 *              sessions show up: gateway events are session-scoped, and a
 *              monitor that never opens a session never hears about one.
 *              `message.complete` is kept as a supplement for when this window
 *              does happen to be subscribed.
 *   - 子代理   `subagent.start` + `subagent.complete` events
 *   - 进程     `agents.list` (registry-wide), diffed to spot endings
 *   - 定时任务 `cron.manage`, last_run_at / last_status
 */

import { atom } from 'nanostores'

import { onGatewayEvent } from '@/contrib/events'
import { host } from '@/sdk'

export type TaskKind = 'cron' | 'proc' | 'sub' | 'turn'
export type TaskStatus = 'done' | 'ended' | 'failed' | 'running' | 'stopped'

export interface TaskItem {
  key: string
  kind: TaskKind
  title: string
  status: TaskStatus
  ts: number
  detail: string
}

export interface TaskPrefs {
  /** One line per row: status light and title only. */
  compact: boolean
  kinds: Record<TaskKind, boolean>
  /** Keep only what is happening now. */
  runningOnly: boolean
  showEnded: boolean
}

const MAX_ITEMS = 24
const SESSION_POLL_MS = 5000
const CRON_POLL_MS = 60000
const PROCESS_POLL_MS = 12000
const PREFS_KEY = 'hermes.taskFloat.prefs.v1'

const DEFAULT_PREFS: TaskPrefs = {
  compact: true,
  kinds: { cron: true, proc: true, sub: true, turn: true },
  runningOnly: false,
  showEnded: false
}

export const $taskItems = atom<TaskItem[]>([])
export const $taskPrefs = atom<TaskPrefs>(readPrefs())

const TURN_STATUS: Record<string, TaskStatus> = { complete: 'done', error: 'failed', interrupted: 'stopped' }

const SUB_STATUS: Record<string, TaskStatus> = {
  completed: 'done',
  error: 'failed',
  failed: 'failed',
  interrupted: 'stopped',
  queued: 'running',
  running: 'running',
  timeout: 'failed'
}

// LiveSessionStatus: `idle` is the only one with nothing in flight.
const IDLE = 'idle'

function readPrefs(): TaskPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null')
    const kinds = raw?.kinds

    if (!kinds || typeof kinds !== 'object') {
      return DEFAULT_PREFS
    }

    return {
      compact: raw.compact !== false,
      kinds: {
        cron: kinds.cron !== false,
        proc: kinds.proc !== false,
        sub: kinds.sub !== false,
        turn: kinds.turn !== false
      },
      runningOnly: raw.runningOnly === true,
      showEnded: raw.showEnded === true
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function setTaskPrefs(next: TaskPrefs): void {
  $taskPrefs.set(next)

  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  } catch {
    // Private mode / quota: keep the in-memory value.
  }
}

export function toggleTaskFlag(flag: 'compact' | 'runningOnly' | 'showEnded'): void {
  const prefs = $taskPrefs.get()

  setTaskPrefs({ ...prefs, [flag]: !prefs[flag] })
}

export function toggleTaskKind(kind: TaskKind): void {
  const prefs = $taskPrefs.get()

  setTaskPrefs({ ...prefs, kinds: { ...prefs.kinds, [kind]: !prefs.kinds[kind] } })
}

export function pushTaskItem(item: TaskItem): void {
  const rest = $taskItems.get().filter(row => row.key !== item.key)

  $taskItems.set([item, ...rest].sort((a, b) => b.ts - a.ts).slice(0, MAX_ITEMS))
}

function textHead(value: unknown, max = 64): string {
  const line = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()

  return line.slice(0, max)
}

// ── sessions (turns) ────────────────────────────────────────────────────────

// Sessions that were busy on the previous poll. One leaving the set is a turn
// that just finished, which no event tells this window about.
let busySessions = new Set<string>()

async function pullSessions(): Promise<void> {
  try {
    const res = await host.request<{ sessions?: any[] }>('session.active_list', {})
    const rows = res?.sessions || []
    const busy = new Set<string>()

    for (const row of rows) {
      if (!row?.id) {
        continue
      }

      const title = textHead(row.title) || textHead(row.preview) || `会话 ${String(row.id).slice(0, 6)}`
      const lastActive = Number(row.last_active) * 1000

      if (String(row.status || IDLE) !== IDLE) {
        busy.add(row.id)
        pushTaskItem({
          detail: textHead(row.model, 20),
          key: `sess:${row.id}`,
          kind: 'turn',
          status: 'running',
          title,
          ts: Number.isFinite(lastActive) && lastActive > 0 ? lastActive : Date.now()
        })

        continue
      }

      if (busySessions.has(row.id)) {
        pushTaskItem({ detail: '', key: `sess:${row.id}`, kind: 'turn', status: 'done', title, ts: Date.now() })
      }
    }

    busySessions = busy
  } catch {
    // Gateway not ready yet: stay silent, the next tick tries again.
  }
}

function onTurnComplete(event: { payload?: any; session_id?: string }): void {
  const payload = event?.payload || {}

  if (!event?.session_id) {
    return
  }

  pushTaskItem({
    detail: payload.error ? textHead(payload.error, 60) : '',
    key: `sess:${event.session_id}`,
    kind: 'turn',
    status: TURN_STATUS[String(payload.status || '')] ?? 'done',
    title: textHead(payload.text) || `会话 ${String(event.session_id).slice(0, 6)}`,
    ts: Date.now()
  })
}

// ── subagents ───────────────────────────────────────────────────────────────

function onSubagentStart(event: { payload?: any }): void {
  const payload = event?.payload || {}
  const id = payload.subagent_id || payload.goal || 'subagent'

  pushTaskItem({
    detail: textHead(payload.model, 20),
    key: `sub:${id}`,
    kind: 'sub',
    status: 'running',
    title: textHead(payload.goal) || '子代理',
    ts: Date.now()
  })
}

function onSubagentComplete(event: { payload?: any }): void {
  const payload = event?.payload || {}
  const id = payload.subagent_id || payload.goal || 'subagent'
  const seconds = Number(payload.duration_seconds || 0)

  pushTaskItem({
    detail: seconds > 0 ? `${Math.round(seconds)}s` : '',
    key: `sub:${id}`,
    kind: 'sub',
    status: SUB_STATUS[String(payload.status || '')] ?? 'done',
    title: textHead(payload.goal) || '子代理',
    ts: Date.now()
  })
}

// ── cron ────────────────────────────────────────────────────────────────────

async function pullCron(): Promise<void> {
  try {
    const res = await host.request<{ jobs?: any[] }>('cron.manage', { action: 'list', include_disabled: true })

    for (const job of res?.jobs || []) {
      if (!job?.job_id || !job.last_run_at) {
        continue
      }

      const ts = Date.parse(job.last_run_at)

      if (!Number.isFinite(ts)) {
        continue
      }

      pushTaskItem({
        detail: textHead(job.schedule, 20),
        key: `cron:${job.job_id}`,
        kind: 'cron',
        status: /err|fail/i.test(String(job.last_status || '')) ? 'failed' : 'done',
        title: textHead(job.name) || job.job_id,
        ts
      })
    }
  } catch {
    // Gateway not ready / no cron store: this source stays silent.
  }
}

// ── background processes ────────────────────────────────────────────────────

// Keys seen running on the previous poll. A process leaving the registry has
// ended, and `agents.list` carries no exit code, so "ended" is the honest word.
let liveProcessKeys = new Set<string>()

async function pullProcesses(): Promise<void> {
  try {
    const res = await host.request<{ processes?: any[] }>('agents.list', {})
    const rows = res?.processes || []
    const seen = new Set<string>()

    for (const proc of rows) {
      if (!proc?.session_id || String(proc.status || '') !== 'running') {
        continue
      }

      seen.add(`proc:${proc.session_id}`)
      pushTaskItem({
        detail: proc.uptime ? `${proc.uptime}s` : '',
        key: `proc:${proc.session_id}`,
        kind: 'proc',
        status: 'running',
        title: textHead(proc.command) || '后台进程',
        ts: Date.now()
      })
    }

    for (const key of liveProcessKeys) {
      if (!seen.has(key)) {
        const previous = $taskItems.get().find(row => row.key === key)

        pushTaskItem({
          detail: '',
          key,
          kind: 'proc',
          status: 'ended',
          title: previous?.title || '后台进程',
          ts: Date.now()
        })
      }
    }

    liveProcessKeys = seen
  } catch {
    // Same contract as cron: a failed poll is not an event.
  }
}

/** Start collecting. Returns a disposer (dev reloads re-mount this shell). */
export function startTaskCollection(): () => void {
  const disposers = [
    onGatewayEvent('message.complete', onTurnComplete as never),
    onGatewayEvent('subagent.start', onSubagentStart as never),
    onGatewayEvent('subagent.complete', onSubagentComplete as never)
  ]

  void pullSessions()
  void pullCron()
  void pullProcesses()

  const sessionTimer = setInterval(() => void pullSessions(), SESSION_POLL_MS)
  const cronTimer = setInterval(() => void pullCron(), CRON_POLL_MS)
  const processTimer = setInterval(() => void pullProcesses(), PROCESS_POLL_MS)

  return () => {
    for (const dispose of disposers) {
      dispose()
    }

    clearInterval(sessionTimer)
    clearInterval(cronTimer)
    clearInterval(processTimer)
  }
}
