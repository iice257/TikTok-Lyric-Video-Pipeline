"use client";

import { useState } from "react";

import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function SongIntakeSheet({ open, onOpenChange }) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [method, setMethod] = useState("ai_prompt");

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
      event.currentTarget.reset();
      setMethod("ai_prompt");
    } catch (err) {
      setMessage(`ERROR: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full border-l border-border bg-card p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-border bg-card p-6">
          <SheetTitle className="text-xl font-bold uppercase tracking-wide text-primary">
            [ Song Intake ]
          </SheetTitle>
          <SheetDescription className="text-xs uppercase tracking-wider">
            Sequence ready for execution
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={onSubmit}
          className="terminal-scroll flex h-full flex-col overflow-y-auto"
        >
          <div className="flex flex-1 flex-col gap-6 p-6">
            <div className="grid gap-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Source URL (YouTube/Spotify/TikTok)
              </Label>
              <Input
                name="source_url"
                placeholder="Enter valid URI..."
                className="h-11 bg-secondary/40 text-sm"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Artist
                </Label>
                <Input name="artist" required placeholder="Unknown Entity" className="h-11 bg-secondary/40" />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Title
                </Label>
                <Input name="title" required placeholder="Signal Name" className="h-11 bg-secondary/40" />
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Rights Status
              </Label>
              <Select name="rights_status" defaultValue="licensed">
                <SelectTrigger className="h-11 bg-secondary/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="licensed">licensed</SelectItem>
                  <SelectItem value="tiktok_cml">tiktok_cml</SelectItem>
                  <SelectItem value="pending_review">pending_review</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Environment
              </Label>
              <Select name="environment" defaultValue="prod">
                <SelectTrigger className="h-11 bg-secondary/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prod">prod</SelectItem>
                  <SelectItem value="lab">lab</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Lyric Generation Method
              </Label>
              <Tabs value={method} onValueChange={setMethod}>
                <TabsList className="grid h-auto w-full grid-cols-2 bg-secondary/40 p-1">
                  <TabsTrigger value="ai_prompt" className="h-9 uppercase tracking-wide data-active:text-primary">
                    AI Prompt
                  </TabsTrigger>
                  <TabsTrigger value="manual_upload" className="h-9 uppercase tracking-wide">
                    Manual Upload
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Audio</Label>
                <Input
                  name="audio"
                  type="file"
                  accept=".mp3,.wav,.m4a,.flac"
                  required
                  className="h-11 cursor-pointer bg-secondary/40 file:mr-3 file:border-0 file:bg-transparent file:text-xs file:uppercase"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Cover Art</Label>
                <Input
                  name="cover"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  className="h-11 cursor-pointer bg-secondary/40 file:mr-3 file:border-0 file:bg-transparent file:text-xs file:uppercase"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Lyrics</Label>
                <Input
                  name="lyrics"
                  type="file"
                  accept=".lrc,.srt,.json,.txt"
                  className="h-11 cursor-pointer bg-secondary/40 file:mr-3 file:border-0 file:bg-transparent file:text-xs file:uppercase"
                />
              </div>
            </div>

            {message ? (
              <p className={message.startsWith("QUEUED") ? "text-xs uppercase tracking-wide text-primary" : "text-xs uppercase tracking-wide text-destructive"}>
                {message}
              </p>
            ) : null}
          </div>
          <SheetFooter className="border-t border-border bg-card p-6">
            <Button
              type="submit"
              disabled={submitting}
              className="h-12 w-full uppercase tracking-widest"
            >
              {submitting ? "Dispatching..." : "Dispatch To Pipeline"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
