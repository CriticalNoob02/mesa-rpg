import clsx from "clsx";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
  size?: "sm" | "md";
};

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "md" ? "h-10 px-4 text-sm" : "h-8 px-2.5 text-xs",
        variant === "primary" && "bg-accent text-accent-ink hover:bg-[#e5b46d]",
        variant === "outline" && "border border-line text-ink hover:bg-surface-2",
        variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-ink",
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "h-10 w-full rounded-md border border-line bg-bg px-3 text-sm text-ink",
        "placeholder:text-faint focus:border-accent focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: o controle vem em children
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
      {children}
    </label>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-fumble">
      {children}
    </p>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={clsx("rounded-xl border border-line bg-surface p-6", className)}>
      {children}
    </section>
  );
}
