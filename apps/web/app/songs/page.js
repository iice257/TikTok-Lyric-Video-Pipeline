"use client";

import Link from "next/link";

import { EmptyState, useResource } from "@/components/client-page";
import { Panel, Shell } from "@/components/shell";

export default function SongsPage() {
  const { data, loading, error } = useResource("/songs");

  return (
    <Shell title="Songs">
      <Panel title="Song Intake" subtitle="All ingested songs and their pipeline state">
        {loading ? <p>Loading songs...</p> : null}
        {error ? <p className="errorText">{error}</p> : null}
        {data?.songs?.length ? (
          <div className="list">
            {data.songs.map((song) => (
              <Link className="itemCard" key={song.id} href={`/songs/${song.id}`}>
                <strong>{song.artist} - {song.title}</strong>
                <p className="muted">{song.source_type} · {song.rights_status}</p>
                <div className="tagRow">
                  <span className="tag">{song.status}</span>
                  <span className={`tag ${song.publish_eligible ? "success" : "warning"}`}>
                    {song.publish_eligible ? "publish eligible" : "review needed"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="No songs yet" body="Use Manual Intake or feed sync to create songs." />
        )}
      </Panel>
    </Shell>
  );
}
