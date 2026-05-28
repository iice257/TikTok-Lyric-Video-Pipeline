import { Controller, Get, Query } from "@nestjs/common";

import { Database } from "./database";

@Controller("search")
export class SearchController {
  constructor(private readonly db: Database) {}

  @Get()
  async search(@Query("q") q = "", @Query("limit") limit = "20") {
    const cleaned = q.trim();
    const boundedLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    if (cleaned.length < 2) {
      return { query: q, strategy: "postgres_full_text", songs: [], clips: [], lyrics_artifacts: [] };
    }

    const songs = await this.db.query(
      `select id, song_key, title, artist, source_type, provider_name, environment,
              rights_status, status, review_status, publish_eligible, manual_priority,
              ts_rank(
                to_tsvector('simple', concat_ws(' ', title, artist, status, rights_status, review_status)),
                plainto_tsquery('simple', $1)
              ) as search_rank
         from songs
        where to_tsvector('simple', concat_ws(' ', title, artist, status, rights_status, review_status))
              @@ plainto_tsquery('simple', $1)
        order by search_rank desc, updated_at desc
        limit $2`,
      [cleaned, boundedLimit],
    );

    const clips = await this.db.query(
      `select clips.id, clips.song_id, clips.status, clips.review_required, clips.caption,
              clips.hook_category, clips.duration_seconds, clips.scheduled_at,
              songs.title as song_title, songs.artist as song_artist,
              ts_rank(
                to_tsvector('simple', concat_ws(' ', clips.caption, clips.hook_category, clips.status, songs.title, songs.artist)),
                plainto_tsquery('simple', $1)
              ) as search_rank
         from clips
         join songs on songs.id = clips.song_id
        where to_tsvector('simple', concat_ws(' ', clips.caption, clips.hook_category, clips.status, songs.title, songs.artist))
              @@ plainto_tsquery('simple', $1)
        order by search_rank desc, clips.updated_at desc
        limit $2`,
      [cleaned, boundedLimit],
    );

    const lyricsArtifacts = await this.db.query(
      `select lyrics_artifacts.id, lyrics_artifacts.song_id, lyrics_artifacts.source_format,
              lyrics_artifacts.source_name, lyrics_artifacts.status, lyrics_artifacts.confidence,
              lyrics_artifacts.line_count, songs.title as song_title, songs.artist as song_artist,
              ts_rank(
                to_tsvector('simple', concat_ws(' ', lyrics_artifacts.source_name, lyrics_artifacts.source_format, lyrics_artifacts.status, songs.title, songs.artist)),
                plainto_tsquery('simple', $1)
              ) as search_rank
         from lyrics_artifacts
         join songs on songs.id = lyrics_artifacts.song_id
        where to_tsvector('simple', concat_ws(' ', lyrics_artifacts.source_name, lyrics_artifacts.source_format, lyrics_artifacts.status, songs.title, songs.artist))
              @@ plainto_tsquery('simple', $1)
        order by search_rank desc, lyrics_artifacts.updated_at desc
        limit $2`,
      [cleaned, boundedLimit],
    );

    return { query: cleaned, strategy: "postgres_full_text", songs, clips, lyrics_artifacts: lyricsArtifacts };
  }
}
