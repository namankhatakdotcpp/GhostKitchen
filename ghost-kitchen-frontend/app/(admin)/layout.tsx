import type { ReactNode } from "react";

type AdminLayoutProps = {
  children: ReactNode;
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="min-h-screen bg-surface">
      {children ?? (
        <div className="mx-auto max-w-shell px-4 py-10 text-text-secondary">
          Admin portal scaffold
        </div>
      )}
    </div>
  );
}
