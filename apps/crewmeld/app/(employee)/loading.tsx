export default function EmployeeLoading() {
  return (
    <div className='animate-pulse space-y-6'>
      {/* Page title skeleton */}
      <div className='flex items-center justify-between'>
        <div className='h-8 w-40 rounded bg-gray-200' />
        <div className='h-9 w-28 rounded-md bg-gray-200' />
      </div>

      {/* Filter bar skeleton */}
      <div className='flex gap-3'>
        <div className='h-9 w-60 rounded-md bg-gray-200' />
        <div className='h-9 w-36 rounded-md bg-gray-100' />
      </div>

      {/* Content skeleton - card grid */}
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className='h-44 rounded-xl bg-gray-100' />
        ))}
      </div>
    </div>
  )
}
