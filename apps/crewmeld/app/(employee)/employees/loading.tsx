export default function EmployeesLoading() {
  return (
    <div className='animate-pulse space-y-6'>
      {/* Title + onboard button */}
      <div className='flex items-center justify-between'>
        <div className='h-8 w-28 rounded bg-gray-200' />
        <div className='h-9 w-28 rounded-md bg-gray-200' />
      </div>

      {/* Search + filter */}
      <div className='flex gap-4'>
        <div className='h-9 flex-1 rounded-md bg-gray-200' />
        <div className='h-9 w-36 rounded-md bg-gray-100' />
      </div>

      {/* Employee card grid */}
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className='h-48 rounded-xl bg-gray-100' />
        ))}
      </div>
    </div>
  )
}
