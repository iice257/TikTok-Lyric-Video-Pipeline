"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useResource } from "@/components/client-page";
import { AdminShell } from "@/components/admin/admin-shell";
import { Panel } from "@/components/app/bits";
import { PresetPicker } from "@/components/app/preset-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const dynamic = "force-dynamic";

function FileField({ id, name, label, hint, accept, required }) {
  const [fileName, setFileName] = useState("");
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer flex-col gap-1 rounded-2xl border border-dashed border-border px-4 py-4 transition-colors hover:border-primary/60 focus-within:border-primary"
    >
      <span className="text-sm font-medium">
        {label}
        {required ? null : <span className="font-normal text-muted-foreground"> · optional</span>}
      </span>
      <span className={fileName ? "truncate text-sm text-primary" : "text-xs text-muted-foreground"}>{fileName || hint}</span>
      <input
        id={id}
        name={name}
        type="file"
        accept={accept}
        required={required}
        className="sr-only"
        onChange={(event) => setFileName(event.target.files?.[0]?.name || "")}
      />
    </label>
  );
}

export default function NewVideoPage() {
  const presetResource = useResource("/presets", null, { intervalMs: 0 });
  const [preset, setPreset] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (!preset && presetResource.data?.default) {
      setPreset(presetResource.data.default);
    }
  }, [preset, presetResource.data?.default]);

  async function onSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const payload = await apiFetch("/manual-intake", { method: "POST", body: new FormData(event.currentTarget) });
      setCreated({ ...payload.song, duplicate: Boolean(payload.duplicate) });
      setFormKey((key) => key + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminShell title="New video" subtitle="Add a song and pick a look. Clips render automatically.">
      {created ? (
        <div className="flex flex-col gap-3 rounded-3xl border border-primary/40 bg-primary/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            {created.duplicate ? "Already added: " : "Added "}
            <span className="font-semibold">
              {created.artist} — {created.title}
            </span>
            {created.duplicate ? "." : ". Clips will appear in your library as they render."}
          </p>
          <div className="flex gap-2">
            <Button asChild size="sm" className="rounded-full">
              <Link href={`/songs/${created.id}`}>View song</Link>
            </Button>
            <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setCreated(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      <form key={formKey} onSubmit={onSubmit} className="flex flex-col gap-6">
        <Panel className="flex flex-col gap-5">
          <h2 className="font-heading text-2xl">Song</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="intake-artist">Artist</Label>
              <Input id="intake-artist" name="artist" required maxLength={255} className="h-11 rounded-xl" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="intake-title">Title</Label>
              <Input id="intake-title" name="title" required maxLength={255} className="h-11 rounded-xl" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <FileField id="intake-audio" name="audio" label="Audio" hint="MP3, WAV, M4A or FLAC" accept=".mp3,.wav,.m4a,.flac" required />
            <FileField
              id="intake-lyrics"
              name="lyrics"
              label="Lyrics"
              hint="Timed .lrc or .srt syncs best; plain .txt is auto-timed"
              accept=".lrc,.srt,.json,.txt"
            />
            <FileField id="intake-cover" name="cover" label="Cover art" hint="JPG, PNG or WebP" accept=".jpg,.jpeg,.png,.webp" />
          </div>
          <input type="hidden" name="rights_status" value="licensed" />
          <input type="hidden" name="environment" value="prod" />
        </Panel>

        <Panel className="flex flex-col gap-5">
          <div>
            <h2 className="font-heading text-2xl">Look</h2>
            <p className="mt-1 text-sm text-muted-foreground">Colors, font and lyric motion for every clip from this song.</p>
          </div>
          {presetResource.error ? <p className="text-sm text-destructive">{presetResource.error}</p> : null}
          {presetResource.data ? (
            <PresetPicker presets={presetResource.data.presets} value={preset} onChange={setPreset} name="preset" />
          ) : (
            <p className="text-sm text-muted-foreground">Loading looks…</p>
          )}
        </Panel>

        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Button type="submit" size="lg" disabled={submitting} className="rounded-full px-8">
            {submitting ? "Uploading…" : "Make videos"}
          </Button>
          {error ? <p aria-live="polite" className="text-sm text-destructive">{error}</p> : null}
        </div>
      </form>
    </AdminShell>
  );
}
