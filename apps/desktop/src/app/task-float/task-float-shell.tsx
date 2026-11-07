/**
 * Task float shell — the whole surface of `?win=taskfloat`.
 *
 * The window is frameless and transparent; this component paints the rounded
 * card, the drag header, the pin / close controls, the settings strip and the
 * list. Data comes from `./data`, never from DOM or the database.
 */

import { useStore } from '@nanostores/react'
import { useEffect, useMemo, useState } from 'react'

import {
  $taskItems,
  $taskPrefs,
  startTaskCollection,
  type TaskItem,
  type TaskKind,
  toggleShowEnded,
  toggleTaskKind
} from '@/app/task-float/data'
import { Codicon } from '@/components/ui/codicon'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n/context'
import { $taskFloatPinned, closeTaskFloat, setTaskFloatPinned } from '@/store/task-float'

type Copy = {
  title: string
  settings: string
  close: string
  pinOn: string
  pinOff: string
  running: (n: number) => string
  done: (n: number) => string
  empty: string
  emptyHint: string
  kinds: Record<TaskKind, string>
  status: Record<TaskItem['status'], string>
  showEnded: string
  justNow: string
  minutes: (n: number) => string
  hours: (n: number) => string
  days: (n: number) => string
}

const EN: Copy = {
  close: 'Close',
  done: n => `${n} done`,
  empty: 'No tasks yet',
  emptyHint: 'Work that finishes while this window is open shows up here.',
  hours: n => `${n}h ago`,
  justNow: 'now',
  kinds: { cron: 'Cron jobs', proc: 'Background processes', sub: 'Subagents', turn: 'Chat turns' },
  minutes: n => `${n}m ago`,
  days: n => `${n}d ago`,
  pinOff: 'Unpin (stop floating above other apps)',
  pinOn: 'Pin above other apps',
  running: n => `${n} running`,
  settings: 'What to show',
  showEnded: 'Show ended processes',
  status: { done: 'done', ended: 'ended', failed: 'failed', running: 'running', stopped: 'stopped' },
  title: 'Tasks'
}

const ZH: Copy = {
  close: '关闭',
  done: n => `${n} 完成`,
  empty: '还没有任务',
  emptyHint: '窗口开着时完成的任务会出现在这里。',
  hours: n => `${n} 小时前`,
  justNow: '刚刚',
  kinds: { cron: '定时任务', proc: '后台进程', sub: '子代理', turn: '会话回合' },
  minutes: n => `${n} 分钟前`,
  days: n => `${n} 天前`,
  pinOff: '取消置顶（不再浮在其他应用上方）',
  pinOn: '置顶，浮在其他应用上方',
  running: n => `${n} 运行`,
  settings: '显示内容',
  showEnded: '显示已结束的进程',
  status: { done: '完成', ended: '结束', failed: '失败', running: '运行中', stopped: '中断' },
  title: '任务'
}

function relative(ts: number, copy: Copy, now: number): string {
  const diff = now - ts

  if (!Number.isFinite(diff) || diff < 0) {
    return ''
  }

  const minutes = Math.floor(diff / 60000)

  if (minutes < 1) {
    return copy.justNow
  }

  if (minutes < 60) {
    return copy.minutes(minutes)
  }

  const hours = Math.floor(minutes / 60)

  return hours < 24 ? copy.hours(hours) : copy.days(Math.floor(hours / 24))
}

const GLYPH: Record<TaskItem['status'], string> = {
  done: 'pass-filled',
  ended: 'circle-slash',
  failed: 'error',
  running: 'loading',
  stopped: 'debug-pause'
}

function statusColor(status: TaskItem['status']): string {
  if (status === 'running') {
    return 'var(--ui-accent)'
  }

  if (status === 'failed') {
    return 'var(--dt-destructive)'
  }

  return 'var(--ui-text-tertiary)'
}

