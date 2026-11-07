/**
 * Pure bounds helpers for the task-float window (`?win=taskfloat`).
 *
 * Side-effect-free so the part that matters — rejecting garbage and keeping a
 * remembered spot on a display that still exists — is unit-testable without
 * booting Electron. main.ts owns file I/O and the live `screen` displays.
 */

export interface TaskFloatBounds {
  x: number
  y: number
  width: number
  height: number
}

export const TASK_FLOAT_DEFAULT_WIDTH = 248
export const TASK_FLOAT_DEFAULT_HEIGHT = 300
const MIN_WIDTH = 200
const MIN_HEIGHT = 150
// Keep this much of the window inside a display work area before trusting a
// remembered position, so an unplugged monitor cannot strand the window.
const MIN_VISIBLE = 60

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** Parse a persisted bounds blob; null when it is not usable geometry. */
export function sanitizeTaskFloatBounds(raw: unknown): TaskFloatBounds | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const value = raw as Record<string, unknown>

  if (!finite(value.x) || !finite(value.y) || !finite(value.width) || !finite(value.height)) {
    return null
  }

  return {
    x: Math.round(value.x),
    y: Math.round(value.y),
    width: Math.max(MIN_WIDTH, Math.round(value.width)),
    height: Math.max(MIN_HEIGHT, Math.round(value.height))
  }
}

/** True when the remembered box still overlaps a display work area. */
export function taskFloatBoundsOnScreen(
  bounds: TaskFloatBounds,
  areas: readonly { x: number; y: number; width: number; height: number }[]
): boolean {
  return areas.some(
    area =>
      bounds.x < area.x + area.width - MIN_VISIBLE &&
      bounds.x + bounds.width > area.x + MIN_VISIBLE &&
      bounds.y < area.y + area.height - MIN_VISIBLE &&
      bounds.y + bounds.height > area.y + MIN_VISIBLE
  )
}

/**
 * Default spot: just inside the work area's top-right corner, offset enough to
 * clear the macOS traffic lights and the titlebar band.
 */
export function defaultTaskFloatBounds(area: { x: number; y: number; width: number; height: number }): TaskFloatBounds {
  const width = Math.min(TASK_FLOAT_DEFAULT_WIDTH, Math.max(MIN_WIDTH, area.width - 24))
  const height = Math.min(TASK_FLOAT_DEFAULT_HEIGHT, Math.max(MIN_HEIGHT, area.height - 24))

  return {
    x: Math.round(area.x + area.width - width - 28),
    y: Math.round(area.y + 52),
    width,
    height
  }
}
