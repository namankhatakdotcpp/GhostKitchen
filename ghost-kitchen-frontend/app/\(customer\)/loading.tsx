export default function CustomerHomeSkeleton() {
  return (
    <div className="mx-auto w-full max-w-shell px-4 py-4 md:px-6 lg:px-8">
      <div className="rounded-[24px] border border-border bg-white p-4 shadow-sm">
        <div className="h-12 bg-gray-200 rounded-lg animate-pulse w-full"/>
      </div>

      <div className="mt-5">
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 w-24 bg-gray-200 rounded-full animate-pulse flex-shrink-0"/>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <div className="h-8 bg-gray-200 rounded animate-pulse w-32 mb-5"/>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 bg-gray-200 rounded-[24px] animate-pulse"/>
          ))}
        </div>
      </div>
    </div>
  )
}
