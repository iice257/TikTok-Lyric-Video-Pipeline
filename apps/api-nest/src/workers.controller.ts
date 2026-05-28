import { Controller, Get, Param } from "@nestjs/common";

import { Database } from "./database";

@Controller("workers")
export class WorkersController {
  constructor(private readonly db: Database) {}

  @Get()
  async list() {
    return {
      workers: await this.db.query(
        `select id, worker_name, status, current_loop, current_job_id,
                metadata_json, last_seen_at
           from worker_heartbeats
          order by worker_name asc`,
      ),
    };
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    const workers = await this.db.query(
      `select *
         from worker_heartbeats
        where id = $1`,
      [id],
    );
    return { worker: workers[0] ?? null };
  }
}
