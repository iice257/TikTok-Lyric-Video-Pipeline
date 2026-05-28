import { Controller, Get, Param, Query } from "@nestjs/common";

import { Database } from "./database";

@Controller("jobs")
export class JobsController {
  constructor(private readonly db: Database) {}

  @Get()
  async list(@Query("limit") limit = "50") {
    const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const renderJobs = await this.db.query(
      `select render_jobs.id, 'render' as job_type, render_jobs.clip_id, render_jobs.status,
              render_jobs.priority, render_jobs.attempt_count, render_jobs.claimed_by,
              render_jobs.lease_expires_at, render_jobs.completed_at,
              render_jobs.created_at, render_jobs.updated_at,
              clips.caption as clip_caption, songs.title as song_title, songs.artist as song_artist
         from render_jobs
         left join clips on clips.id = render_jobs.clip_id
         left join songs on songs.id = clips.song_id
        order by render_jobs.updated_at desc
        limit $1`,
      [boundedLimit],
    );
    const uploadJobs = await this.db.query(
      `select upload_jobs.id, 'upload' as job_type, upload_jobs.clip_id, upload_jobs.status,
              upload_jobs.publish_mode, upload_jobs.scheduled_at, upload_jobs.attempt_count,
              upload_jobs.claimed_by, upload_jobs.lease_expires_at, upload_jobs.platform_post_id,
              upload_jobs.approved_at, upload_jobs.completed_at,
              upload_jobs.created_at, upload_jobs.updated_at,
              clips.caption as clip_caption, songs.title as song_title, songs.artist as song_artist
         from upload_jobs
         left join clips on clips.id = upload_jobs.clip_id
         left join songs on songs.id = clips.song_id
        order by upload_jobs.updated_at desc
        limit $1`,
      [boundedLimit],
    );
    return {
      jobs: [...renderJobs, ...uploadJobs]
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
        .slice(0, boundedLimit),
    };
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    const renderJobs = await this.db.query(
      `select render_jobs.*, 'render' as job_type, clips.caption as clip_caption,
              songs.title as song_title, songs.artist as song_artist
         from render_jobs
         left join clips on clips.id = render_jobs.clip_id
         left join songs on songs.id = clips.song_id
        where render_jobs.id = $1`,
      [id],
    );
    if (renderJobs[0]) {
      return { job: renderJobs[0] };
    }
    const uploadJobs = await this.db.query(
      `select upload_jobs.*, 'upload' as job_type, clips.caption as clip_caption,
              songs.title as song_title, songs.artist as song_artist
         from upload_jobs
         left join clips on clips.id = upload_jobs.clip_id
         left join songs on songs.id = clips.song_id
        where upload_jobs.id = $1`,
      [id],
    );
    return { job: uploadJobs[0] ?? null };
  }
}
