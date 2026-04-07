"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiFetch } from "@/lib/api";

export function IntakeSheet({ open, onOpenChange }) {
  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const [rightsStatus, setRightsStatus] = useState("licensed");
  const [environment, setEnvironment] = useState("prod");
  const [audio, setAudio] = useState(null);
  const [cover, setCover] = useState(null);
  const [lyrics, setLyrics] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function onSubmit(event) {
    event.preventDefault();
    if (!audio) {
      setMessage("Audio file is required.");
      return;
    }
    setSubmitting(true);
    setMessage("");
    const form = new FormData();
    form.append("artist", artist);
    form.append("title", title);
    form.append("rights_status", rightsStatus);
    form.append("environment", environment);
    form.append("audio", audio);
    if (cover) {
      form.append("cover", cover);
    }
    if (lyrics) {
      form.append("lyrics", lyrics);
    }
    try {
      const payload = await apiFetch("/manual-intake", {
        method: "POST",
        body: form,
      });
      setMessage(`Queued ${payload.song.artist} - ${payload.song.title}`);
      setArtist("");
      setTitle("");
      setRightsStatus("licensed");
      setEnvironment("prod");
      setAudio(null);
      setCover(null);
      setLyrics(null);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton
        className="w-full max-w-[27.5rem] overflow-y-auto border-border bg-card p-0 text-card-foreground"
      >
        <SheetHeader className="border-b border-border bg-background/60 p-6">
          <SheetTitle className="text-primary">[ SONG INTAKE ]</SheetTitle>
          <SheetDescription>Dispatch a track to the pipeline.</SheetDescription>
        </SheetHeader>
        <form className="space-y-6 p-6" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="source-url">Source URL</Label>
            <Input id="source-url" placeholder="Enter valid URI..." />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="artist">Artist</Label>
              <Input id="artist" value={artist} onChange={(event) => setArtist(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} required />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rights">Rights Status</Label>
              <Select value={rightsStatus} onValueChange={setRightsStatus}>
                <SelectTrigger id="rights">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="licensed">licensed</SelectItem>
                  <SelectItem value="tiktok_cml">tiktok_cml</SelectItem>
                  <SelectItem value="pending_review">pending_review</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="environment">Environment</Label>
              <Select value={environment} onValueChange={setEnvironment}>
                <SelectTrigger id="environment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prod">prod</SelectItem>
                  <SelectItem value="lab">lab</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="audio">Audio</Label>
            <Input
              id="audio"
              type="file"
              accept=".mp3,.wav,.m4a,.flac"
              onChange={(event) => setAudio(event.target.files?.[0] || null)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cover">Cover Art</Label>
            <Input
              id="cover"
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              onChange={(event) => setCover(event.target.files?.[0] || null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lyrics">Lyrics</Label>
            <Input
              id="lyrics"
              type="file"
              accept=".lrc,.srt,.json,.txt"
              onChange={(event) => setLyrics(event.target.files?.[0] || null)}
            />
          </div>
          {message ? (
            <p className={message.startsWith("Queued") ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{message}</p>
          ) : null}
          <SheetFooter className="border-t border-border px-0 pt-6">
            <Button type="submit" className="w-full uppercase" disabled={submitting}>
              {submitting ? "Dispatching..." : "Dispatch to Pipeline"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
