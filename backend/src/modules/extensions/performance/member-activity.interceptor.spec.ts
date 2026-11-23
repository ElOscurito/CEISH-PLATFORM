import type { ExecutionContext } from "@nestjs/common";
import type { Response } from "express";
import { firstValueFrom, of, throwError } from "rxjs";
import {
  COOKIE_NAME,
  setSessionCookie,
} from "../../../common/auth/session.util";
import type { PrismaService } from "../../../common/prisma/prisma.service";
import { AuthController } from "../../auth/auth.controller";
import { MemberActivityInterceptor } from "./member-activity.interceptor";

describe("Member access auditing", () => {
  const memberId = "f9932ba1-0874-42b6-b3a3-a9250e5d6589";

  function context(action: "login" | "logout") {
    let cookie = "";
    if (action === "logout") {
      setSessionCookie(
        {
          cookie: (_name: string, token: string) => {
            cookie = token;
          },
        } as Response,
        { id: memberId, role: "teacher", sessionVersion: 7 },
      );
    }
    return {
      getType: () => "http",
      getClass: () => AuthController,
      getHandler: () => AuthController.prototype[action],
      switchToHttp: () => ({
        getRequest: () => ({ cookies: { [COOKIE_NAME]: cookie } }),
      }),
    } as unknown as ExecutionContext;
  }

  it("returns both responses while serializing same-member writes", async () => {
    const statements: string[] = [];
    const tx = {
      $executeRaw: jest.fn(async (parts: TemplateStringsArray) => {
        statements.push(parts.join("?"));
        return 1;
      }),
    };
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transaction = jest
      .fn()
      .mockImplementationOnce(async (work) => {
        await gate;
        return work(tx);
      })
      .mockImplementation(async (work) => work(tx));
    const interceptor = new MemberActivityInterceptor({
      $transaction: transaction,
    } as unknown as PrismaService);

    const login = { user: { id: memberId, role: "evaluator" } };
    await expect(
      firstValueFrom(
        interceptor.intercept(context("login"), { handle: () => of(login) }),
      ),
    ).resolves.toEqual(login);
    await expect(
      firstValueFrom(
        interceptor.intercept(context("logout"), {
          handle: () => of({ ok: true }),
        }),
      ),
    ).resolves.toEqual({ ok: true });
    expect(transaction).toHaveBeenCalledTimes(1);

    release();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(statements[0]).toContain("pg_advisory_xact_lock");
    expect(statements[1]).toContain("'LOGIN'");
    expect(statements[3]).toContain("'LOGOUT'");
    expect(statements[3]).toContain("ON CONFLICT DO NOTHING");
    expect(tx.$executeRaw.mock.calls[3]).toBeDefined();
  });

  it("leaves failed requests and other roles out of the audit", async () => {
    const transaction = jest.fn();
    const interceptor = new MemberActivityInterceptor({
      $transaction: transaction,
    } as unknown as PrismaService);
    const error = new Error("Rejected login");
    await expect(
      firstValueFrom(
        interceptor.intercept(context("login"), {
          handle: () => throwError(() => error),
        }),
      ),
    ).rejects.toBe(error);
    const response = { user: { id: memberId, role: "student" } };
    await expect(
      firstValueFrom(
        interceptor.intercept(context("login"), { handle: () => of(response) }),
      ),
    ).resolves.toEqual(response);
    expect(transaction).not.toHaveBeenCalled();
  });
});
