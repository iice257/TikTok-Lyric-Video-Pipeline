import { Controller, Get, Param, Query } from "@nestjs/common";

import { Database } from "./database";

@Controller("alerts")
export class AlertsController {
  constructor(private readonly db: Database) {}

  @Get()
  async list(@Query("limit") limit = "50") {
    return {
      alerts: await this.db.query(
        `select id, kind, severity, message, source_type, source_id, status,
                acknowledged_at, acknowledged_by_id, created_at, updated_at
           from alerts
          order by created_at desc
          limit $1`,
        [Math.min(Math.max(Number(limit) || 50, 1), 100)],
      ),
    };
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    const alerts = await this.db.query(
      `select *
         from alerts
        where id = $1`,
      [id],
    );
    return { alert: alerts[0] ?? null };
  }
}
