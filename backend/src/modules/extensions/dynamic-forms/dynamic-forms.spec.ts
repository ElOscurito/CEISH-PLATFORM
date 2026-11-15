import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "../../../common/guards";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { MinioService } from "../../../common/minio/minio.service";
import { SessionUser } from "../../../common/auth/session.util";
import { DynamicFormsService } from "./dynamic-forms.service";
import { DynamicFormsController, json } from "./dynamic-forms.module";
import { answer, fields } from "./dynamic-forms.validation";

const student: SessionUser = {
  id: "owner",
  role: "student",
  exp: 0,
  sessionVersion: 0,
};
const evaluator: SessionUser = {
  ...student,
  id: "reviewer",
  role: "evaluator",
};
const textField = {
  id: "field",
  fieldType: "text",
  isRequired: true,
  options: [],
  label: "Justificación",
};
function setup() {
  const inst = {
    id: "instance",
    submissionId: "submission",
    formId: "form",
    versionId: "v1",
    cycleNumber: 1,
    status: "draft",
    form: { targetAudience: "researcher_submission", stageNumber: 0 },
    version: { fields: [textField] },
    values: [] as unknown[],
  };
  const sub = {
    id: "submission",
    studentId: "owner",
    status: "submitted",
    classificationStatus: "awaiting-first",
    review: null,
    qualificationCase: null,
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    submission: { findUnique: jest.fn().mockResolvedValue(sub) },
    assignment: { findFirst: jest.fn().mockResolvedValue(null) },
    stratificationAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
    extFormInstance: {
      findUnique: jest.fn().mockResolvedValue(inst),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ ...inst, status: "submitted" }),
      create: jest.fn().mockResolvedValue(inst),
    },
    extSubmissionFieldValue: { upsert: jest.fn(), deleteMany: jest.fn() },
    extFormDefinition: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ ...inst.form, id: "form", isActive: true }),
    },
    extFormVersion: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const prisma = {
    ...tx,
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  };
  const storage = { getPresignedUrl: jest.fn(), uploadDocument: jest.fn() };
  return {
    inst,
    sub,
    tx,
    storage,
    service: new DynamicFormsService(
      prisma as unknown as PrismaService,
      storage as unknown as MinioService,
    ),
  };
}

describe("dynamic form validation", () => {
  test("required whitespace is rejected on submit", () =>
    expect(() => answer(textField, "  ", true)).toThrow(BadRequestException));
  test("partial text allowed before submit", () =>
    expect(answer(textField, "", false)).toBe(""));
  test("mandatory consent must be true", () =>
    expect(() =>
      answer({ ...textField, fieldType: "checkbox" }, false, true),
    ).toThrow());
  test("unknown selections rejected", () =>
    expect(() =>
      answer(
        {
          ...textField,
          fieldType: "single_select",
          options: [{ value: "a", label: "A" }],
        },
        "b",
        false,
      ),
    ).toThrow());
  test("duplicate selections rejected", () =>
    expect(() =>
      answer(
        { ...textField, fieldType: "multi_select", options: [{ value: "a" }] },
        ["a", "a"],
        false,
      ),
    ).toThrow());
  test("pending criterion cannot be submitted", () =>
    expect(() =>
      answer(
        { ...textField, fieldType: "criterion" },
        { status: "pending" },
        true,
      ),
    ).toThrow());
  test("negative page rejected", () =>
    expect(() =>
      answer(
        { ...textField, fieldType: "criterion" },
        { status: "approved", pageReference: -1 },
        false,
      ),
    ).toThrow());
  test("researcher cannot receive criterion field", () =>
    expect(() =>
      fields(
        [
          {
            fieldKey: "x",
            fieldType: "criterion",
            label: "X",
            isRequired: true,
          },
        ],
        "researcher_submission",
      ),
    ).toThrow());
  test("duplicate field keys rejected", () =>
    expect(() =>
      fields(
        Array(2).fill({
          fieldKey: "x",
          fieldType: "text",
          label: "X",
          isRequired: false,
        }),
        "researcher_submission",
      ),
    ).toThrow());
  test("file metadata serializes bigint", () =>
    expect(json({ size: 15n })).toEqual({ size: 15 }));
});

