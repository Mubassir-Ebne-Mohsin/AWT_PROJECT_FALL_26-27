import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Logger } from "@nestjs/common";
import { AppModule } from "@/src/app.module";
import { configureApp, setupSwagger } from "@/src/app.setup";
import { appConfig } from "@/config";
import { assertHostedConfiguration } from "@/config/hosting.config";
import { DataSource } from "typeorm";

async function bootstrap() {
  assertHostedConfiguration(appConfig.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  const swagger = setupSwagger(app);

  if (appConfig.env.HOSTED_MODE && await app.get(DataSource).showMigrations()) {
    await app.close();
    throw new Error("Pending migrations: run the dedicated migration job before starting the API");
  }
  const { PORT } = appConfig.env;
  await app.listen(PORT);
  new Logger("Bootstrap").log(
    `StressForge API listening on port ${PORT}/v1${swagger ? " (docs: /docs)" : " (public docs disabled)"}`,
  );
}
bootstrap();
