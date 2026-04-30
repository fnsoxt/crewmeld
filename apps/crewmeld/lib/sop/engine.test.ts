import type { SopExecutionStatus } from '@crewmeld/db/schema'
import { describe, expect, it } from 'vitest'
import { VALID_TRANSITIONS } from './engine'

describe('VALID_TRANSITIONS', () => {
  it('allows pending → running', () => {
    expect(VALID_TRANSITIONS.pending).toContain('running')
  })

  it('allows pending → cancelled', () => {
    expect(VALID_TRANSITIONS.pending).toContain('cancelled')
  })

  it('allows running → paused_for_human', () => {
    expect(VALID_TRANSITIONS.running).toContain('paused_for_human')
  })

  it('allows running → completed', () => {
    expect(VALID_TRANSITIONS.running).toContain('completed')
  })

  it('allows running → error', () => {
    expect(VALID_TRANSITIONS.running).toContain('error')
  })

  it('allows running → cancelled', () => {
    expect(VALID_TRANSITIONS.running).toContain('cancelled')
  })

  it('allows paused_for_human → running (approved/rejected resume)', () => {
    expect(VALID_TRANSITIONS.paused_for_human).toContain('running')
  })

  it('allows paused_for_human → failed (max rejections)', () => {
    expect(VALID_TRANSITIONS.paused_for_human).toContain('failed')
  })

  it('allows paused_for_human → timed_out', () => {
    expect(VALID_TRANSITIONS.paused_for_human).toContain('timed_out')
  })

  it('allows error → running (retry)', () => {
    expect(VALID_TRANSITIONS.error).toContain('running')
  })

  it('allows error → failed (max retries)', () => {
    expect(VALID_TRANSITIONS.error).toContain('failed')
  })

  it('allows error → timed_out (SOP timeout)', () => {
    expect(VALID_TRANSITIONS.error).toContain('timed_out')
  })

  it('has no transitions from terminal states', () => {
    const terminalStates: SopExecutionStatus[] = ['completed', 'timed_out', 'failed', 'cancelled']
    for (const state of terminalStates) {
      expect(VALID_TRANSITIONS[state]).toEqual([])
    }
  })

  it('covers all 8 states', () => {
    const allStates: SopExecutionStatus[] = [
      'pending',
      'running',
      'paused_for_human',
      'completed',
      'timed_out',
      'error',
      'failed',
      'cancelled',
    ]
    for (const state of allStates) {
      expect(VALID_TRANSITIONS).toHaveProperty(state)
    }
  })

  it('total transitions = 14', () => {
    const totalTransitions = Object.values(VALID_TRANSITIONS).reduce(
      (sum, arr) => sum + arr.length,
      0
    )
    expect(totalTransitions).toBe(14)
  })
})
