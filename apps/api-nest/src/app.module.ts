import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { ApiKeyGuard } from "./api-key.guard";
import { ClipsController } from "./clips.controller";
import { Database } from "./database";
import { HealthController } from "./health.controller";
import { SearchController } from "./search.controller";
import { SongsController } from "./songs.controller";

@Module({
  controllers: [HealthController, SongsController, ClipsController, SearchController],
  providers: [
    Database,
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}
