import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 text-foreground">
      <div className="w-full max-w-xl border-y border-border py-10">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
          Route Not Found
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          This terminal route does not exist.
        </h1>
        <Button asChild className="mt-6 uppercase tracking-[0.18em]">
          <Link href="/">Return To Console</Link>
        </Button>
      </div>
    </main>
  );
}
