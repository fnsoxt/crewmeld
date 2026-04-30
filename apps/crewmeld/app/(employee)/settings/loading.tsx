export default function SettingsLoading() {
  return (
    <div className='animate-pulse space-y-6'>
      <div className='h-8 w-28 rounded bg-gray-200' />

      <div className='space-y-4'>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className='h-20 rounded-xl bg-gray-100' />
        ))}
      </div>
    </div>
  )
}
