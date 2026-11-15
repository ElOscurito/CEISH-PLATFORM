import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DynamicFormsModule } from "./dynamic-forms.module";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { MinioModule } from "../../../common/minio/minio.module";
import { MinioService } from "../../../common/minio/minio.service";
import { AuthGuard } from "../../../common/guards";
import { SubmissionsService } from "../../submissions/submissions.service";

describe("dynamic forms HTTP integration", () => {
  let app: INestApplication;
  let base: string;
  const version = {
    id: "11111111-1111-4111-8111-111111111111",
    fields: [
      {
        id: "field",
        fieldType: "text",
        label: "Justificación",
        isRequired: true,
        options: [],
      },
    ],
  };
  const prisma = {
    extFormDefinition: {
      findFirst: jest.fn().mockResolvedValue({ versions: [version] }),
    },
  };
  const submissions = {
    createSubmission: jest.fn().mockResolvedValue({ id: "created" }),
  };
  const storage = {
    uploadDocument: jest.fn().mockResolvedValue("documents/object.pdf"),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, MinioModule, DynamicFormsModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(MinioService)
      .useValue(storage)
      .overrideProvider(SubmissionsService)
      .useValue(submissions)
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { user: unknown } };
        }) => {
          context.switchToHttp().getRequest().user = {
            id: "owner",
            role: "student",
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    submissions.createSubmission.mockClear();
    storage.uploadDocument.mockClear();
  });
  test("module resolves all dependencies and exposes intake configuration", async () => {
    const response = await fetch(base + "/api/extensions/submission-intake");
    expect(response.status).toBe(200);
    expect(((await response.json()) as { id: string }).id).toBe(version.id);
  });
  test("real role guard rejects student from admin endpoints", async () => {
    expect((await fetch(base + "/api/extensions/admin/forms")).status).toBe(
      403,
    );
  });
  test("missing required answers rejected before any storage upload", async () => {
    const form = new FormData();
    form.append(
      "payload",
      JSON.stringify({ title: "Test", versionId: version.id, answers: {} }),
    );
    form.append(
      "documents",
      new Blob(["%PDF-test"], { type: "application/pdf" }),
      "test.pdf",
    );
    const response = await fetch(base + "/api/extensions/submission-intake", {
      method: "POST",
      body: form,
    });
    expect(response.status).toBe(400);
    expect(storage.uploadDocument).not.toHaveBeenCalled();
    expect(submissions.createSubmission).not.toHaveBeenCalled();
  });
  test("multipart intake passes authenticated owner and validated answers", async () => {
    const form = new FormData();
    form.append(
      "payload",
      JSON.stringify({
        title: "Test",
        versionId: version.id,
        answers: { field: "Justificación" },
        studentId: "intruder",
      }),
    );
    form.append(
      "documents",
      new Blob(["%PDF-test"], { type: "application/pdf" }),
      "test.pdf",
    );
    const response = await fetch(base + "/api/extensions/submission-intake", {
      method: "POST",
      body: form,
    });
    expect(response.status).toBe(201);
    expect(submissions.createSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: "owner" }),
      expect.objectContaining({
        versionId: version.id,
        answers: { field: "Justificación" },
      }),
    );
  });
  test("unsupported files rejected before storage", async () => {
    const form = new FormData();
    form.append(
      "payload",
      JSON.stringify({
        title: "Test",
        versionId: version.id,
        answers: { field: "yes" },
      }),
    );
    form.append("documents", new Blob(["exe"]), "bad.exe");
    expect(
      (
        await fetch(base + "/api/extensions/submission-intake", {
          method: "POST",
          body: form,
        })
      ).status,
    ).toBe(400);
    expect(storage.uploadDocument).not.toHaveBeenCalled();
  });
});
