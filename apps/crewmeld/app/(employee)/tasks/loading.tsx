export default function TasksLoading() {
  return (
    <div className='animate-pulse space-y-6'>
      {/* Title + Tab */}
      <div className='flex items-center justify-between'>
        <div className='h-8 w-28 rounded bg-gray-200' />
        <div className='flex gap-2'>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className='h-9 w-20 rounded-md bg-gray-100' />
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className='flex gap-3'>
        <div className='h-9 w-44 rounded-md bg-gray-200' />
        <div className='h-9 w-48 rounded-md bg-gray-200' />
        <div className='h-9 w-40 rounded-md bg-gray-100' />
        <div className='h-9 w-40 rounded-md bg-gray-100' />
      </div>

      {/* Table skeleton */}
      <div className='overflow-hidden rounded-xl border border-gray-200'>
        <div className='h-10 bg-gray-50' />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className='flex gap-4 border-gray-100 border-t px-4 py-3'>
            <div className='h-5 w-32 rounded bg-gray-200' />
            <div className='h-5 w-16 rounded bg-gray-200' />
            <div className='h-5 flex-1 rounded bg-gray-100' />
            <div className='h-5 w-20 rounded bg-gray-100' />
            <div className='h-5 w-24 rounded bg-gray-100' />
          </div>
        ))}
      </div>
    </div>
  )
}
