import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { readConfig } from "./config";

async function bootstrap(): Promise<void> {
  const config = readConfig();
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: config.corsOrigin,
    credentials: true,
  });
  await app.listen(config.port);
}

void bootstrap();
