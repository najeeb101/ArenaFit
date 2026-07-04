import { Swords } from "lucide-react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="arena-grid flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-bold"
      >
        <Swords className="h-7 w-7 text-primary" />
        Arena<span className="text-primary">Fit</span>
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
