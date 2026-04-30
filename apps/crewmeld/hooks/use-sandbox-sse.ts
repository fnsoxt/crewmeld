'use client'

import { useEffect, useRef } from 'react'
import { useSandboxStore } from '@/stores/sandbox'

/**
 * Poll sandbox test run status and sync to sandboxStore.
 *
 * Sandbox test runs reuse the real SOP engine. The backend syncs
 * sopExecutions status to the sandboxRuns table via pollAndSyncStatus.
 * The frontend simply polls sandboxRuns records.
 */
export function useSandboxSSE() {
  const runId = useSandboxStore((s) => s.activeSandboxRunId)
  const isSandboxMode = useSandboxStore((s) => s.isSandboxMode)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!runId || !isSandboxMode) return

    const TERMINAL = ['completed', 'failed', 'cancelled', 'timeout']
    const POLL_MS = 3000

    const poll = async () => {
      try {
        const resp = await fetch(`/api/sandbox/runs/${runId}`)
        if (!resp.ok) return
        const json = await resp.json()
        if (!json.success) return

        const run = json.data
        const store = useSandboxStore.getState()

        // Map DB status to store status
        const statusMap: Record<string, string> = {
          pending: 'pending',
          running: 'running',
          waiting_for_input: 'waiting_for_input',
          completed: 'completed',
          failed: 'failed',
          cancelled: 'cancelled',
          timeout: 'failed',
        }

        const mappedStatus = statusMap[run.status] ?? run.status

        // Update store
        if (mappedStatus !== store.status) {
          useSandboxStore.setState({ status: mappedStatus as typeof store.status })
        }

        // Update node results if present
        if (Array.isArray(run.nodeResults) && run.nodeResults.length > 0) {
          useSandboxStore.setState({ nodeResults: run.nodeResults })
        }

        // Update intercepted calls if present
        if (Array.isArray(run.interceptedCalls) && run.interceptedCalls.length > 0) {
          useSandboxStore.setState({ interceptedCalls: run.interceptedCalls })
        }

        // Terminal — stop polling and exit sandbox mode
        if (TERMINAL.includes(run.status)) {
          useSandboxStore.setState({ isSandboxMode: false })
          if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
          }
        }
      } catch {
        // Ignore transient fetch errors
      }
    }

    // Initial poll
    poll()
    timerRef.current = setInterval(poll, POLL_MS)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [runId, isSandboxMode])
}
