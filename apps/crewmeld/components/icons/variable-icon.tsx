import type { SVGProps } from 'react'

export function VariableIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns='http://www.w3.org/2000/svg'
      width='24'
      height='24'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
    >
      <path d='M7 8l-4 4 4 4' />
      <path d='M17 8l4 4-4 4' />
      <line x1='14' y1='4' x2='10' y2='20' />
    </svg>
  )
}
