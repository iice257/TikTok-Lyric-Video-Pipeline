import { Controller, Get, Param, Query } from "@nestjs/common";

import { Database } from "./database";

@Controller("clips")
export class ClipsController {
  constructor(private readonly db: Database) {}

  @Get()
  async list(@Query("limit") limit = "50") {
    return {
      clips: await this.db.query(
        `select clips.id, clips.song_id, clips.status, clips.review_required, clips.caption,
                clips.hook_category, clips.duration_seconds, clips.scheduled_at,
                clips.created_at, clips.updated_at, songs.title as song_title,
                songs.artist as song_artist
           from clips
           join songs on songs.id = clips.song_id
          order by clips.updated_at desc
          limit $1`,
        [Math.min(Math.max(Number(limit) || 50, 1), 100)],
      ),
    };
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    const clips = await this.db.query(
      `select clips.*, songs.title as song_title, songs.artist as song_artist
         from clips
         join songs on songs.id = clips.song_id
        where clips.id = $1`,
      [id],
    );
    return { clip: clips[0] ?? null };
  }
}
