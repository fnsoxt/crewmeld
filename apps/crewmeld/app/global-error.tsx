'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang='zh-CN'>
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>应用出错了</h1>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>
          {error.digest ? `Reference: ${error.digest}` : '请稍后重试'}
        </p>
        <button
          type='button'
          onClick={reset}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '0.375rem',
            border: '1px solid #d1d5db',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          重试
        </button>
      </body>
    </html>
  )
}
