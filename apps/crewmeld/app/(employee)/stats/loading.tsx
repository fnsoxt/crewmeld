export default function StatsLoading() {
  return (
    <div className='animate-pulse space-y-6'>
      <div className='flex items-center justify-between'>
        <div className='h-8 w-28 rounded bg-gray-200' />
      </div>

      <div className='flex gap-3'>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className='h-9 w-24 rounded-md bg-gray-100' />
        ))}
      </div>

      <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className='h-24 rounded-xl bg-gray-100' />
        ))}
      </div>

      <div className='h-80 rounded-xl bg-gray-100' />
    </div>
  )
}
