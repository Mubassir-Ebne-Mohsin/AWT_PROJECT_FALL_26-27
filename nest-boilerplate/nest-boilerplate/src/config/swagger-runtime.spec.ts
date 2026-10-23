import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { setupSwagger } from "@/src/app.setup";

@Module({})
class SwaggerProbeModule {}

describe("Swagger dependency compatibility", () => {
  it("serves UI, OpenAPI JSON and YAML with the patched serializer", async () => {
    const app = await NestFactory.create<NestExpressApplication>(
      SwaggerProbeModule,
      { logger: false },
    );
    try {
      setupSwagger(app);
      await app.init();
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      await request(server)
        .get("/docs")
        .expect(200)
        .expect("Content-Type", /html/);
      const json = await request(server).get("/docs-json").expect(200);
      expect((json.body as { info: { title: string } }).info.title).toBe(
        "StressForge API",
      );
      const yaml = await request(server)
        .get("/docs-yaml")
        .expect(200)
        .expect("Content-Type", /yaml/);
      expect(yaml.text).toContain("openapi:");
      expect(yaml.text).toContain("title: StressForge API");
    } finally {
      await app.close();
    }
  });
});
