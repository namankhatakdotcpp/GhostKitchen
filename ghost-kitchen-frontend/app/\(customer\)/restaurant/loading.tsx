export default function RestaurantMenuSkeleton() {
  return (
    <div className="min-h-screen bg-surface pb-24 lg:pb-10">
      <div className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-shell items-center justify-between gap-3 px-4 md:px-6 lg:px-8">
          <div className="h-10 w-10 bg-gray-200 rounded-full animate-pulse"/>
          <div className="flex-1 h-6 bg-gray-200 rounded animate-pulse"/>
          <div className="h-10 w-10 bg-gray-200 rounded-full animate-pulse"/>
        </div>
      </div>

      <div className="mx-auto max-w-shell">
        <div className="h-[220px] w-full bg-gray-200 animate-pulse"/>

        <div className="relative z-10 mx-4 -mt-8 rounded-[18px] border border-border bg-white p-4 shadow-lg">
          <div className="h-8 bg-gray-200 rounded animate-pulse w-48 mb-3"/>
          <div className="h-4 bg-gray-100 rounded animate-pulse w-32 mb-4"/>
          <div className="h-4 bg-gray-100 rounded animate-pulse w-64"/>
        </div>
      </div>

      <div className="sticky top-16 z-30 mt-5 border-b border-border bg-white">
        <div className="mx-auto flex max-w-shell items-center gap-4 px-4 md:px-6 lg:px-8">
          <div className="flex gap-5 overflow-x-auto pb-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 w-20 bg-gray-200 rounded animate-pulse flex-shrink-0"/>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-shell px-4 pb-8 pt-6 md:px-6 lg:px-8">
        <div className="max-w-3xl space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <div className="h-6 bg-gray-200 rounded animate-pulse w-32 mb-4"/>
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-24 bg-gray-100 rounded-lg animate-pulse"/>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
