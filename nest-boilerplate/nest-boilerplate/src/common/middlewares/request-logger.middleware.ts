import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

/**
 * Logs method, path, status and duration only. Query strings, headers, cookies
 * and bodies are deliberately never logged (they can carry tokens/passwords).
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger("HTTP");

  use(req: Request, res: Response, next: NextFunction) {
    const started = Date.now();
    const path = req.originalUrl.split("?")[0];
    res.on("finish", () => {
      this.logger.log(
        `${req.method} ${path} ${res.statusCode} ${Date.now() - started}ms`,
      );
    });
    next();
  }
}
