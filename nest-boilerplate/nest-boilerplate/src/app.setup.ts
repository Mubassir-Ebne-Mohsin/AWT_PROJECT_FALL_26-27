import { documentDesigns } from "@/modules/designs/openapi";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { cleanupOpenApiDoc } from "nestjs-zod";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { appConfig } from "@/config";

const { env } = appConfig;

/** Everything that must be identical in production and in e2e tests. */
export function configureApp(app: NestExpressApplication) {
  app.set("trust proxy", env.TRUST_PROXY_HOPS);
  app.setGlobalPrefix("v1");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Swagger UI needs inline scripts/styles to render.
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "validator.swagger.io"],
          connectSrc: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: env.CORS_ORIGIN_LIST,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    maxAge: 86400,
  });
  app.enableShutdownHooks();
}

/** Swagger UI at /docs, raw OpenAPI JSON at /docs-json (the frontend generates types from it). */
export function setupSwagger(app: NestExpressApplication) {
  const config = new DocumentBuilder()
    .setTitle("StressForge API")
    .setDescription("Architecture stress-testing platform.")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
  documentDesigns(document);
  SwaggerModule.setup("docs", app, document, { jsonDocumentUrl: "docs-json" });
}
