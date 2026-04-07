"use client";

import Link from "next/link";
import { Clock3, Play } from "lucide-react";

import { EmptyState, useResource } from "@/components/client-page";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function StatusBadge({ song }) {
  if (song.publish_eligible) {
    return <Badge className="border-primary/30 bg-primary/10 text-primary">READY</Badge>;
  }
  if (song.status === "review") {
    return <Badge className="border-destructive/40 bg-destructive/10 text-destructive">IN REVIEW</Badge>;
  }
  return <Badge variant="outline">DRAFT</Badge>;
}

export default function SongsPage() {
  const { data, loading, error } = useResource("/songs");
  const songs = data?.songs || [];

  return (
    <Shell title="Clip Browser" subtitle="Manage and review all pipeline media assets.">
      {loading ? <p className="text-sm text-muted-foreground">Loading songs...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {songs.length ? (
        <Tabs defaultValue="clips" className="gap-5">
          <TabsList variant="line" className="border border-border bg-card p-1">
            <TabsTrigger value="clips">Clips</TabsTrigger>
            <TabsTrigger value="songs">Songs</TabsTrigger>
          </TabsList>

          <TabsContent value="clips">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {songs.map((song) => (
                <Link key={song.id} href={`/songs/${song.id}`}>
                  <Card className="group overflow-hidden border-border bg-card transition-colors hover:border-primary/40">
                    <div className="relative aspect-video border-b border-border bg-muted">
                      <div className="absolute inset-0 bg-gradient-to-t from-background/70 to-transparent" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                        <div className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Play className="size-5" />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold">{song.artist} - {song.title}</h3>
                          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock3 className="size-3" />
                            {song.created_at ? new Date(song.created_at).toLocaleString() : "No timestamp"}
                          </p>
                        </div>
                        <StatusBadge song={song} />
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="songs">
            <div className="space-y-3">
              {songs.map((song) => (
                <Link key={song.id} href={`/songs/${song.id}`}>
                  <Card className="border-border bg-card p-4 transition-colors hover:border-primary/40">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <h3 className="text-base font-semibold">{song.artist} - {song.title}</h3>
                        <p className="text-sm text-muted-foreground">{song.source_type} | rights: {song.rights_status}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{song.status}</Badge>
                        <Button size="sm" variant="outline">Open</Button>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        <EmptyState title="No songs yet" body="Use Song Intake to create tracks and populate the browser." />
      )}
    </Shell>
  );
}
