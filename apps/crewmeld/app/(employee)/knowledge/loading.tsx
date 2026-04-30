export default function KnowledgeLoading() {
  return (
    <div className='animate-pulse space-y-6'>
      <div className='flex items-center justify-between'>
        <div className='h-8 w-24 rounded bg-gray-200' />
      </div>

      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className='h-36 rounded-xl bg-gray-100' />
        ))}
      </div>
    </div>
  )
}
