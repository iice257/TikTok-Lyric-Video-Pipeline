"use client";

import Link from "next/link";

import { buildMediaUrl } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { useResource } from "@/components/client-page";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SongDetailPage({ params }) {
  const { data, loading, error } = useResource(`/songs/${params.id}`);

  return (
    <AdminShell
      title={data?.song ? `${data.song.artist} - ${data.song.title}` : "Song Detail"}
      subtitle="Lyrics artifacts, segment candidates, and generated clips."
    >
      <div className="space-y-6">
        {loading ? <p className="text-sm text-muted-foreground">Loading song detail...</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {data?.song ? (
          <Card className="border-border bg-card/80">
            <CardHeader>
              <CardTitle className="text-lg font-semibold tracking-tight">Source Assets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="uppercase tracking-[0.18em]">{data.song.status}</Badge>
                <Badge variant="secondary" className="uppercase tracking-[0.18em]">{data.song.rights_status}</Badge>
                <Badge variant={data.song.publish_eligible ? "default" : "secondary"} className="uppercase tracking-[0.18em]">
                  {data.song.publish_eligible ? "Eligible" : "Review"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{data.song.audio_path}</p>
              <div className="flex flex-wrap gap-2">
                {data.song.audio_path ? (
                  <Button asChild size="sm" className="uppercase tracking-[0.18em]">
                    <a href={buildMediaUrl(data.song.audio_path)} target="_blank" rel="noreferrer">Audio</a>
                  </Button>
                ) : null}
                {data.song.cover_path ? (
                  <Button asChild variant="outline" size="sm" className="uppercase tracking-[0.18em]">
                    <a href={buildMediaUrl(data.song.cover_path)} target="_blank" rel="noreferrer">Cover</a>
                  </Button>
                ) : null}
                {data.song.lyrics_path ? (
                  <Button asChild variant="ghost" size="sm" className="uppercase tracking-[0.18em]">
                    <a href={buildMediaUrl(data.song.lyrics_path)} target="_blank" rel="noreferrer">Lyrics</a>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border bg-card/80">
            <CardHeader>
              <CardTitle className="text-lg font-semibold tracking-tight">Lyrics Artifacts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.lyrics_artifacts || []).map((artifact) => (
                <div key={artifact.id} className="rounded-md border border-border bg-background px-4 py-3">
                  <p className="text-sm font-medium">{artifact.source_name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {artifact.source_format} | confidence {artifact.confidence}
                  </p>
                </div>
              ))}
              {!loading && !(data?.lyrics_artifacts || []).length ? (
                <p className="text-sm text-muted-foreground">No lyrics artifacts yet.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border bg-card/80">
            <CardHeader>
              <CardTitle className="text-lg font-semibold tracking-tight">Segment Candidates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.segment_candidates || []).map((segment) => (
                <div key={segment.id} className="rounded-md border border-border bg-background px-4 py-3">
                  <p className="text-sm font-medium">{segment.caption_seed}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatDuration(segment.start_second)} - {formatDuration(segment.end_second)} | score {segment.score}
                  </p>
                </div>
              ))}
              {!loading && !(data?.segment_candidates || []).length ? (
                <p className="text-sm text-muted-foreground">No segment candidates yet.</p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border bg-card/80">
          <CardHeader>
            <CardTitle className="text-lg font-semibold tracking-tight">Generated Clips</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data?.clips || []).map((clip) => (
              <Button asChild key={clip.id} variant="outline" className="w-full justify-start uppercase tracking-[0.18em]">
                <Link href={`/clips/${clip.id}`}>{clip.caption || clip.id}</Link>
              </Button>
            ))}
            {!loading && !(data?.clips || []).length ? (
              <p className="text-sm text-muted-foreground">No clips generated yet.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
