import type { SVGProps } from 'react'

export function TelegramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      width='24'
      height='24'
      fill='none'
    >
      <circle cx='12' cy='12' r='10' fill='#0088CC' />
      <path
        d='M16.7 8.4c.1-.6-.4-1.1-1-.8l-9.8 4.3c-.4.2-.4.8.1.9l2.1.7c.4.1.8.1 1.1-.2l4.5-3.1c.1-.1.3.1.2.2l-3.2 3.5c-.3.3-.2.8.2 1l3.6 2.3c.4.2.9-.1 1-.5l1.2-7.8Z'
        fill='white'
      />
    </svg>
  )
}
