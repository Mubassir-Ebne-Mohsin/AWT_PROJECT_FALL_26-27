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
} from "@nestjs/common";
import type { Response } from "express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/common/decorators";
import { AuthUser } from "@/common/interfaces/auth-user.interface";
import { DesignsService } from "@/modules/designs/designs.service";
import { RunsService } from "@/modules/designs/runs.service";
import {
  CreateDesignDto,
  PrepareDesignDto,
  PatchDesignDto,
  RunRequestDto,
  ValidateDesignDto,
} from "@/modules/designs/designs.dto";
import { SimulationService } from "@/modules/simulation/simulation.service";
import {
  getCatalog,
  getTemplates,
} from "@/modules/simulation/engine/templates";
import { prepareDesign } from "@/modules/designs/creation";
@ApiTags("designs")
@ApiBearerAuth()
@Controller("designs")
export class DesignsController {
  constructor(
    private readonly designs: DesignsService,
    private readonly runs: RunsService,
    private readonly simulation: SimulationService,
  ) {}
  @Post("prepare")
  @HttpCode(200)
  prepare(@Body() dto: PrepareDesignDto) {
    return prepareDesign(dto.input);
  }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateDesignDto) {
    return this.designs.create(u.id, dto);
  }
  @Get() list(@CurrentUser() u: AuthUser, @Query() q: Record<string, unknown>) {
    return this.designs.list(u.id, q);
  }
  @Get(":id") get(
    @CurrentUser() u: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.designs.get(u.id, id);
  }
  @Patch(":id") patch(
    @CurrentUser() u: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: PatchDesignDto,
  ) {
    return this.designs.patch(u.id, id, dto);
  }
  @Delete(":id")
  @HttpCode(204)
  async remove(
    @CurrentUser() u: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.designs.remove(u.id, id);
    this.runs.cancelDesign(id);
  }
  @Post(":id/validate")
  @HttpCode(200)
  async validate(
    @CurrentUser() u: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ValidateDesignDto,
  ) {
    const d = await this.designs.owned(u.id, id);
    this.designs.revision(d, dto.expectedRevision);
    return this.simulation.validate({
      schemaVersion: d.schemaVersion,
      graph: d.graph,
      traffic: d.traffic,
    });
  }
  @Post(":id/simulate")
  async simulate(
    @CurrentUser() u: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RunRequestDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const accepted = await this.runs.submit(u.id, id, "simulation", dto);
    res.status(accepted.run.status === "pending" ? 202 : 200);
    return accepted;
  }
  @Get(":id/runs/:runId")
  run(
    @CurrentUser() u: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("runId", ParseUUIDPipe) runId: string,
  ) {
    return this.runs.get(u.id, id, runId);
  }
}
@ApiTags("simulation")
@ApiBearerAuth()
@Controller()
export class DesignCatalogController {
  constructor(private readonly designs: DesignsService) {}
  @Get("templates") templates() {
    return getTemplates();
  }
  @Get("simulation/catalog") catalog() {
    return getCatalog();
  }
  @Get("dashboard") dashboard(@CurrentUser() u: AuthUser) {
    return this.designs.dashboard(u.id);
  }
}
