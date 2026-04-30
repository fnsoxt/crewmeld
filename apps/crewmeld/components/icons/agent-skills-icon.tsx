import type { SVGProps } from 'react'

export function AgentSkillsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns='http://www.w3.org/2000/svg'
      width='16'
      height='16'
      viewBox='0 0 16 16'
      fill='none'
    >
      <path
        d='M8 1L14.0622 4.5V11.5L8 15L1.93782 11.5V4.5L8 1Z'
        stroke='currentColor'
        strokeWidth='1.5'
        fill='none'
      />
      <path d='M8 4.5L11 6.25V9.75L8 11.5L5 9.75V6.25L8 4.5Z' fill='currentColor' />
    </svg>
  )
}
