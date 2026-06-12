"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 text-foreground">
      <div className="w-full max-w-xl border-y border-border py-10">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-destructive">
          System Error
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          The control surface could not complete this request.
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Retry the current route. Persistent failures should be checked in the API and worker logs.
        </p>
        <Button type="button" onClick={reset} className="mt-6 uppercase tracking-[0.18em]">
          Retry Route
        </Button>
      </div>
    </main>
  );
}
