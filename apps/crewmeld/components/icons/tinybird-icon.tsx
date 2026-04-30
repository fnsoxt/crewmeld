import type { SVGProps } from 'react'

export function TinybirdIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none'>
      <rect x='0' y='0' width='24' height='24' fill='#2EF598' rx='6' />
      <g transform='translate(2, 2) scale(0.833)'>
        <path d='M25 2.64 17.195.5 14.45 6.635z' fill='#1E7F63' />
        <path d='M17.535 17.77 10.39 15.215 6.195 25.5z' fill='#1E7F63' />
        <path d='M0 11.495 17.535 17.77 20.41 4.36z' fill='#1F2437' />
      </g>
    </svg>
  )
}
