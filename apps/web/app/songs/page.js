"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { apiFetch, buildMediaUrl } from "@/lib/api";
import { formatDateTime, formatDuration } from "@/lib/format";
import { useResource } from "@/components/client-page";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

function clipBadge(status) {
  if (status === "posted" || status === "ready") return "default";
  if (status === "failed") return "destructive";
  if (status === "draft") return "secondary";
  return "outline";
}

function describeClip(clip) {
  return `${clip.caption || ""} ${clip.status || ""}`.toLowerCase();
}

function describeSong(song) {
  return `${song.artist || ""} ${song.title || ""} ${song.rights_status || ""}`.toLowerCase();
}

function optionLabel(value) {
  return value.replaceAll("_", " ");
}

export default function SongsPage() {
  const clipResource = useResource("/clips");
  const songResource = useResource("/songs");
  const pipelineResource = useResource("/pipeline/settings");

  const router = useRouter();
  const pathname = usePathname();
  const [queryString, setQueryString] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const applySearch = () => setQueryString(window.location.search);
    applySearch();
    window.addEventListener("popstate", applySearch);
    return () => window.removeEventListener("popstate", applySearch);
  }, [pathname]);

  const params = new URLSearchParams(queryString.startsWith("?") ? queryString.slice(1) : queryString);
  const view = params.get("view") === "songs" ? "songs" : "clips";

  useEffect(() => {
    setStatusFilter("all");
    setTypeFilter("all");
  }, [view]);

  function setView(nextView) {
    const nextParams = new URLSearchParams(params.toString());
    nextParams.set("view", nextView);
    const nextQuery = nextParams.toString();
    setQueryString(`?${nextQuery}`);
    router.push(`${pathname}?${nextQuery}`);
  }

  async function togglePipeline() {
    const paused = Boolean(pipelineResource.data?.pipeline?.paused);
    setBusy(true);
    try {
      await apiFetch(paused ? "/pipeline/resume" : "/pipeline/pause", { method: "POST" });
      await pipelineResource.reload();
    } finally {
      setBusy(false);
    }
  }

  async function emergencyStop() {
    setBusy(true);
    try {
      await apiFetch("/pipeline/pause", { method: "POST" });
      await pipelineResource.reload();
    } finally {
      setBusy(false);
    }
  }

  const filteredClips = useMemo(() => {
    const clips = clipResource.data?.clips || [];
    return clips.filter((clip) => {
      const matchesQuery = !deferredQuery || describeClip(clip).includes(deferredQuery);
      const matchesStatus = statusFilter === "all" || clip.status === statusFilter;
      const clipType = clip.review_required ? "review" : "auto";
      const matchesType = typeFilter === "all" || clipType === typeFilter;
      return matchesQuery && matchesStatus && matchesType;
    });
  }, [clipResource.data?.clips, deferredQuery, statusFilter, typeFilter]);

  const filteredSongs = useMemo(() => {
    const songs = songResource.data?.songs || [];
    return songs.filter((song) => {
      const matchesQuery = !deferredQuery || describeSong(song).includes(deferredQuery);
      const matchesStatus = statusFilter === "all" || song.status === statusFilter;
      const matchesType = typeFilter === "all" || song.source_type === typeFilter;
      return matchesQuery && matchesStatus && matchesType;
    });
  }, [songResource.data?.songs, deferredQuery, statusFilter, typeFilter]);

  const statusOptions = useMemo(() => {
    const items = view === "songs" ? songResource.data?.songs || [] : clipResource.data?.clips || [];
    return [...new Set(items.map((item) => item.status).filter(Boolean))].sort();
  }, [clipResource.data?.clips, songResource.data?.songs, view]);

  const typeOptions = useMemo(() => {
    if (view === "songs") {
      return [...new Set((songResource.data?.songs || []).map((song) => song.source_type).filter(Boolean))].sort();
    }
    return ["auto", "review"];
  }, [clipResource.data?.clips, songResource.data?.songs, view]);

  return (
    <AdminShell
      title="Clip Browser"
      subtitle="Manage and review all pipeline media assets."
      status={{
        state: pipelineResource.data?.pipeline?.paused ? "PAUSED" : "RUNNING",
      }}
      actions={
        <>
          <Button
            variant="destructive"
            size="sm"
            disabled={busy || pipelineResource.data?.pipeline?.paused}
            onClick={emergencyStop}
            className="uppercase tracking-[0.18em]"
          >
            Emergency Stop
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={togglePipeline}
            className="uppercase tracking-[0.18em]"
          >
            {pipelineResource.data?.pipeline?.paused ? "Resume Flow" : "Pause Flow"}
          </Button>
        </>
      }
    >
      <Tabs value={view} onValueChange={setView} className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 rounded-md border border-border bg-card/80 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <TabsList className="grid w-full max-w-60 grid-cols-2 rounded-md border border-border bg-background p-1">
              <TabsTrigger value="clips" className="uppercase tracking-[0.18em]">
                Clips
              </TabsTrigger>
              <TabsTrigger value="songs" className="uppercase tracking-[0.18em]">
                Songs
              </TabsTrigger>
            </TabsList>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 min-w-36 border-border bg-background uppercase tracking-[0.18em]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">all status</SelectItem>
                    {statusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {optionLabel(status)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-8 min-w-32 border-border bg-background uppercase tracking-[0.18em]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">all types</SelectItem>
                    {typeOptions.map((type) => (
                      <SelectItem key={type} value={type}>
                        {optionLabel(type)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setStatusFilter("all");
                  setTypeFilter("all");
                }}
                className="uppercase tracking-[0.18em]"
              >
                Reset
              </Button>
            </div>
          </div>

          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Quick search..."
            className="h-10 border-border bg-background"
          />
        </div>

        <TabsContent value="clips" className="m-0">
          {clipResource.loading ? <p className="text-sm text-muted-foreground">Loading clips...</p> : null}
          {clipResource.error ? <p className="text-sm text-destructive">{clipResource.error}</p> : null}

          <div className="grid gap-5 lg:grid-cols-3">
            {filteredClips.map((clip) => (
              <Link key={clip.id} href={`/clips/${clip.id}`}>
                <Card className="h-full overflow-hidden border-border bg-card/80 transition-colors hover:border-primary/50">
                  <div className="aspect-video border-b border-border bg-background">
                    {clip.preview_path || clip.video_path ? (
                      <video
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                        src={buildMediaUrl(clip.preview_path || clip.video_path)}
                      />
                    ) : null}
                  </div>
                  <CardContent className="flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold tracking-tight">{clip.caption || clip.id}</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {formatDuration(clip.duration_seconds)} | {formatDateTime(clip.updated_at)}
                        </p>
                      </div>
                      <Badge variant={clipBadge(clip.status)} className="uppercase tracking-[0.18em]">
                        {clip.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {!clipResource.loading && !filteredClips.length ? (
            <Card className="border-border bg-card">
              <CardContent className="p-5 text-sm text-muted-foreground">
                No clips match the current filters.
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="songs" className="m-0">
          {songResource.loading ? <p className="text-sm text-muted-foreground">Loading songs...</p> : null}
          {songResource.error ? <p className="text-sm text-destructive">{songResource.error}</p> : null}

          <div className="space-y-3">
            {filteredSongs.map((song) => (
              <Link key={song.id} href={`/songs/${song.id}`}>
                <Card className="border-border bg-card/80 transition-colors hover:border-primary/50">
                  <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold tracking-tight">
                        {song.artist} - {song.title}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {song.source_type} | {song.rights_status}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="uppercase tracking-[0.18em]">
                        {song.status}
                      </Badge>
                      <Badge variant={song.publish_eligible ? "default" : "secondary"} className="uppercase tracking-[0.18em]">
                        {song.publish_eligible ? "Eligible" : "Review"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {!songResource.loading && !filteredSongs.length ? (
            <Card className="border-border bg-card">
              <CardContent className="p-5 text-sm text-muted-foreground">
                No songs match the current filters.
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>
    </AdminShell>
  );
}
