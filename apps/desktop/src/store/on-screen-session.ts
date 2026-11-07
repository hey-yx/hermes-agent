import { atom } from 'nanostores'

/** The session the user is LOOKING AT: the focused pane's chat (a ringed tile
 *  when one is fronted), falling back to the primary selection. `session-states`
 *  mirrors `$focusedStoredSessionId` into it; the unread layers read it from
 *  here.
 *
 *  A module of its own on purpose: the unread stores must not import the focus
 *  store (that drags the pane tree into every surface that paints a dot), and a
 *  leaf atom keeps the edge pointing one way — the focus owner already imports
 *  the unread layers, the unread layers only import this. */
export const $onScreenStoredSessionId = atom<null | string>(null)
