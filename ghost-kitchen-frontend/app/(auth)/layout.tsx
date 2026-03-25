import type { ReactNode } from "react";

type AuthLayoutProps = {
  children: ReactNode;
};

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-[440px] rounded-[28px] border border-border bg-white p-6 shadow-[0_24px_60px_rgba(28,28,28,0.08)] md:p-8">
        {children}
      </div>
    </div>
  );
}
