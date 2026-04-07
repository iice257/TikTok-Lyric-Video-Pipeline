"use client";

import Link from "next/link";

import { EmptyState, useResource } from "@/components/client-page";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { buildMediaUrl } from "@/lib/api";

export default function SongDetailPage({ params }) {
  const { data, loading, error } = useResource(`/songs/${params.id}`);

  return (
    <Shell title="Song Detail" subtitle="Lyrics, segment candidates, and generated clips.">
      {loading ? <p className="text-sm text-muted-foreground">Loading song detail...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card className="space-y-4 border-border bg-card p-4">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">{data?.song ? `${data.song.artist} - ${data.song.title}` : "Song"}</h2>
          {data?.song ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{data.song.status}</Badge>
              <Badge variant="outline">{data.song.rights_status}</Badge>
              <Badge className={data.song.publish_eligible ? "border-primary/30 bg-primary/10 text-primary" : "border-destructive/40 bg-destructive/10 text-destructive"}>
                {data.song.publish_eligible ? "eligible" : "not eligible"}
              </Badge>
            </div>
          ) : null}
        </div>
        {data?.song ? (
          <div className="flex flex-wrap gap-2">
            {data.song.audio_path ? (
              <Button asChild size="sm">
                <a href={buildMediaUrl(data.song.audio_path)} target="_blank" rel="noreferrer">
                  Audio
                </a>
              </Button>
            ) : null}
            {data.song.cover_path ? (
              <Button asChild size="sm" variant="outline">
                <a href={buildMediaUrl(data.song.cover_path)} target="_blank" rel="noreferrer">
                  Cover
                </a>
              </Button>
            ) : null}
            {data.song.lyrics_path ? (
              <Button asChild size="sm" variant="outline">
                <a href={buildMediaUrl(data.song.lyrics_path)} target="_blank" rel="noreferrer">
                  Lyrics
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="space-y-4 border-border bg-card p-4">
          <h3 className="text-base font-semibold">Lyrics Artifacts</h3>
          {data?.lyrics_artifacts?.length ? (
            <div className="space-y-3">
              {data.lyrics_artifacts.map((artifact) => (
                <div key={artifact.id} className="rounded-md border border-border bg-background/50 p-3">
                  <p className="text-sm font-medium">{artifact.source_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {artifact.source_format} | confidence {artifact.confidence}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No lyrics artifacts" body="The lyrics loop has not produced an artifact yet." />
          )}
        </Card>

        <Card className="space-y-4 border-border bg-card p-4">
          <h3 className="text-base font-semibold">Segment Candidates</h3>
          {data?.segment_candidates?.length ? (
            <div className="space-y-3">
              {data.segment_candidates.map((segment) => (
                <div key={segment.id} className="rounded-md border border-border bg-background/50 p-3">
                  <p className="text-sm font-medium">{segment.caption_seed}</p>
                  <p className="text-sm text-muted-foreground">
                    {segment.start_second}s - {segment.end_second}s | score {segment.score}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No segments yet" body="The segment loop has not created candidate windows yet." />
          )}
        </Card>
      </div>

      <Card className="space-y-4 border-border bg-card p-4">
        <h3 className="text-base font-semibold">Generated Clips</h3>
        {data?.clips?.length ? (
          <div className="space-y-3">
            {data.clips.map((clip) => (
              <Link key={clip.id} href={`/clips/${clip.id}`} className="block rounded-md border border-border bg-background/50 p-3 transition-colors hover:border-primary/40">
                <p className="text-sm font-medium">{clip.caption}</p>
                <p className="text-sm text-muted-foreground">{clip.status}</p>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="No clips yet" body="Generated clips will appear after render jobs complete." />
        )}
      </Card>
    </Shell>
  );
}
