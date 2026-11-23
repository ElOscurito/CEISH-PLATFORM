import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Request } from "express";
import { tap } from "rxjs";
import {
  getSessionFromRequest,
  normalizeRole,
} from "../../../common/auth/session.util";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AuthController } from "../../auth/auth.controller";

@Injectable()
export class MemberActivityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(MemberActivityInterceptor.name);
  private readonly pending = new Map<string, Promise<void>>();

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== "http" || context.getClass() !== AuthController)
      return next.handle();
    const handler = context.getHandler();
    if (
      handler !== AuthController.prototype.login &&
      handler !== AuthController.prototype.logout
    ) {
      return next.handle();
    }
    const logout = handler === AuthController.prototype.logout;
    return next.handle().pipe(
      tap((response) => {
        try {
          const session = logout
            ? getSessionFromRequest(
                context.switchToHttp().getRequest<Request>(),
              )
            : null;
          const user = logout ? session : response?.user;
          if (
            typeof user?.id === "string" &&
            normalizeRole(user.role) === "evaluator"
          ) {
            this.enqueue(user.id, session?.sessionVersion ?? null, new Date());
          }
        } catch {
          this.logger.warn(
            "No se pudo preparar el registro de actividad CEISH",
          );
        }
      }),
    );
  }

  private enqueue(memberId: string, logoutVersion: number | null, at: Date) {
    const job = (this.pending.get(memberId) ?? Promise.resolve())
      .then(() => this.record(memberId, logoutVersion, at))
      .catch(() => {
        this.logger.warn("No se pudo registrar actividad CEISH");
      })
      .finally(() => {
        if (this.pending.get(memberId) === job) this.pending.delete(memberId);
      });
    this.pending.set(memberId, job);
  }

  private async record(
    memberId: string,
    logoutVersion: number | null,
    at: Date,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"ext-member-activity:" + memberId}, 0))`;
      if (logoutVersion === null) {
        await tx.$executeRaw`
          INSERT INTO ext_member_activity_logs (member_id, action_type, created_at)
          SELECT u.id, 'LOGIN', ${at}
          FROM ext_vw_member_roster u WHERE u.id = ${memberId}::uuid
        `;
        return;
      }
      await tx.$executeRaw`
        INSERT INTO ext_member_activity_logs
          (member_id, action_type, created_at, login_id, session_duration_seconds, logout_session_version)
        SELECT u.id, 'LOGOUT', ${at}, login.id,
               FLOOR(EXTRACT(EPOCH FROM (${at}::timestamptz - login.created_at)))::integer,
               ${logoutVersion}
        FROM ext_vw_member_roster u
        LEFT JOIN LATERAL (
          SELECT l.id, l.created_at FROM ext_member_activity_logs l
          WHERE l.member_id = u.id AND l.action_type = 'LOGIN' AND l.created_at <= ${at}
            AND NOT EXISTS (SELECT 1 FROM ext_member_activity_logs e WHERE e.login_id = l.id)
          ORDER BY l.created_at DESC, l.id LIMIT 1
        ) login ON TRUE
        WHERE u.id = ${memberId}::uuid
        ON CONFLICT DO NOTHING
      `;
    });
  }
}
