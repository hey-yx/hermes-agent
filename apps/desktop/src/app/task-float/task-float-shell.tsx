/**
 * Task float shell — the whole surface of `?win=taskfloat`.
 *
 * The window is frameless and transparent; this component paints the rounded
 * card, the drag header, pin / collapse / close controls, the settings strip
 * and the list. Data comes from `./data`, never from DOM or the database.
 *
 * Two densities: compact (default) is one line per row, the status light plus
 * the title, which is what you can read at a glance from another app. Expanded
 * adds the kind, the status word and the relative time.
 */

import { useStore } from '@nanostores/react'
import { useEffect, useMemo, useState } from 'react'

import {
  $taskItems,
  $taskPrefs,
  startTaskCollection,
  type TaskItem,
  type TaskKind,
  toggleTaskFlag,
  toggleTaskKind
} from '@/app/task-float/data'
import { Codicon } from '@/components/ui/codicon'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n/context'
import { $taskFloatPinned, closeTaskFloat, setTaskFloatPinned } from '@/store/task-float'

type Copy = {
  collapse: string
  close: string
  compact: string
  days: (n: number) => string
  done: (n: number) => string
  empty: string
  emptyHint: string
  expand: string
  hours: (n: number) => string
  justNow: string
  kinds: Record<TaskKind, string>
  minutes: (n: number) => string
  pinOff: string
  pinOn: string
  running: (n: number) => string
  runningOnly: string
  settings: string
  showEnded: string
  status: Record<TaskItem['status'], string>
}

const EN: Copy = {
  close: 'Close',
  collapse: 'Collapse to one line per task',
  compact: 'One line per task',
  days: n => `${n}d ago`,
  done: n => `${n} done`,
  empty: 'No tasks yet',
  emptyHint: 'Work that finishes while this window is open shows up here.',
  expand: 'Show details',
  hours: n => `${n}h ago`,
  justNow: 'now',
  kinds: { cron: 'Cron jobs', proc: 'Background processes', sub: 'Subagents', turn: 'Chat turns' },
  minutes: n => `${n}m ago`,
  pinOff: 'Unpin (stop floating above other apps)',
  pinOn: 'Pin above other apps',
  running: n => `${n} running`,
  runningOnly: 'Only running tasks',
  settings: 'What to show',
  showEnded: 'Show ended processes',
  status: { done: 'done', ended: 'ended', failed: 'failed', running: 'running', stopped: 'stopped' }
}

const ZH: Copy = {
  close: '关闭',
  collapse: '折叠成一行',
  compact: '每行只显示一行',
  days: n => `${n} 天前`,
  done: n => `${n} 完成`,
  empty: '还没有任务',
  emptyHint: '窗口开着时完成的任务会出现在这里。',
  expand: '显示详情',
  hours: n => `${n} 小时前`,
  justNow: '刚刚',
  kinds: { cron: '定时任务', proc: '后台进程', sub: '子代理', turn: '会话回合' },
  minutes: n => `${n} 分钟前`,
  pinOff: '取消置顶（不再浮在其他应用上方）',
  pinOn: '置顶，浮在其他应用上方',
  running: n => `${n} 运行`,
  runningOnly: '只看运行中',
  settings: '显示内容',
  showEnded: '显示已结束的进程',
  status: { done: '完成', ended: '结束', failed: '失败', running: '运行中', stopped: '中断' }
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

const HOVER = 'hover:bg-[color-mix(in_srgb,var(--ui-text-primary)_6%,transparent)]'

function Light({ item }: { item: TaskItem }) {
  return (
    <Codicon
      className={item.status === 'running' ? 'codicon-modifier-spin' : undefined}
      name={GLYPH[item.status]}
      size={11}
      style={{ color: statusColor(item.status), marginTop: 1 }}
    />
  )
}

function Row({ compact, copy, item, now }: { compact: boolean; copy: Copy; item: TaskItem; now: number }) {
  if (compact) {
    return (
      <div className={`flex items-center gap-1.5 rounded px-1.5 py-[3px] ${HOVER}`} title={copy.status[item.status]}>
        <Light item={item} />
        <span className="min-w-0 flex-1 truncate text-[11px] text-(--ui-text-primary)">{item.title}</span>
      </div>
    )
  }

  return (
    <div className={`flex items-start gap-2 rounded px-1.5 py-1 ${HOVER}`}>
      <Light item={item} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] text-(--ui-text-primary)">{item.title}</div>
        <div className="truncate text-[10px] text-(--ui-text-tertiary)">
          {copy.kinds[item.kind]} · {copy.status[item.status]}
          {item.detail ? ` · ${item.detail}` : ''}
        </div>
      </div>
      <span className="shrink-0 text-[10px] text-(--ui-text-quaternary)">{relative(item.ts, copy, now)}</span>
    </div>
  )
}

