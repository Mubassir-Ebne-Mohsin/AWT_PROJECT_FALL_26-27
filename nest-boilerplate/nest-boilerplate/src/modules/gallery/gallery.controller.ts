import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/common/decorators";
import { AuthUser } from "@/common/interfaces/auth-user.interface";
import { GalleryService } from "@/modules/gallery/gallery.service";

/** Signed-in access only (version 1 of the gallery). Posts are read-only snapshots; the owner publishes and unpublishes. */
@ApiTags("gallery")
@ApiBearerAuth()
@Controller()
export class GalleryController {
  constructor(private readonly gallery: GalleryService) {}

  @Post("designs/:id/gallery") publish(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>) {
    return this.gallery.publish(u.id, id, body);
  }
  @Get("gallery") list(@CurrentUser() u: AuthUser, @Query() query: Record<string, unknown>) {
    return this.gallery.list(u.id, query);
  }
  @Get("gallery/:id") get(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.gallery.get(u.id, id);
  }
  @Post("gallery/:id/unpublish") @HttpCode(200) unpublish(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.gallery.unpublish(u.id, id);
  }
  @Post("gallery/:id/remix") remix(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.gallery.remix(u.id, id);
  }
}
