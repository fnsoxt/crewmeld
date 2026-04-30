import type { SVGProps } from 'react'

export function ServerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
    >
      <rect width='20' height='8' x='2' y='2' rx='2' ry='2' />
      <rect width='20' height='8' x='2' y='14' rx='2' ry='2' />
      <line x1='6' x2='6.01' y1='6' y2='6' />
      <line x1='6' x2='6.01' y1='18' y2='18' />
    </svg>
  )
}
export const SOC2BadgeIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox='0 0 100 100' fill='none' xmlns='http://www.w3.org/2000/svg'>
    <circle cx='50' cy='50' r='48' fill='white' stroke='#E5E7EB' strokeWidth='2' />
    <circle cx='50' cy='50' r='45' fill='#F9FAFB' />
    <text
      x='50'
      y='40'
      textAnchor='middle'
      fill='#1F2937'
      fontSize='20'
      fontWeight='600'
      fontFamily='system-ui, -apple-system, sans-serif'
    >
      SOC 2
    </text>
    <text
      x='50'
      y='56'
      textAnchor='middle'
      fill='#6B7280'
      fontSize='11'
      fontWeight='500'
      fontFamily='system-ui, -apple-system, sans-serif'
    >
      Type II
    </text>
    <text
      x='50'
      y='70'
      textAnchor='middle'
      fill='#9CA3AF'
      fontSize='9'
      fontWeight='400'
      fontFamily='system-ui, -apple-system, sans-serif'
    >
      Compliant
    </text>
  </svg>
)
