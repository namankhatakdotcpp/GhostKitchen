import type { ReactNode } from "react";

type ShopLayoutProps = {
  children: ReactNode;
};

export default function ShopLayout({ children }: ShopLayoutProps) {
  return (
    <div className="min-h-screen bg-surface">
      {children ?? (
        <div className="mx-auto max-w-shell px-4 py-10 text-text-secondary">
          Shopkeeper portal scaffold
        </div>
      )}
    </div>
  );
}
