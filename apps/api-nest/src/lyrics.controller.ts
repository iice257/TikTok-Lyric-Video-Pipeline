import { Controller, Get, Param, Query } from "@nestjs/common";

import { Database } from "./database";

@Controller("lyrics-artifacts")
export class LyricsController {
  constructor(private readonly db: Database) {}

  @Get()
  async list(@Query("limit") limit = "50") {
    return {
      lyrics_artifacts: await this.db.query(
        `select lyrics_artifacts.id, lyrics_artifacts.song_id, lyrics_artifacts.source_format,
                lyrics_artifacts.source_name, lyrics_artifacts.status, lyrics_artifacts.was_aligned,
                lyrics_artifacts.confidence, lyrics_artifacts.line_count,
                lyrics_artifacts.created_at, lyrics_artifacts.updated_at,
                songs.title as song_title, songs.artist as song_artist
           from lyrics_artifacts
           join songs on songs.id = lyrics_artifacts.song_id
          order by lyrics_artifacts.updated_at desc
          limit $1`,
        [Math.min(Math.max(Number(limit) || 50, 1), 100)],
      ),
    };
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    const artifacts = await this.db.query(
      `select lyrics_artifacts.*, songs.title as song_title, songs.artist as song_artist
         from lyrics_artifacts
         join songs on songs.id = lyrics_artifacts.song_id
        where lyrics_artifacts.id = $1`,
      [id],
    );
    return { lyrics_artifact: artifacts[0] ?? null };
  }
}
