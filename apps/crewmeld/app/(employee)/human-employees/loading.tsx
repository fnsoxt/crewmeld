export default function HumanEmployeesLoading() {
  return (
    <div className='animate-pulse space-y-6'>
      <div className='flex items-center justify-between'>
        <div className='h-8 w-28 rounded bg-gray-200' />
        <div className='h-9 w-28 rounded-md bg-gray-200' />
      </div>

      <div className='overflow-hidden rounded-xl border border-gray-200'>
        <div className='h-10 bg-gray-50' />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className='flex gap-4 border-gray-100 border-t px-4 py-3'>
            <div className='h-5 w-24 rounded bg-gray-200' />
            <div className='h-5 w-32 rounded bg-gray-200' />
            <div className='h-5 flex-1 rounded bg-gray-100' />
            <div className='h-5 w-16 rounded bg-gray-100' />
          </div>
        ))}
      </div>
    </div>
  )
}
