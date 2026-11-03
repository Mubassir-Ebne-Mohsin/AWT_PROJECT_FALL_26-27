import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { createZodDto } from "nestjs-zod";
import { CurrentUser } from "@/common/decorators";
import { AuthUser } from "@/common/interfaces/auth-user.interface";
import { AI_TASK_NAMES, aiDescribeRequestSchema, aiFixIntentRequestSchema, aiWhatIfRequestSchema } from "@/common/contracts/phase3/ai-tasks.schema";
import { AiDescribeService } from "@/modules/ai/ai-describe.service";
import { AiFixIntentService } from "@/modules/ai/ai-fix-intent.service";
import { AiTaskService } from "@/modules/ai/ai-task.service";
import { AiWhatIfService } from "@/modules/ai/ai-what-if.service";

export class AiDescribeRequestDto extends createZodDto(aiDescribeRequestSchema) {}
export class AiFixIntentRequestDto extends createZodDto(aiFixIntentRequestSchema) {}
export class AiWhatIfRequestDto extends createZodDto(aiWhatIfRequestSchema) {}

/** Design tasks that use a hosted model. Each call is owner-scoped, quota-limited and switched on per task. */
@ApiTags("experimental-ai")
@ApiBearerAuth()
@Controller("ai/tasks")
export class AiTasksController {
  constructor(
    private readonly tasks: AiTaskService,
    private readonly describe: AiDescribeService,
    private readonly fixIntentService: AiFixIntentService,
    private readonly whatIfService: AiWhatIfService,
  ) {}

  @Get("readiness") async readiness(@CurrentUser() user: AuthUser) {
    return { tasks: await Promise.all(AI_TASK_NAMES.map((task) => this.tasks.readiness(task, user.id))) };
  }

  @Post("describe") @HttpCode(200) async prepare(@CurrentUser() user: AuthUser, @Body() dto: AiDescribeRequestDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.cancellable(req, res, (signal) => this.describe.prepare(user.id, dto.text, signal));
  }

  @Post("fix-intent") @HttpCode(200) async fixIntent(@CurrentUser() user: AuthUser, @Body() dto: AiFixIntentRequestDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.cancellable(req, res, (signal) => this.fixIntentService.interpret(user.id, dto.goal, signal));
  }

  @Post("what-if") @HttpCode(200) async whatIf(@CurrentUser() user: AuthUser, @Body() dto: AiWhatIfRequestDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.cancellable(req, res, (signal) => this.whatIfService.interpret(user.id, dto.text, signal));
  }

  /** The person closing the page or starting over cancels only this request; its quota is settled either way. */
  private async cancellable<T>(req: Request, res: Response, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const onClose = () => {
      if (!res.writableFinished) controller.abort();
    };
    res.on("close", onClose);
    if (req.socket.destroyed || res.destroyed) controller.abort();
    try {
      return await work(controller.signal);
    } finally {
      res.off("close", onClose);
    }
  }
}
