import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { config } from "./config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const { PORT, CORS_ORIGIN } = config();

  app.enableCors({
    origin: CORS_ORIGIN.split(","),
    credentials: true,
  });

  await app.listen(PORT);
  // eslint-disable-next-line no-console
  console.log(`ArenaFit API listening on http://localhost:${PORT}`);
}

bootstrap();
