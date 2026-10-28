import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import type { Response } from "express";
import { CurrentUser } from "@/common/decorators";
import { AuthUser } from "@/common/interfaces/auth-user.interface";
import { aiRequestSchema } from "@/common/contracts/phase3/ai.schema";
import { AiService } from "@/modules/ai/ai.service";
export class AiRequestDto extends createZodDto(aiRequestSchema) {}
@ApiTags("experimental-ai")
@ApiBearerAuth()
@Controller("ai")
export class AiController {
  constructor(private readonly ai: AiService) {}
  @Get("readiness") readiness() {
    return this.ai.readiness();
  }
  @Post("jobs") async submit(
    @CurrentUser() user: AuthUser,
    @Body() dto: AiRequestDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const accepted = await this.ai.submit(user.id, dto);
    response.status(accepted.job.status === "pending" ? 202 : 200);
    return accepted;
  }
  @Get("jobs/:id") get(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.ai.get(user.id, id);
  }
  @Get("jobs/:id/evidence") evidence(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.ai.evidence(user.id, id);
  }
  @Post("jobs/:id/cancel") @HttpCode(200) cancel(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.ai.cancel(user.id, id);
  }
}
