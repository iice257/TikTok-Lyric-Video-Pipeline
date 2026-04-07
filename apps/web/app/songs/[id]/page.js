"use client";

import Link from "next/link";

import { buildMediaUrl } from "@/lib/api";
import { useResource } from "@/components/client-page";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function SongDetailPage({ params }) {
  const { data, loading, error } = useResource(`/songs/${params.id}`);

  return (
    <AdminShell
      title={data?.song ? `${data.song.artist} - ${data.song.title}` : "Song Detail"}
      subtitle="Lyrics artifacts, segment candidates, and generated clips."
    >
      <div className="space-y-4">
        {loading ? <p className="text-sm text-muted-foreground">Loading song detail...</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {data?.song ? (
          <Card className="border-border bg-card">
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="uppercase tracking-widest">{data.song.status}</Badge>
                <Badge variant="secondary" className="uppercase tracking-widest">{data.song.rights_status}</Badge>
                <Badge variant={data.song.publish_eligible ? "default" : "secondary"} className="uppercase tracking-widest">
                  {data.song.publish_eligible ? "eligible" : "review"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{data.song.audio_path}</p>
              <div className="flex flex-wrap gap-2">
                {data.song.audio_path ? (
                  <Button asChild size="sm" className="uppercase tracking-widest">
                    <a href={buildMediaUrl(data.song.audio_path)} target="_blank" rel="noreferrer">Audio</a>
                  </Button>
                ) : null}
                {data.song.cover_path ? (
                  <Button asChild variant="outline" size="sm" className="uppercase tracking-widest">
                    <a href={buildMediaUrl(data.song.cover_path)} target="_blank" rel="noreferrer">Cover</a>
                  </Button>
                ) : null}
                {data.song.lyrics_path ? (
                  <Button asChild variant="ghost" size="sm" className="uppercase tracking-widest">
                    <a href={buildMediaUrl(data.song.lyrics_path)} target="_blank" rel="noreferrer">Lyrics</a>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-border bg-card">
          <CardContent className="space-y-3 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Lyrics Artifacts</p>
            {(data?.lyrics_artifacts || []).map((artifact) => (
              <div key={artifact.id} className="space-y-1 border border-border bg-background/40 p-3">
                <p className="text-sm font-semibold">{artifact.source_name}</p>
                <p className="text-xs text-muted-foreground">
                  {artifact.source_format} | confidence {artifact.confidence}
                </p>
              </div>
            ))}
            {!loading && !(data?.lyrics_artifacts || []).length ? (
              <p className="text-sm text-muted-foreground">No lyrics artifacts yet.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="space-y-3 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Segments and Clips</p>
            {(data?.segment_candidates || []).map((segment) => (
              <div key={segment.id} className="space-y-1 border border-border bg-background/40 p-3">
                <p className="text-sm font-semibold">{segment.caption_seed}</p>
                <p className="text-xs text-muted-foreground">
                  {segment.start_second}s - {segment.end_second}s | score {segment.score}
                </p>
              </div>
            ))}
            {(data?.clips || []).map((clip) => (
              <Button asChild key={clip.id} variant="outline" className="w-full justify-start uppercase tracking-widest">
                <Link href={`/clips/${clip.id}`}>{clip.caption || clip.id}</Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
