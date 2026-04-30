import type { SVGProps } from 'react'

export function ZhipuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox='0 0 24 24' width='1em' height='1em' xmlns='http://www.w3.org/2000/svg'>
      <title>智谱 AI</title>
      <rect width='24' height='24' rx='5' fill='#3859FF' />
      <text
        x='12'
        y='16'
        textAnchor='middle'
        fontSize='11'
        fontFamily='-apple-system, system-ui, sans-serif'
        fontWeight='700'
        fill='#FFFFFF'
      >
        Z
      </text>
    </svg>
  )
}
