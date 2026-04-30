import type { SVGProps } from 'react'

export function GoogleSlidesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 48 48'
      width='96px'
      height='96px'
    >
      <path
        fill='#FFC107'
        d='M37,45H11c-1.657,0-3-1.343-3-3V6c0-1.657,1.343-3,3-3h19l10,10v29C40,43.657,38.657,45,37,45z'
      />
      <path fill='#FFECB3' d='M40 13L30 13 30 3z' />
      <path fill='#FFA000' d='M30 13L40 23 40 13z' />
      <path fill='#FFF8E1' d='M14 21H34V35H14z' />
      <path fill='#FFA000' d='M16 23H32V26H16zM16 28H28V30H16z' />
    </svg>
  )
}
