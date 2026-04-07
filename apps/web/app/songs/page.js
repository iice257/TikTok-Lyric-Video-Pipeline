"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { buildMediaUrl } from "@/lib/api";
import { useResource } from "@/components/client-page";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

function clipBadge(status) {
  if (status === "posted" || status === "ready") return "default";
  if (status === "failed") return "destructive";
  if (status === "draft") return "secondary";
  return "outline";
}

export default function SongsPage() {
  const clipResource = useResource("/clips");
  const songResource = useResource("/songs");

  const router = useRouter();
  const pathname = usePathname();
  const [queryString, setQueryString] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const applySearch = () => setQueryString(window.location.search);
    applySearch();
    window.addEventListener("popstate", applySearch);
    return () => window.removeEventListener("popstate", applySearch);
  }, [pathname]);

  const params = new URLSearchParams(queryString.startsWith("?") ? queryString.slice(1) : queryString);
  const view = params.get("view") === "songs" ? "songs" : "clips";

  function setView(nextView) {
    const nextParams = new URLSearchParams(params.toString());
    nextParams.set("view", nextView);
    const nextQuery = nextParams.toString();
    setQueryString(`?${nextQuery}`);
    router.push(`${pathname}?${nextQuery}`);
  }

  return (
    <AdminShell
      title="Clip Browser"
      subtitle="Manage and review all pipeline media assets."
      actions={
        <Button size="sm" className="uppercase tracking-widest">
          Pause Flow
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 border border-border bg-card p-2">
          <Input
            placeholder="Quick search..."
            className="h-9 flex-1 bg-secondary/40 text-xs"
          />
          <Button variant="outline" size="sm" className="uppercase tracking-widest">
            Status
          </Button>
          <Button variant="outline" size="sm" className="uppercase tracking-widest">
            Type
          </Button>
          <Button variant="ghost" size="sm" className="uppercase tracking-widest text-muted-foreground">
            Reset
          </Button>
        </div>

        <Tabs value={view} onValueChange={setView}>
          <TabsList className="grid h-auto w-full max-w-sm grid-cols-2 bg-secondary/40 p-1">
            <TabsTrigger value="clips" className="h-9 uppercase tracking-widest">Clips</TabsTrigger>
            <TabsTrigger value="songs" className="h-9 uppercase tracking-widest">Songs</TabsTrigger>
          </TabsList>

          <TabsContent value="clips" className="mt-4">
            {clipResource.loading ? <p className="text-sm text-muted-foreground">Loading clips...</p> : null}
            {clipResource.error ? <p className="text-sm text-destructive">{clipResource.error}</p> : null}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(clipResource.data?.clips || []).map((clip) => (
                <Link key={clip.id} href={`/clips/${clip.id}`}>
                  <Card className="h-full border-border bg-card transition-colors hover:border-primary/60">
                    <CardContent className="space-y-3 p-3">
                      <div className="aspect-video overflow-hidden border border-border bg-background/60">
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
                      <div className="space-y-2">
                        <p className="truncate text-sm font-semibold">{clip.caption || clip.id}</p>
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>{clip.duration_seconds ? `${clip.duration_seconds}s` : "n/a"}</span>
                          <span>{new Date(clip.updated_at).toLocaleString()}</span>
                        </div>
                        <Badge variant={clipBadge(clip.status)} className="uppercase tracking-widest">
                          {clip.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="songs" className="mt-4">
            {songResource.loading ? <p className="text-sm text-muted-foreground">Loading songs...</p> : null}
            {songResource.error ? <p className="text-sm text-destructive">{songResource.error}</p> : null}
            <div className="space-y-3">
              {(songResource.data?.songs || []).map((song) => (
                <Link key={song.id} href={`/songs/${song.id}`}>
                  <Card className="border-border bg-card transition-colors hover:border-primary/60">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm font-semibold">
                          {song.artist} - {song.title}
                        </p>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">
                          {song.source_type} | {song.rights_status}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="uppercase tracking-widest">{song.status}</Badge>
                        <Badge variant={song.publish_eligible ? "default" : "secondary"} className="uppercase tracking-widest">
                          {song.publish_eligible ? "eligible" : "review"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminShell>
  );
}
