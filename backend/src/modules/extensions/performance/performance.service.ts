import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { normalizeRole } from "../../../common/auth/session.util";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { businessDays, trafficLight } from "./business-days";
import {
  FilterDto,
  PeriodDto,
  ProcessType,
  ThresholdDto,
} from "./performance.dto";

type Color = ReturnType<typeof trafficLight>;
interface Member {
  id: string;
  name: string;
  role: string;
}
interface ReviewTime {
  id: string;
  member_id: string;
  submission_id: string;
  title: string;
  process_type: ProcessType;
  sequence: number;
  started_at: Date;
  decided_at: Date | null;
}
export interface Activity {
  id: string;
  member_id: string;
  action_type: "LOGIN" | "LOGOUT";
  created_at: Date;
  session_duration_seconds: number | null;
}

function inPeriod(column: Prisma.Sql, { from, to }: PeriodDto) {
  const date = Prisma.sql`(${column} AT TIME ZONE 'America/Guayaquil')::date`;
  return Prisma.sql`
    ${from ? Prisma.sql`AND ${date} >= ${from}::date` : Prisma.empty}
    ${to ? Prisma.sql`AND ${date} <= ${to}::date` : Prisma.empty}
  `;
}

function average(values: number[]) {
  return values.length
    ? Math.round(
        (10 * values.reduce((sum, value) => sum + value, 0)) / values.length,
      ) / 10
    : null;
}

@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  thresholds() {
    return this.prisma.$queryRaw<ThresholdDto[]>`
      SELECT process_type, warning_days, critical_days
      FROM ext_performance_thresholds ORDER BY process_type
    `;
  }

  async updateThreshold(input: ThresholdDto) {
    const { process_type, warning_days, critical_days } = input;
    if (warning_days >= critical_days) {
      throw new BadRequestException(
        "El umbral amarillo debe ser menor que el rojo",
      );
    }
    const [threshold] = await this.prisma.$queryRaw<ThresholdDto[]>`
      INSERT INTO ext_performance_thresholds (process_type, warning_days, critical_days)
      VALUES (${process_type}, ${warning_days}, ${critical_days})
      ON CONFLICT (process_type) DO UPDATE SET warning_days = EXCLUDED.warning_days,
        critical_days = EXCLUDED.critical_days, updated_at = NOW()
      RETURNING process_type, warning_days, critical_days
    `;
    return threshold;
  }

  // Each source exposes the same review timing contract. Future processes can
  // contribute another source after defining their own membership and limits.
  private async report({ memberId, ...period }: FilterDto) {
    if (period.from && period.to && period.from > period.to) {
      throw new BadRequestException(
        "La fecha inicial debe ser anterior o igual a la final",
      );
    }
    const roster = await this.prisma.$queryRaw<Member[]>`
      SELECT id, name, role FROM ext_vw_member_roster ORDER BY name, id
    `;
    const members = roster
      .filter((u) => normalizeRole(u.role) === "evaluator")
      .map(({ id, name }) => ({ id, name }));
    const selected = members.filter(
      (member) => !memberId || member.id === memberId.toLowerCase(),
    );
    if (!selected.length) return { members, rows: [] };
    const ids = Prisma.join(selected.map(({ id }) => Prisma.sql`${id}::uuid`));
    const [times, events, thresholds] = await Promise.all([
      this.prisma.$queryRaw<ReviewTime[]>`
        SELECT t.*, s.title
        FROM (
          SELECT * FROM ext_vw_member_review_times
          UNION ALL
          SELECT * FROM ext_vw_member_correction_times
        ) t JOIN submissions s ON s.id = t.submission_id
        WHERE t.member_id IN (${ids})
          AND (t.decided_at IS NULL OR (TRUE ${inPeriod(Prisma.sql`t.decided_at`, period)}))
        ORDER BY t.started_at DESC, t.id
      `,
      this.prisma.$queryRaw<Activity[]>`
        SELECT e.id, e.member_id, e.action_type, e.created_at,
               COALESCE(e.session_duration_seconds, logout.session_duration_seconds) AS session_duration_seconds
        FROM ext_member_activity_logs e
        LEFT JOIN ext_member_activity_logs logout ON logout.login_id = e.id
        WHERE e.member_id IN (${ids}) ${inPeriod(Prisma.sql`e.created_at`, period)}
        ORDER BY e.created_at DESC, e.id
      `,
      this.thresholds(),
    ]);
    const limits = new Map(
      thresholds.map((threshold) => [threshold.process_type, threshold]),
    );
    const today = new Date();
    const rows = selected.map((member) => {
      const cases = times
        .filter((time) => time.member_id === member.id)
        .map((time) => {
          const threshold = limits.get(time.process_type)!;
          const days = businessDays(time.started_at, time.decided_at ?? today);
          return {
            ...time,
            days,
            color: trafficLight(days, threshold),
            overdueDays: Math.max(0, days - threshold.critical_days),
          };
        });
      const activity = events.filter((event) => event.member_id === member.id);
      const closed = cases.filter((item) => item.decided_at);
      const open = cases.filter((item) => !item.decided_at);
      const logins = activity.filter((event) => event.action_type === "LOGIN");
      const color: Color | null = cases.some((item) => item.color === "red")
        ? "red"
        : cases.some((item) => item.color === "yellow")
          ? "yellow"
          : cases.length
            ? "green"
            : null;
      return {
        member,
        cases,
        activity,
        metrics: {
          color,
          onTimePercent: average(
            closed.map((item) => (item.color === "green" ? 100 : 0)),
          ),
          averageDelayDays: average(closed.map((item) => item.overdueDays)),
          averageReviewDays: average(
            closed
              .filter((item) => item.process_type !== "correction_review")
              .map((item) => item.days),
          ),
          openWarning: open.filter((item) => item.color === "yellow").length,
          openCritical: open.filter((item) => item.color === "red").length,
          loginCount: logins.length,
          completedSessions: logins.filter(
            (event) => event.session_duration_seconds !== null,
          ).length,
          lastLogin: logins[0]?.created_at ?? null,
          averageCorrectionDays: average(
            closed
              .filter((item) => item.process_type === "correction_review")
              .map((item) => item.days),
          ),
        },
      };
    });
    return { members, rows };
  }

  async summary(filter: FilterDto) {
    const { members, rows } = await this.report(filter);
    return {
      members,
      rows: rows.map(({ member, metrics }) => ({ member, metrics })),
    };
  }

  async detail(memberId: string, period: PeriodDto) {
    const { rows } = await this.report({ ...period, memberId });
    if (!rows.length)
      throw new NotFoundException("Miembro CEISH no encontrado");
    return rows[0];
  }
}
