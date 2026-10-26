import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { createZodDto } from "nestjs-zod";
import { CurrentUser } from "@/common/decorators";
import { PreviewThrottle } from "@/common/decorators/preview-throttle.decorator";
import { AuthUser } from "@/common/interfaces/auth-user.interface";
import { previewRequestSchema } from "@/common/contracts/phase2/api.schema";
import { PreviewService } from "@/modules/simulation/preview.service";

export class PreviewRequestDto extends createZodDto(previewRequestSchema) {}

@ApiTags("simulation")
@ApiBearerAuth()
@Controller("simulation")
export class PreviewController {
  constructor(private readonly previews: PreviewService) {}

  @Post("preview")
  @HttpCode(200)
  @PreviewThrottle()
  async preview(
    @CurrentUser() u: AuthUser,
    @Body() dto: PreviewRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // The client disconnecting (abort/supersede/navigation) cancels only this transient preview.
    // Use the RESPONSE close: the request's own close event also fires when its body has merely been read.
    const controller = new AbortController();
    const onClose = () => {
      if (!res.writableFinished) controller.abort();
    };
    res.on("close", onClose);
    // Not req.destroyed: Node auto-destroys the request stream once its body is read (M8 regression test).
    if (req.socket.destroyed || res.destroyed) controller.abort();
    try {
      return await this.previews.preview(u.id, dto, controller.signal);
    } finally {
      res.off("close", onClose);
    }
  }
}
