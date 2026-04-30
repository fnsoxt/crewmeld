/**
 * Cross-environment clipboard copy
 *
 * navigator.clipboard.writeText is unavailable in non-HTTPS environments,
 * this function automatically falls back to the textarea + execCommand approach.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall back to alternative approach
    }
  }

  // Fallback: textarea + execCommand
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}
