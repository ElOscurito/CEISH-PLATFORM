import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AddressInfo } from "node:net";
import type { Response } from "express";
import {
  COOKIE_NAME,
  setSessionCookie,
} from "../../../common/auth/session.util";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { PerformanceController } from "./performance.controller";
import { PerformanceService } from "./performance.service";

const id = "f9932ba1-0874-42b6-b3a3-a9250e5d6589";
const member = { id, name: "=Nombre; Comité", role: "teacher" };
const threshold = {
  process_type: "stratification",
  warning_days: 5,
  critical_days: 10,
};
const detailPath = "/members/" + id;

describe("Performance API", () => {
  let app: INestApplication;
  let baseUrl: string;
  const prisma = { user: { findUnique: jest.fn() }, $queryRaw: jest.fn() };

  function request(
    path: string,
    role?: "admin" | "evaluator",
    method = "GET",
    body?: unknown,
  ) {
    const headers: Record<string, string> = {};
    if (role) {
      const response = {
        cookie: (_name: string, token: string) => {
          headers.Cookie = COOKIE_NAME + "=" + encodeURIComponent(token);
        },
      } as unknown as Response;
      setSessionCookie(response, { id, role, sessionVersion: 0 });
      prisma.user.findUnique.mockResolvedValue({
        id,
        role: { name: role },
        authSessionVersion: 0,
      });
    }
    if (body !== undefined) headers["Content-Type"] = "application/json";
    return fetch(baseUrl + path, {
      method,
      headers,
      body: JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PerformanceController],
      providers: [
        PerformanceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.listen(0, "127.0.0.1");
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = "http://127.0.0.1:" + port + "/api/extensions/admin/performance";
  });

  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => jest.resetAllMocks());

  it.each([
    ["/summary", "GET"],
    [detailPath, "GET"],
    ["/thresholds", "GET"],
    ["/thresholds", "PUT"],
    ["/export", "GET"],
  ])("protects %s (%s)", async (path, method) => {
    expect((await request(path, undefined, method)).status).toBe(401);
    expect((await request(path, "evaluator", method)).status).toBe(403);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("returns summary metrics and open cases past the deadline", async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([member])
      .mockResolvedValueOnce([
        {
          member_id: id,
          process_type: "stratification",
          started_at: new Date("2024-01-05T13:00:00Z"),
          decided_at: new Date("2024-01-08T13:00:00Z"),
        },
        {
          member_id: id,
          process_type: "stratification",
          started_at: new Date("2024-01-05T13:00:00Z"),
          decided_at: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([threshold]);
    const result = await request(
      "/summary?from=2024-01-01&to=2024-01-31",
      "admin",
    );
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      rows: [
        {
          metrics: {
            openCritical: 1,
            color: "red",
            onTimePercent: 100,
            averageReviewDays: 1,
            loginCount: 0,
          },
        },
      ],
    });
  });

  it("returns an empty summary", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);
    const result = await request("/summary", "admin");
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ members: [], rows: [] });
  });

  it("returns detail with empty reviews and an open login", async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([member])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          member_id: id,
          action_type: "LOGIN",
          session_duration_seconds: null,
          created_at: new Date("2026-11-23T14:00:00Z"),
        },
      ])
      .mockResolvedValueOnce([threshold]);
    const result = await request(detailPath, "admin");
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      cases: [],
      activity: [{ session_duration_seconds: null }],
      metrics: { loginCount: 1, completedSessions: 0 },
    });
  });

  it("returns 404 for a missing member", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);
    expect((await request(detailPath, "admin")).status).toBe(404);
  });

  it.each([
    [[], 0],
    [[threshold], 1],
  ])("lists thresholds %j", async (data, size) => {
    prisma.$queryRaw.mockResolvedValueOnce(data);
    const result = await request("/thresholds", "admin");
    expect(result.status).toBe(200);
    expect(await result.json()).toHaveLength(size);
  });

  it("upserts thresholds and rejects invalid or missing inputs", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([threshold]);
    const result = await request("/thresholds", "admin", "PUT", threshold);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual(threshold);
    for (const invalid of [
      {},
      { ...threshold, warning_days: 10 },
      { ...threshold, critical_days: -1 },
    ]) {
      expect(
        (await request("/thresholds", "admin", "PUT", invalid)).status,
      ).toBe(400);
    }
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("exports a spreadsheet-safe CSV with BOM, including when empty", async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([member])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([threshold])
      .mockResolvedValueOnce([]);
    const result = await request("/export", "admin");
    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toMatch(/text\/csv/);
    expect(result.headers.get("content-disposition")).toContain("attachment");
    const bytes = Buffer.from(await result.arrayBuffer());
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.toString("utf8")).toContain('"\'=Nombre; Comité";');
    const empty = await request("/export", "admin");
    expect(empty.status).toBe(200);
    expect((await empty.text()).trim().split("\r\n")).toHaveLength(1);
  });
});