function IconButton({
  active,
  label,
  name,
  onClick
}: {
  active?: boolean
  label: string
  name: string
  onClick: () => void
}) {
  return (
    <button
      aria-label={label}
      className={`flex size-5 items-center justify-center rounded [-webkit-app-region:no-drag] hover:bg-[color-mix(in_srgb,var(--ui-text-primary)_8%,transparent)] ${
        active ? 'text-(--ui-accent)' : 'text-(--ui-text-tertiary)'
      }`}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Codicon name={name} size={13} />
    </button>
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

  // Relative times age; half a minute is enough for a glance surface.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)

    return () => clearInterval(timer)
  }, [])

  const visible = useMemo(
    () =>
      items.filter(
        item =>
          prefs.kinds[item.kind] &&
          (prefs.showEnded || item.status !== 'ended') &&
          (!prefs.runningOnly || item.status === 'running')
      ),
    [items, prefs]
  )

  const running = visible.filter(item => item.status === 'running').length
  const done = visible.filter(item => item.status === 'done').length
  const kinds: TaskKind[] = ['turn', 'sub', 'proc', 'cron']

  return (
    <div className="h-screen w-screen p-1.5">
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) shadow-nous">
        <div className="flex h-7 shrink-0 items-center gap-1 border-b border-(--ui-stroke-secondary) px-1.5 [-webkit-app-region:drag]">
          <span className="shrink-0 text-[11px] font-medium text-(--ui-text-primary)">
            {running > 0 ? copy.running(running) : copy.done(done)}
          </span>
          <span className="flex-1" />
          <IconButton
            active={!prefs.compact}
            label={prefs.compact ? copy.expand : copy.collapse}
            name={prefs.compact ? 'chevron-down' : 'chevron-up'}
            onClick={() => toggleTaskFlag('compact')}
          />
          <IconButton
            active={settingsOpen}
            label={copy.settings}
            name="settings-gear"
            onClick={() => setSettingsOpen(v => !v)}
          />
          <IconButton
            active={pinned}
            label={pinned ? copy.pinOff : copy.pinOn}
            name="pin"
            onClick={() => setTaskFloatPinned(!pinned)}
          />
          <IconButton label={copy.close} name="close" onClick={() => closeTaskFloat()} />
        </div>

        {settingsOpen ? (
          <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-1.5 py-1.5">
            {kinds.map(kind => (
              <label
                className={`flex cursor-pointer items-center justify-between gap-3 rounded px-1.5 py-0.5 text-[11px] text-(--ui-text-secondary) ${HOVER}`}
                key={kind}
              >
                <span>{copy.kinds[kind]}</span>
                <Switch checked={prefs.kinds[kind]} onCheckedChange={() => toggleTaskKind(kind)} size="xs" />
              </label>
            ))}
            <label
              className={`mt-1 flex cursor-pointer items-center justify-between gap-3 rounded px-1.5 py-0.5 text-[11px] text-(--ui-text-secondary) ${HOVER}`}
            >
              <span>{copy.runningOnly}</span>
              <Switch checked={prefs.runningOnly} onCheckedChange={() => toggleTaskFlag('runningOnly')} size="xs" />
            </label>
            <label
              className={`flex cursor-pointer items-center justify-between gap-3 rounded px-1.5 py-0.5 text-[11px] text-(--ui-text-secondary) ${HOVER}`}
            >
              <span>{copy.showEnded}</span>
              <Switch checked={prefs.showEnded} onCheckedChange={() => toggleTaskFlag('showEnded')} size="xs" />
            </label>
            <label
              className={`flex cursor-pointer items-center justify-between gap-3 rounded px-1.5 py-0.5 text-[11px] text-(--ui-text-secondary) ${HOVER}`}
            >
              <span>{copy.compact}</span>
              <Switch checked={prefs.compact} onCheckedChange={() => toggleTaskFlag('compact')} size="xs" />
            </label>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-3 text-center">
            <span className="text-[11px] text-(--ui-text-secondary)">{copy.empty}</span>
            <span className="text-[10px] text-(--ui-text-quaternary)">{copy.emptyHint}</span>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-1 py-0.5">
            {visible.map(item => (
              <Row compact={prefs.compact} copy={copy} item={item} key={item.key} now={now} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
