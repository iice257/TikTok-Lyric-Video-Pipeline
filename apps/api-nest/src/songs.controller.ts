import { Controller, Get, Param, Query } from "@nestjs/common";

import { Database } from "./database";

@Controller("songs")
export class SongsController {
  constructor(private readonly db: Database) {}

  @Get()
  async list(@Query("limit") limit = "50") {
    return {
      songs: await this.db.query(
        `select id, song_key, title, artist, source_type, provider_name, environment,
                rights_status, status, review_status, publish_eligible, manual_priority,
                duration_seconds, created_at, updated_at
           from songs
          order by updated_at desc
          limit $1`,
        [Math.min(Math.max(Number(limit) || 50, 1), 100)],
      ),
    };
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    const songs = await this.db.query(
      `select id, song_key, title, artist, source_type, provider_name, environment,
              rights_status, status, review_status, publish_eligible, manual_priority,
              duration_seconds, audio_features_json, sections_json, metadata_json,
              last_error, created_at, updated_at
         from songs
        where id = $1`,
      [id],
    );
    return { song: songs[0] ?? null };
  }
}
