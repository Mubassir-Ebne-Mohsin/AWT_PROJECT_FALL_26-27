import { Module } from "@nestjs/common";
import { DesignsModule } from "@/modules/designs/designs.module";
import { GalleryController } from "@/modules/gallery/gallery.controller";
import { GalleryService } from "@/modules/gallery/gallery.service";

@Module({
  imports: [DesignsModule],
  providers: [GalleryService],
  controllers: [GalleryController],
})
export class GalleryModule {}
