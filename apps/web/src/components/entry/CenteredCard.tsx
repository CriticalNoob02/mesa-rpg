import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui";

export function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 font-display text-xl text-muted hover:text-ink">
        Mesa RPG
      </Link>
      <Card className="w-full max-w-md">{children}</Card>
    </main>
  );
}
