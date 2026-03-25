import type { ReactNode } from "react";

type PagePlaceholderProps = {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
};

export function PagePlaceholder({
  eyebrow,
  title,
  description,
  children,
}: PagePlaceholderProps) {
  return (
    <div className="mx-auto w-full max-w-shell px-4 py-6 md:px-6 lg:px-8">
      <div className="rounded-[28px] border border-border bg-white p-6 shadow-[0_20px_50px_rgba(28,28,28,0.05)] md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-bold text-text-primary">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
          {description}
        </p>
        {children ? <div className="mt-6">{children}</div> : null}
      </div>
    </div>
  );
}
