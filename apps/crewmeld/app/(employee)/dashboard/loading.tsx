export default function DashboardLoading() {
  return (
    <div className='animate-pulse space-y-6'>
      {/* Title + refresh button */}
      <div className='flex items-center justify-between'>
        <div className='h-8 w-24 rounded bg-gray-200' />
        <div className='h-9 w-20 rounded-md bg-gray-200' />
      </div>

      {/* Metric cards */}
      <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className='h-28 rounded-xl bg-gray-100' />
        ))}
      </div>

      {/* Asset overview */}
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className='h-24 rounded-xl bg-gray-100' />
        ))}
      </div>

      {/* Pending items + ranking */}
      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        <div className='h-64 rounded-xl bg-gray-100' />
        <div className='h-64 rounded-xl bg-gray-100' />
      </div>
    </div>
  )
}
