import { afterEach, describe, expect, it } from 'vitest'

import type { SessionInfo } from '@/types/hermes'

import { $onScreenStoredSessionId } from './on-screen-session'
import * as session from './session'
import { $sessionDotStateById } from './session-dot-state'
import { $sessionSeenCounts, $unreadFinishedMarkers, markSessionUnreadFinished } from './session-unread'

// The dot means "there is something here you have not opened". A session the
// user is LOOKING AT therefore cannot read unread, from ANY of the four
// sources: the live busy→idle marker, the persisted marker, the per-device
// seen-count watermark, or the backend's own `unread` flag.
//
// The ack paths raced that rule: a list refresh that lands after the click (or
// one issued before it) re-derives unread from the watermark, and the backend
// flag had no on-screen skip at all, so the dot stayed green on the very chat
// being read until it was clicked a second time. Pinning the rule at the
// projection instead of in every ack path is what these tests hold down.
//
// `$onScreenStoredSessionId` is the focus mirror `session-states` maintains
// (the focused pane's chat, else the primary selection). The store reads that
// leaf atom rather than the focus store, so a surface that paints a dot never
// drags the pane tree in behind it.

const storedRow = (id: string, extra: Partial<SessionInfo> = {}): SessionInfo =>
  ({ id, message_count: 1, source: 'cli', started_at: 0, title: id, ...extra }) as SessionInfo

describe('a focused session never reads unread', () => {
  afterEach(() => {
    $onScreenStoredSessionId.set(null)
    session.setSessions([])
    session.$unreadFinishedSessionIds.set([])
    $sessionSeenCounts.set({})
    $unreadFinishedMarkers.set({})
  })

  it('keeps its dot dark when the list refresh outruns its seen-count watermark', () => {
    // The user read this chat up to 2 messages; a turn pushed it to 5 and the
    // refresh lands while the chat is the one on screen.
    $onScreenStoredSessionId.set('tiled')
    $sessionSeenCounts.set({ default: { tiled: 2 } })
    session.setSessions([storedRow('tiled', { message_count: 5 })])

    expect($sessionDotStateById.get()['tiled'] ?? 'idle').not.toBe('unread')
    expect(session.$unreadFinishedSessionIds.get()).not.toContain('tiled')
  })

  it('keeps its dot dark when the backend flag says unread', () => {
    $onScreenStoredSessionId.set('tiled')
    session.setSessions([storedRow('tiled', { message_count: 5, unread: true })])

    expect($sessionDotStateById.get()['tiled']).not.toBe('unread')
  })

  it('tracks its watermark while on screen, so the next refresh cannot re-light it', () => {
    $onScreenStoredSessionId.set('tiled')
    $sessionSeenCounts.set({ default: { tiled: 2 } })
    session.setSessions([storedRow('tiled', { message_count: 5 })])

    expect($sessionSeenCounts.get().default?.tiled).toBe(5)
  })

  it('drops the dot when the user looks at the session, without waiting for a refresh', () => {
    // The live marker landed while the user was elsewhere; opening the chat is
    // what clears it, and the next list poll must not bring it back.
    session.$sessions.set([storedRow('tiled', { message_count: 5 })])
    markSessionUnreadFinished('tiled')
    expect($sessionDotStateById.get()['tiled']).toBe('unread')

    $onScreenStoredSessionId.set('tiled')

    expect($sessionDotStateById.get()['tiled'] ?? 'idle').not.toBe('unread')
  })

  it('still shows the focused session as working rather than merely unread', () => {
    $onScreenStoredSessionId.set('tiled')
    session.setSessions([storedRow('tiled', { message_count: 5, unread: true })])
    session.$unreadFinishedSessionIds.set(['tiled'])

    expect($sessionDotStateById.get()['tiled']).not.toBe('unread')
  })

  it('still lights a session that finished while another one is on screen', () => {
    $onScreenStoredSessionId.set('tiled')
    $sessionSeenCounts.set({ default: { tiled: 2, elsewhere: 1 } })
    session.setSessions([storedRow('tiled', { message_count: 5 }), storedRow('elsewhere', { message_count: 3 })])

    expect($sessionDotStateById.get()['tiled'] ?? 'idle').not.toBe('unread')
    expect($sessionDotStateById.get()['elsewhere']).toBe('unread')
  })
})
