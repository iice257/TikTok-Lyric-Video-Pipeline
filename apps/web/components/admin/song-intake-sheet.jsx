"use client";

import { useState } from "react";

import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function SongIntakeSheet({ open, onOpenChange }) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formKey, setFormKey] = useState(0);

  async function onSubmit(event) {
    event.preventDefault();

    setSubmitting(true);
    setMessage("");
    const form = new FormData(event.currentTarget);

    try {
      const payload = await apiFetch("/manual-intake", {
        method: "POST",
        body: form,
      });
      setMessage(`QUEUED: ${payload.song.artist} - ${payload.song.title}`);
      setFormKey((current) => current + 1);
    } catch (err) {
      setMessage(`ERROR: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full border-l border-border bg-card p-0 sm:max-w-[28rem]">
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle className="text-2xl font-semibold uppercase tracking-tight text-primary">
            [ Song Intake ]
          </SheetTitle>
          <SheetDescription className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Sequence ready for execution
          </SheetDescription>
        </SheetHeader>

        <form key={formKey} onSubmit={onSubmit} className="flex h-full flex-col">
          <div className="terminal-scroll flex-1 overflow-y-auto px-6 py-6">
            <div className="flex flex-col gap-6">
              <div className="rounded-md border border-border bg-background px-4 py-4">
                <p className="text-sm font-medium">Manual upload dispatch</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  This intake path is live end-to-end. Upload the source audio and any optional artwork or lyrics files to queue a song immediately.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="intake-artist" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Artist
                  </Label>
                  <Input
                    id="intake-artist"
                    name="artist"
                    required
                    maxLength={255}
                    placeholder="Unknown Entity"
                    className="h-11 border-border bg-background"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="intake-title" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Title
                  </Label>
                  <Input
                    id="intake-title"
                    name="title"
                    required
                    maxLength={255}
                    placeholder="Signal Name"
                    className="h-11 border-border bg-background"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-4 rounded-md border border-border bg-background px-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="intake-audio" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Audio / max 250mb
                  </Label>
                  <Input
                    id="intake-audio"
                    name="audio"
                    type="file"
                    accept=".mp3,.wav,.m4a,.flac"
                    required
                    className="h-11 border-border bg-background file:mr-3 file:border-0 file:bg-transparent file:text-xs file:font-medium file:uppercase"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="intake-cover" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Cover Art / max 15mb
                  </Label>
                  <Input
                    id="intake-cover"
                    name="cover"
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    className="h-11 border-border bg-background file:mr-3 file:border-0 file:bg-transparent file:text-xs file:font-medium file:uppercase"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="intake-lyrics" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Lyrics / max 5mb
                  </Label>
                  <Input
                    id="intake-lyrics"
                    name="lyrics"
                    type="file"
                    accept=".lrc,.srt,.json,.txt"
                    className="h-11 border-border bg-background file:mr-3 file:border-0 file:bg-transparent file:text-xs file:font-medium file:uppercase"
                  />
                </div>
              </div>

              <input type="hidden" name="rights_status" value="licensed" />
              <input type="hidden" name="environment" value="prod" />
            </div>
          </div>

          <SheetFooter className="border-t border-border bg-card px-6 py-5">
            <div className="flex w-full flex-col gap-3">
              {message ? (
                <p
                  aria-live="polite"
                  className={
                    message.startsWith("QUEUED")
                      ? "text-[10px] font-bold uppercase tracking-[0.2em] text-primary"
                      : "text-[10px] font-bold uppercase tracking-[0.2em] text-destructive"
                  }
                >
                  {message}
                </p>
              ) : (
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Sequence ready for execution
                </p>
              )}

              <Button
                type="submit"
                disabled={submitting}
                size="lg"
                className="h-11 uppercase tracking-[0.2em]"
              >
                {submitting ? "Dispatching..." : "Dispatch To Pipeline"}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
