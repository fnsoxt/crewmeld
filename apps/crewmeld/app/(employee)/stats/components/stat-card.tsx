interface StatCardProps {
  title: string
  value: string | number
  suffix?: string
}

export function StatCard({ title, value, suffix }: StatCardProps) {
  return (
    <div className='rounded-xl border border-gray-200 bg-white p-5'>
      <div className='mb-1 text-gray-400 text-xs'>{title}</div>
      <div className='font-bold text-2xl text-gray-900'>
        {value}
        {suffix && <span className='ml-1 font-normal text-gray-400 text-sm'>{suffix}</span>}
      </div>
    </div>
  )
}
