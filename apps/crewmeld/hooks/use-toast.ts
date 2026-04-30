import { useCallback, useRef, useState } from 'react'

export type ToastVariant = 'success' | 'error'

export interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
}

export interface ShowToastOptions {
  variant?: ToastVariant
  durationMs?: number
}

const DEFAULT_DURATION_MS = 3000

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counterRef = useRef(0)

  const showToast = useCallback((message: string, options: ShowToastOptions = {}) => {
    const { variant = 'success', durationMs = DEFAULT_DURATION_MS } = options
    const id = ++counterRef.current
    setToasts((prev) => [...prev, { id, message, variant }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, durationMs)
  }, [])

  return { toasts, showToast }
}
