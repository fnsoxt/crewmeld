import type { SVGProps } from 'react'

export function TrelloIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns='http://www.w3.org/2000/svg'
      width='256'
      height='256'
      viewBox='0 0 256 256'
      preserveAspectRatio='xMidYMid'
    >
      <rect fill='#0052CC' x='0' y='0' width='256' height='256' rx='32' />
      <rect fill='#FFF' x='144.64' y='33.28' width='78.08' height='112' rx='12' />
      <rect fill='#FFF' x='33.28' y='33.28' width='78.08' height='176' rx='12' />
    </svg>
  )
}
