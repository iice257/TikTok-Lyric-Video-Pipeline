import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, QueryResultRow } from "pg";

import { readConfig } from "./config";

@Injectable()
export class Database implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: readConfig().databaseUrl,
  });

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const result = await this.pool.query<T>(text, params);
    return result.rows;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
