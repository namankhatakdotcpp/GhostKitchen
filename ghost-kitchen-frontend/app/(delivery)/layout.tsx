import type { ReactNode } from "react";

type DeliveryLayoutProps = {
  children: ReactNode;
};

export default function DeliveryLayout({ children }: DeliveryLayoutProps) {
  return (
    <div className="min-h-screen bg-surface">
      {children ?? (
        <div className="mx-auto max-w-shell px-4 py-10 text-text-secondary">
          Delivery portal scaffold
        </div>
      )}
    </div>
  );
}