function Row({ copy, item, now }: { copy: Copy; item: TaskItem; now: number }) {
  return (
    <div className="flex items-start gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-[color-mix(in_srgb,var(--ui-text-primary)_6%,transparent)]">
      <Codicon
        className={item.status === 'running' ? 'codicon-modifier-spin' : undefined}
        name={GLYPH[item.status]}
        size={12}
        style={{ color: statusColor(item.status), marginTop: 2 }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-(--ui-text-primary)">{item.title}</div>
        <div className="truncate text-[11px] text-(--ui-text-tertiary)">
          {copy.kinds[item.kind]} · {copy.status[item.status]}
          {item.detail ? ` · ${item.detail}` : ''}
        </div>
      </div>
      <span className="shrink-0 text-[11px] text-(--ui-text-quaternary)">{relative(item.ts, copy, now)}</span>
    </div>
  )
}

export function TaskFloatShell() {
  const { locale } = useI18n()
  const copy = locale.startsWith('zh') ? ZH : EN
  const items = useStore($taskItems)
  const prefs = useStore($taskPrefs)
  const pinned = useStore($taskFloatPinned)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => startTaskCollection(), [])

  // Relative times age; one tick a minute is enough and costs nothing while
  // the window is hidden (Chromium throttles background timers).
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)

    return () => clearInterval(timer)
  }, [])

  const visible = useMemo(
    () =>
      items.filter(
        item => prefs.kinds[item.kind] && (prefs.showEnded || item.status !== 'ended')
      ),
    [items, prefs]
  )

  const running = visible.filter(item => item.status === 'running').length
  const done = visible.filter(item => item.status === 'done').length
  const kinds: TaskKind[] = ['turn', 'sub', 'proc', 'cron']

  return (
    <div className="h-screen w-screen p-1.5">
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) shadow-nous">
        <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-(--ui-stroke-secondary) px-2.5 [-webkit-app-region:drag]">
          <span className="text-xs font-semibold text-(--ui-text-primary)">{copy.title}</span>
          <span className="text-[11px] text-(--ui-text-tertiary)">
            {running > 0 ? copy.running(running) : copy.done(done)}
          </span>
          <span className="flex-1" />
          <button
            aria-label={copy.settings}
            className="flex size-6 items-center justify-center rounded-md text-(--ui-text-tertiary) hover:bg-[color-mix(in_srgb,var(--ui-text-primary)_8%,transparent)] [-webkit-app-region:no-drag]"
            onClick={() => setSettingsOpen(v => !v)}
            title={copy.settings}
            type="button"
          >
            <Codicon name="settings-gear" size={14} />
          </button>
          <button
            aria-label={pinned ? copy.pinOff : copy.pinOn}
            className={`flex size-6 items-center justify-center rounded-md hover:bg-[color-mix(in_srgb,var(--ui-text-primary)_8%,transparent)] [-webkit-app-region:no-drag] ${
              pinned ? 'text-(--ui-accent)' : 'text-(--ui-text-tertiary)'
            }`}
            onClick={() => setTaskFloatPinned(!pinned)}
            title={pinned ? copy.pinOff : copy.pinOn}
            type="button"
          >
            <Codicon name="pin" size={14} />
          </button>
          <button
            aria-label={copy.close}
            className="flex size-6 items-center justify-center rounded-md text-(--ui-text-tertiary) hover:bg-[color-mix(in_srgb,var(--ui-text-primary)_8%,transparent)] [-webkit-app-region:no-drag]"
            onClick={() => closeTaskFloat()}
            title={copy.close}
            type="button"
          >
            <Codicon name="close" size={14} />
          </button>
        </div>

        {settingsOpen ? (
          <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-1.5 py-1.5">
            {kinds.map(kind => (
              <label
                className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-1.5 py-1 text-xs text-(--ui-text-secondary) hover:bg-[color-mix(in_srgb,var(--ui-text-primary)_6%,transparent)]"
                key={kind}
              >
                <span>{copy.kinds[kind]}</span>
                <Switch
                  checked={prefs.kinds[kind]}
                  onCheckedChange={() => toggleTaskKind(kind)}
                  size="xs"
                />
              </label>
            ))}
            <label className="mt-1 flex cursor-pointer items-center justify-between gap-3 rounded-md px-1.5 py-1 text-xs text-(--ui-text-secondary) hover:bg-[color-mix(in_srgb,var(--ui-text-primary)_6%,transparent)]">
              <span>{copy.showEnded}</span>
              <Switch checked={prefs.showEnded} onCheckedChange={() => toggleShowEnded()} size="xs" />
            </label>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 text-center">
            <span className="text-xs text-(--ui-text-secondary)">{copy.empty}</span>
            <span className="text-[11px] text-(--ui-text-quaternary)">{copy.emptyHint}</span>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-1 py-0.5">
            {visible.map(item => (
              <Row copy={copy} item={item} key={item.key} now={now} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
