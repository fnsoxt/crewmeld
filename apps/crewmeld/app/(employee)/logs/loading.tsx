export default function LogsLoading() {
  return (
    <div className='animate-pulse space-y-6'>
      <div className='flex items-center justify-between'>
        <div className='h-8 w-28 rounded bg-gray-200' />
      </div>

      <div className='flex gap-3'>
        <div className='h-9 w-24 rounded-md bg-gray-200' />
        <div className='h-9 w-24 rounded-md bg-gray-100' />
      </div>

      <div className='space-y-3'>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className='h-16 rounded-lg bg-gray-100' />
        ))}
      </div>
    </div>
  )
}
