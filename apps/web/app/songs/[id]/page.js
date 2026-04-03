"use client";

import Link from "next/link";

import { EmptyState, useResource } from "@/components/client-page";
import { Panel, Shell } from "@/components/shell";
import { buildMediaUrl } from "@/lib/api";

export default function SongDetailPage({ params }) {
  const { data, loading, error } = useResource(`/songs/${params.id}`);

  return (
    <Shell title="Song Detail">
      <Panel title={data?.song ? `${data.song.artist} - ${data.song.title}` : "Song"} subtitle="Lyrics, candidates, and generated clips">
        {loading ? <p>Loading song detail...</p> : null}
        {error ? <p className="errorText">{error}</p> : null}
        {data?.song ? (
          <div className="stack">
            <div className="tagRow">
              <span className="tag">{data.song.status}</span>
              <span className="tag">{data.song.rights_status}</span>
              <span className={`tag ${data.song.publish_eligible ? "success" : "warning"}`}>
                {data.song.publish_eligible ? "eligible" : "not eligible"}
              </span>
            </div>
            <p className="muted">{data.song.audio_path}</p>
            <div className="actions">
              {data.song.audio_path ? <a className="button" href={buildMediaUrl(data.song.audio_path)} target="_blank" rel="noreferrer">Audio</a> : null}
              {data.song.cover_path ? <a className="button secondary" href={buildMediaUrl(data.song.cover_path)} target="_blank" rel="noreferrer">Cover</a> : null}
              {data.song.lyrics_path ? <a className="button ghost" href={buildMediaUrl(data.song.lyrics_path)} target="_blank" rel="noreferrer">Lyrics</a> : null}
            </div>
          </div>
        ) : null}
      </Panel>
      <Panel title="Lyrics Artifacts" subtitle="Source provenance and confidence">
        {data?.lyrics_artifacts?.length ? (
          <div className="list">
            {data.lyrics_artifacts.map((artifact) => (
              <div className="itemCard" key={artifact.id}>
                <strong>{artifact.source_name}</strong>
                <p className="muted">{artifact.source_format} · confidence {artifact.confidence}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No lyrics artifacts" body="The lyrics loop has not produced an artifact yet." />
        )}
      </Panel>
      <Panel title="Segments and Clips" subtitle="Heuristic candidates and selected outputs">
        {data?.segment_candidates?.length ? (
          <div className="list">
            {data.segment_candidates.map((segment) => (
              <div className="itemCard" key={segment.id}>
                <strong>{segment.caption_seed}</strong>
                <p className="muted">
                  {segment.start_second}s - {segment.end_second}s · score {segment.score}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No segments yet" body="The segment loop has not created candidate windows yet." />
        )}
        {data?.clips?.length ? (
          <div className="list" style={{ marginTop: 12 }}>
            {data.clips.map((clip) => (
              <Link className="itemCard" key={clip.id} href={`/clips/${clip.id}`}>
                <strong>{clip.caption}</strong>
                <p className="muted">{clip.status}</p>
              </Link>
            ))}
          </div>
        ) : null}
      </Panel>
    </Shell>
  );
}
