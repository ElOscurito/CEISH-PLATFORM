import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Roles } from "../../../common/decorators";
import { AuthGuard, RolesGuard } from "../../../common/guards";
import { FilterDto, PeriodDto, ThresholdDto } from "./performance.dto";
import { PerformanceService } from "./performance.service";

function csvCell(value: string | number | null) {
  const text = String(value ?? "");
  // Spreadsheet applications can interpret member names as formulas.
  const safe =
    typeof value === "string" && /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/u.test(text)
      ? "'" + text
      : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}

@Controller("extensions/admin/performance")
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class PerformanceController {
  constructor(private readonly service: PerformanceService) {}

  @Get("summary")
  summary(@Query() filter: FilterDto) {
    return this.service.summary(filter);
  }

  @Get("members/:id")
  detail(@Param("id", ParseUUIDPipe) id: string, @Query() period: PeriodDto) {
    return this.service.detail(id, period);
  }

  @Get("thresholds")
  thresholds() {
    return this.service.thresholds();
  }

  @Put("thresholds")
  updateThreshold(@Body() input: ThresholdDto) {
    return this.service.updateThreshold(input);
  }

  @Get("export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="desempeno-ceish.csv"')
  async export(@Query() filter: FilterDto) {
    const { rows } = await this.service.summary(filter);
    const labels = { green: "Verde", yellow: "Amarillo", red: "Rojo" };
    const records = [
      [
        "Miembro",
        "Semáforo",
        "% a tiempo",
        "Días de demora",
        "Días de revisión",
        "Abiertos en amarillo",
        "Abiertos en rojo",
        "Inicios de sesión",
        "Sesiones cerradas",
        "Último acceso (ISO)",
        "Días de subsanación",
      ],
      ...rows.map(({ member, metrics: m }) => [
        member.name,
        m.color ? labels[m.color] : null,
        m.onTimePercent,
        m.averageDelayDays,
        m.averageReviewDays,
        m.openWarning,
        m.openCritical,
        m.loginCount,
        m.completedSessions,
        m.lastLogin?.toISOString() ?? null,
        m.averageCorrectionDays,
      ]),
    ];
    return (
      "\uFEFF" +
      records.map((row) => row.map(csvCell).join(";")).join("\r\n") +
      "\r\n"
    );
  }
}
