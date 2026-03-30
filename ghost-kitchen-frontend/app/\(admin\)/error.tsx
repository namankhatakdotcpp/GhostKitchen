'use client'

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <p className="text-lg font-semibold text-gray-800">Something went wrong</p>
      <p className="text-sm text-gray-500">{error.message}</p>
      <button onClick={reset} className="px-4 py-2 bg-brand text-white rounded-lg text-sm">
        Try again
      </button>
    </div>
  )
}