describe("dynamic form access and transitions", () => {
  test("other researcher cannot read answers", async () => {
    const { service } = setup();
    await expect(
      service.get("instance", { ...student, id: "intruder" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  test("unassigned evaluator cannot read answers", async () => {
    const { service } = setup();
    await expect(service.get("instance", evaluator)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  test("admin can read but not respond", async () => {
    const { service } = setup();
    const admin = { ...student, role: "admin" as const };
    await expect(service.get("instance", admin)).resolves.toBeDefined();
    await expect(
      service.save("instance", { answers: [] }, admin),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  test("closed submission rejects write", async () => {
    const { service, sub } = setup();
    sub.status = "reviewed";
    await expect(
      service.save("instance", { answers: [] }, student),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  test("inactive stage rejects write", async () => {
    const { service, inst } = setup();
    inst.form.stageNumber = 2;
    await expect(
      service.save("instance", { answers: [] }, student),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  test("cross-version fields rejected", async () => {
    const { service, tx } = setup();
    await expect(
      service.save(
        "instance",
        { answers: [{ fieldId: "foreign", value: "x" }] },
        student,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.extSubmissionFieldValue.upsert).not.toHaveBeenCalled();
  });
  test("valid draft answer stored", async () => {
    const { service, tx } = setup();
    await service.save(
      "instance",
      { answers: [{ fieldId: "field", value: "Respuesta" }] },
      student,
    );
    expect(tx.extSubmissionFieldValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          versionId: "v1",
          fieldValue: "Respuesta",
        }),
      }),
    );
  });
  test("required answer checked before submit", async () => {
    const { service, tx } = setup();
    await expect(service.submit("instance", student)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.extFormInstance.update).not.toHaveBeenCalled();
  });
  test("valid submit finalizes instance", async () => {
    const { service, inst, tx } = setup();
    inst.values = [{ fieldId: "field", fieldValue: "Respuesta" }];
    await service.submit("instance", student);
    expect(tx.extFormInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "submitted" }),
      }),
    );
  });
  test("repeated submit returns existing record", async () => {
    const { service, inst, tx } = setup();
    inst.status = "submitted";
    await service.submit("instance", student);
    expect(tx.extFormInstance.update).not.toHaveBeenCalled();
  });
  test("submitted responses cannot change", async () => {
    const { service, inst } = setup();
    inst.status = "submitted";
    await expect(
      service.save("instance", { answers: [] }, student),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  test("correction preserves original version", async () => {
    const { service, inst, tx } = setup();
    inst.status = "submitted";
    await service.correction("instance", student);
    expect(tx.extFormInstance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ versionId: "v1", cycleNumber: 2 }),
      }),
    );
  });
  test("repeated start reuses instance", async () => {
    const { service, inst, tx } = setup();
    tx.extFormInstance.findFirst.mockResolvedValue(inst);
    await service.start("submission", "form", student);
    expect(tx.extFormInstance.create).not.toHaveBeenCalled();
  });
  test("publish retires previous version in transaction", async () => {
    const { service, tx } = setup();
    tx.extFormVersion.findFirst.mockResolvedValue({
      id: "v2",
      fields: [textField],
    });
    await service.publish("form");
    expect(tx.extFormVersion.updateMany).toHaveBeenCalledWith({
      where: { formId: "form", status: "published" },
      data: { status: "retired" },
    });
  });
  test("admin endpoints deny student role", () => {
    const guard = new RolesGuard(new Reflector());
    const context = {
      getHandler: () => DynamicFormsController.prototype.list,
      getClass: () => DynamicFormsController,
      switchToHttp: () => ({ getRequest: () => ({ user: student }) }),
    };
    expect(() => guard.canActivate(context as never)).toThrow(
      ForbiddenException,
    );
  });
});
