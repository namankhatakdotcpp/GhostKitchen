"use client";

/**
 * Skeleton Loader Components
 * 
 * Loading placeholders for better UX
 */

export function Skeleton() {
  return (
    <div className="animate-pulse bg-slate-700 h-6 w-full rounded" />
  );
}

export function SkeletonLine() {
  return (
    <div className="animate-pulse bg-slate-700 h-4 w-3/4 rounded" />
  );
}

export function SkeletonCircle() {
  return (
    <div className="animate-pulse bg-slate-700 h-12 w-12 rounded-full" />
  );
}

export function Spinner() {
  return (
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
  );
}

export function SkeletonTable() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-4">
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      ))}
    </div>
  );
}
