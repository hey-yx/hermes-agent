/**
 * Task float — the always-on-top task monitor window (`?win=taskfloat`).
 *
 * Like the HUD, the window is a FULL app renderer with its own gateway; this
 * module owns only the window lifecycle and the pin state. The list itself
 * reads the same gateway RPCs and event stream the rest of the app uses.
 */

import { atom } from 'nanostores'

import { isTaskFloatWindow } from '@/store/windows'

/** Whether the monitor window is up. In the float's own renderer this is
 *  always true; in other windows it tracks the child. Main broadcasts the
 *  truth, which is the only authority (a remembered value would go stale). */
export const $taskFloatOpen = atom(isTaskFloatWindow())

/** Pinned = floats above OTHER apps and follows across spaces. Main owns it. */
export const $taskFloatPinned = atom(true)

/** True when the shell exposes the monitor (desktop only). */
export const canUseTaskFloat = (): boolean =>
  typeof window !== 'undefined' && typeof window.hermesDesktop?.taskFloat?.open === 'function'

export function openTaskFloat(): void {
  const api = window.hermesDesktop?.taskFloat

  if (!api) {
    return
  }

  $taskFloatOpen.set(true)
  void api.open()
}

export function closeTaskFloat(): void {
  window.hermesDesktop?.taskFloat?.close()
}

export const toggleTaskFloat = (): void => ($taskFloatOpen.get() ? closeTaskFloat() : openTaskFloat())

export function setTaskFloatPinned(pinned: boolean): void {
  $taskFloatPinned.set(pinned)
  void window.hermesDesktop?.taskFloat?.setPinned(pinned)
}

/** Adopt main's authoritative state; returns a disposer. */
export function watchTaskFloatState(): () => void {
  const off = window.hermesDesktop?.taskFloat?.onChanged?.(({ open, pinned }) => {
    $taskFloatOpen.set(open)
    $taskFloatPinned.set(pinned)
  })

  void window.hermesDesktop?.taskFloat?.state?.().then(
    state => {
      $taskFloatPinned.set(state.pinned)
    },
    () => {}
  )

  return off ?? (() => {})
}
