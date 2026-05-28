import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { ApiKeyGuard } from "./api-key.guard";
import { AlertsController } from "./alerts.controller";
import { ClipsController } from "./clips.controller";
import { Database } from "./database";
import { HealthController } from "./health.controller";
import { JobsController } from "./jobs.controller";
import { LyricsController } from "./lyrics.controller";
import { SearchController } from "./search.controller";
import { SongsController } from "./songs.controller";
import { WorkersController } from "./workers.controller";

@Module({
  controllers: [
    HealthController,
    SongsController,
    ClipsController,
    SearchController,
    JobsController,
    AlertsController,
    WorkersController,
    LyricsController,
  ],
  providers: [
    Database,
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}
