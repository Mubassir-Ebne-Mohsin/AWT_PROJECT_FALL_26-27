import { SwaggerModule } from "@nestjs/swagger";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { appConfig } from "@/config";
import { setupSwagger } from "@/src/app.setup";

describe("production API documentation boundary", () => {
  afterEach(() => jest.restoreAllMocks());
  it("does not create or publish Swagger in production", () => {
    jest.replaceProperty(appConfig.env, "IS_PRODUCTION", true);
    const create = jest.spyOn(SwaggerModule, "createDocument").mockImplementation(() => {
      throw new Error("Production must not introspect or publish the API");
    });
    const mount = jest.spyOn(SwaggerModule, "setup");
    expect(setupSwagger({} as NestExpressApplication)).toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect(mount).not.toHaveBeenCalled();
  });
});
