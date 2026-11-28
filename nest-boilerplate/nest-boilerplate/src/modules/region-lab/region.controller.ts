import { RegionResultViewDto } from "@/modules/region-lab/results/region-result.dto";
import { RegionResults } from "@/modules/region-lab/results/region-results.service";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  Injectable,
  CanActivate,
  ExecutionContext,
  ArgumentMetadata,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiTags,
  ApiOkResponse,
  ApiProduces,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { DataSource } from "typeorm";
import { z } from "zod";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import type { AuthUser } from "@/common/interfaces/auth-user.interface";
import { AppException } from "@/common/errors";
import { RegionStore } from "@/modules/region-lab/region-store.service";
import {
  CreateRegionDto,
  PatchRegionDto,
  RunRegionDto,
  DuplicateRegionDto,
  ValidateRegionDto,
} from "@/modules/region-lab/region.dto";
@Injectable()
export class RegionSchemaGuard implements CanActivate {
  constructor(private readonly db: DataSource) {}
  async canActivate(context: ExecutionContext) {
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader("Cache-Control", "private, no-store");
    const [r] = await this.db.query(
      "SELECT to_regclass('public.region_lab_experiments') IS NOT NULL AND to_regclass('public.region_lab_versions') IS NOT NULL AND to_regclass('public.region_lab_runs') IS NOT NULL AND to_regclass('public.region_lab_requests') IS NOT NULL AND to_regclass('public.region_lab_execution_slot') IS NOT NULL AS ready",
    );
    if (!r.ready)
      throw new AppException(
        "UNAVAILABLE",
        "Region Lab requires the storage migration",
      );
    return true;
  }
}
@Injectable()
export class RegionUuidPipe extends ParseUUIDPipe {
  async transform(value: string, metadata: ArgumentMetadata) {
    return (await super.transform(value, metadata)).toLowerCase();
  }
}
@ApiTags("region-lab")
@ApiBearerAuth()
@Controller("region-lab")
@UseGuards(RegionSchemaGuard)
export class RegionController {
  constructor(
    private readonly store: RegionStore,
    private readonly results: RegionResults,
  ) {}
  @Get("experiments/:id/versions/:revision/export") async versionExport(
    @CurrentUser() u: AuthUser,
    @Param("id", RegionUuidPipe) id: string,
    @Param("revision") revision: string,
    @Query() q: Record<string, unknown>,
    @Res() res: Response,
  ) {
    this.store.query(z.strictObject({}), q);
    const record = await this.results.versionExport(u.id, id, revision);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="region-version-${id}-${record.revision}.json"`,
    );
    res.json(record);
  }
  @Get("experiments/:id/runs") runs(
    @CurrentUser() u: AuthUser,
    @Param("id", RegionUuidPipe) id: string,
    @Query() q: Record<string, unknown>,
  ) {
    return this.results.runs(u.id, id, q);
  }
  @ApiOkResponse({ type: RegionResultViewDto })
  @Get("runs/:id/results")
  resultsView(
    @CurrentUser() u: AuthUser,
    @Param("id", RegionUuidPipe) id: string,
    @Query() q: Record<string, unknown>,
  ) {
    return this.results.inspect(u.id, id, q);
  }
  @Get("runs/:id/compare") compare(
    @CurrentUser() u: AuthUser,
    @Param("id", RegionUuidPipe) id: string,
    @Query() q: Record<string, unknown>,
  ) {
    return this.results.compare(u.id, id, q);
  }
  @Get("runs/:id/export") async exportRun(
    @CurrentUser() u: AuthUser,
    @Param("id", RegionUuidPipe) id: string,
    @Query() q: Record<string, unknown>,
    @Res() res: Response,
  ) {
    this.store.query(z.strictObject({}), q);
    const data = await this.results.export(u.id, id);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="region-lab-${id}.json"`,
    );
    res.json(data);
  }
  @ApiProduces("application/pdf")
  @ApiOkResponse({ schema: { type: "string", format: "binary" } })
  @Get("runs/:id/report")
  async report(
    @CurrentUser() u: AuthUser,
    @Param("id", RegionUuidPipe) id: string,
    @Query() q: Record<string, unknown>,
    @Res() res: Response,
  ) {
    this.store.query(z.strictObject({}), q);
    const pdf = await this.results.report(u.id, id);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="region-lab-${id}.pdf"`,
    );
    res.type("application/pdf").send(pdf);
  }
  @Get("profiles") catalog(
    @CurrentUser() u: AuthUser,
    @Query() q: Record<string, unknown>,
  ) {
    return this.store.catalog(u.id, q);
  }
  @Post("validate") @HttpCode(200) validate(
    @CurrentUser() u: AuthUser,
    @Body() body: ValidateRegionDto,
  ) {
    return this.store.validate(u.id, body);
  }
  @Get("experiments") list(
    @CurrentUser() u: AuthUser,
    @Query() q: Record<string, unknown>,
  ) {
    return this.store.list(u.id, q);
  }
  @Post("experiments") create(
    @CurrentUser() u: AuthUser,
    @Body() body: CreateRegionDto,
  ) {
    return this.store.create(u.id, body);
  }
  @Get("experiments/:id") get(
    @CurrentUser() u: AuthUser,
    @Param("id", RegionUuidPipe) id: string,
  ) {
    return this.store.get(u.id, id);
  }
  @Patch("experiments/:id") patch(
    @CurrentUser() u: AuthUser,
    @Param("id", RegionUuidPipe) id: string,
    @Body() body: PatchRegionDto,
  ) {
    return this.store.patch(u.id, id, body);
  }
  @Delete("experiments/:id") @HttpCode(204) async remove(
    @CurrentUser() u: AuthUser,
    @Param("id", RegionUuidPipe) id: string,
    @Query() q: Record<string, unknown>,
  ) {
    const p = this.store.query(
      z.strictObject({ expectedRevision: z.coerce.number().int().positive() }),
      q,
    );
    await this.store.remove(u.id, id, p.expectedRevision);
  }
  @Post("experiments/:id/duplicate") duplicate(
    @CurrentUser() u: AuthUser,
    @Param("id", RegionUuidPipe) id: string,
    @Body() body: DuplicateRegionDto,
  ) {
    return this.store.duplicate(u.id, id, body);
  }
  @Get("experiments/:id/versions") versions(
    @CurrentUser() u: AuthUser,
    @Param("id", RegionUuidPipe) id: string,
    @Query() q: Record<string, unknown>,
  ) {
    return this.store.versions(u.id, id, q);
  }
  @Post("experiments/:id/runs")
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  async submit(
    @CurrentUser() u: AuthUser,
    @Param("id", RegionUuidPipe) id: string,
    @Body() body: RunRegionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const accepted = await this.store.submit(u.id, id, body);
    res.status(accepted.replayed ? 200 : 202);
    return { run: accepted.run, statusUrl: accepted.statusUrl };
  }
  @Get("runs/:id") run(
    @CurrentUser() u: AuthUser,
    @Param("id", RegionUuidPipe) id: string,
  ) {
    return this.store.getRun(u.id, id);
  }
  @Post("runs/:id/cancel") @HttpCode(200) cancel(
    @CurrentUser() u: AuthUser,
    @Param("id", RegionUuidPipe) id: string,
  ) {
    return this.store.cancel(u.id, id);
  }
}
