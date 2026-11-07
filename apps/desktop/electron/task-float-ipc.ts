// IPC surface for the task-float window (`?win=taskfloat`) — the always-on-top
// task monitor. Extracted from main.ts: the window handle, lifecycle and pin
// state stay injected because main.ts owns the BrowserWindow and the broadcast.
import { type BrowserWindow, ipcMain } from 'electron'

export interface TaskFloatIpcDeps {
  getWindow: () => BrowserWindow | null
  openWindow: () => void
  closeWindow: () => void
  isPinned: () => boolean
  setPinned: (pinned: boolean) => boolean
}

export function registerTaskFloatIpc({ getWindow, openWindow, closeWindow, isPinned, setPinned }: TaskFloatIpcDeps) {
  ipcMain.handle('hermes:taskfloat:open', () => {
    openWindow()

    return { ok: true, pinned: isPinned() }
  })

  ipcMain.handle('hermes:taskfloat:close', () => {
    closeWindow()

    return { ok: true }
  })

  ipcMain.handle('hermes:taskfloat:state', () => ({
    open: Boolean(getWindow() && !getWindow()?.isDestroyed()),
    pinned: isPinned()
  }))

  ipcMain.handle('hermes:taskfloat:set-pinned', (_event, pinned: unknown) => {
    const next = setPinned(Boolean(pinned))

    return { ok: true, pinned: next }
  })
}
