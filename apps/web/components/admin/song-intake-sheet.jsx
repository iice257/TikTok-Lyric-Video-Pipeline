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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function SongIntakeSheet({ open, onOpenChange }) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [method, setMethod] = useState("ai_prompt");
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
      setMethod("ai_prompt");
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
              <div className="grid gap-2">
                <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Source Url (YouTube/Spotify)
                </Label>
                <Input
                  placeholder="Enter valid URI..."
                  className="h-11 border-border bg-background"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Artist
                  </Label>
                  <Input
                    name="artist"
                    required
                    placeholder="Unknown Entity"
                    className="h-11 border-border bg-background"
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Title
                  </Label>
                  <Input
                    name="title"
                    required
                    placeholder="Signal Name"
                    className="h-11 border-border bg-background"
                  />
                </div>
              </div>

              <Tabs value={method} onValueChange={setMethod} className="flex flex-col gap-5">
                <div className="grid gap-3">
                  <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Lyric Generation Method
                  </Label>
                  <TabsList className="grid h-auto grid-cols-2 rounded-md border border-border bg-background p-1">
                    <TabsTrigger value="ai_prompt" className="h-9 uppercase tracking-[0.18em]">
                      Ai Prompt
                    </TabsTrigger>
                    <TabsTrigger value="manual_upload" className="h-9 uppercase tracking-[0.18em]">
                      Manual Upload
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="ai_prompt" className="m-0">
                  <div className="rounded-md border border-border bg-background px-4 py-4">
                    <p className="text-sm font-medium">Source-led intake preview</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      This visual state matches the design, but pipeline dispatch still uses the current manual-upload intake path.
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="manual_upload" className="m-0">
                  <div className="flex flex-col gap-4 rounded-md border border-border bg-background px-4 py-4">
                    <p className="text-sm font-medium">Manual upload dispatch</p>
                    <p className="text-sm text-muted-foreground">
                      Upload files here to use the existing intake endpoint.
                    </p>

                    <div className="grid gap-2">
                      <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                        Audio
                      </Label>
                      <Input
                        name="audio"
                        type="file"
                        accept=".mp3,.wav,.m4a,.flac"
                        required={method === "manual_upload"}
                        className="h-11 border-border bg-background file:mr-3 file:border-0 file:bg-transparent file:text-xs file:font-medium file:uppercase"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                        Cover Art
                      </Label>
                      <Input
                        name="cover"
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp"
                        className="h-11 border-border bg-background file:mr-3 file:border-0 file:bg-transparent file:text-xs file:font-medium file:uppercase"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                        Lyrics
                      </Label>
                      <Input
                        name="lyrics"
                        type="file"
                        accept=".lrc,.srt,.json,.txt"
                        className="h-11 border-border bg-background file:mr-3 file:border-0 file:bg-transparent file:text-xs file:font-medium file:uppercase"
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <input type="hidden" name="rights_status" value="licensed" />
              <input type="hidden" name="environment" value="prod" />
            </div>
          </div>

          <SheetFooter className="border-t border-border bg-card px-6 py-5">
            <div className="flex w-full flex-col gap-3">
              {message ? (
                <p
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
                  {method === "manual_upload"
                    ? "Sequence ready for execution"
                    : "Manual upload is the active intake path"}
                </p>
              )}

              <Button
                type="submit"
                disabled={submitting || method !== "manual_upload"}
                size="lg"
                className="h-11 uppercase tracking-[0.2em]"
              >
                {submitting
                  ? "Dispatching..."
                  : method === "manual_upload"
                    ? "Dispatch To Pipeline"
                    : "Switch To Manual Upload"}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
