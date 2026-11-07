/**
 * Unit tests for the task-float geometry helpers. The parts that protect the
 * user: garbage rejection, floor clamping, and keeping a remembered spot on a
 * display that still exists after a monitor is unplugged.
 */

import assert from 'node:assert/strict'

import { test } from 'vitest'

import {
  defaultTaskFloatBounds,
  sanitizeTaskFloatBounds,
  taskFloatBoundsOnScreen
} from './task-float-state'

const PRIMARY = [{ height: 1040, width: 1920, x: 0, y: 0 }]

test('rejects non-geometry blobs', () => {
  assert.equal(sanitizeTaskFloatBounds(null), null)
  assert.equal(sanitizeTaskFloatBounds({}), null)
  assert.equal(sanitizeTaskFloatBounds({ x: 'a', y: 1, width: 300, height: 400 }), null)
  assert.equal(sanitizeTaskFloatBounds({ x: 1, y: 1, width: Number.NaN, height: 400 }), null)
})

test('floors a too-small remembered size instead of trusting it', () => {
  const bounds = sanitizeTaskFloatBounds({ x: 40, y: 60, width: 10, height: 10 })

  assert.deepEqual(bounds, { x: 40, y: 60, width: 200, height: 150 })
})

test('keeps a remembered box that still overlaps a display', () => {
  const bounds = sanitizeTaskFloatBounds({ x: 1500, y: 200, width: 324, height: 452 })!

  assert.equal(taskFloatBoundsOnScreen(bounds, PRIMARY), true)
})

test('rejects a box stranded on an unplugged monitor', () => {
  const bounds = sanitizeTaskFloatBounds({ x: 4000, y: 200, width: 324, height: 452 })!

  assert.equal(taskFloatBoundsOnScreen(bounds, PRIMARY), false)
})

test('default spot sits inside the work area, clear of the titlebar', () => {
  const bounds = defaultTaskFloatBounds(PRIMARY[0]!)

  assert.ok(bounds.x > 0 && bounds.x + bounds.width <= 1920)
  assert.ok(bounds.y >= 52)
  assert.ok(bounds.height <= 1040)
})
