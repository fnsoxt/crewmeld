import type { SVGProps } from 'react'

export function NoteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      width='24'
      height='24'
      viewBox='0 0 24 24'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
    >
      <rect
        x='4'
        y='3'
        width='16'
        height='18'
        rx='2.5'
        stroke='currentColor'
        strokeWidth='1.5'
        fill='none'
      />
      <path d='M15 3H18C18.5523 3 19 3.44772 19 4V7L15 3Z' fill='currentColor' />
      <path d='M8 11H15.5' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
      <path d='M8 15H13' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
    </svg>
  )
}
