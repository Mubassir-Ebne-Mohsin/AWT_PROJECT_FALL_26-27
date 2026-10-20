import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Logger } from "@nestjs/common";
import { AppModule } from "@/src/app.module";
import { configureApp, setupSwagger } from "@/src/app.setup";
import { appConfig } from "@/config";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  setupSwagger(app);

  const { PORT } = appConfig.env;
  await app.listen(PORT);
  new Logger("Bootstrap").log(
    `StressForge API on http://localhost:${PORT}/v1 (docs: /docs)`,
  );
}
bootstrap();
