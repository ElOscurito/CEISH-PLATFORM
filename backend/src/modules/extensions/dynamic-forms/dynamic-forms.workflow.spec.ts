import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  bindInitialForm,
  bindStageForms,
  requireStageForms,
} from "./dynamic-forms.workflow";
import { ReviewsService } from "../../reviews/reviews.service";
import { PrismaService } from "../../../common/prisma/prisma.service";

function setup() {
  const field = {
    id: "field",
    fieldType: "text",
    label: "Justificación",
    isRequired: true,
    options: [],
  };
  const form = {
    id: "form",
    targetAudience: "researcher_submission",
    versions: [{ id: "v1", fields: [field] }],
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    extFormDefinition: {
      findFirst: jest.fn().mockResolvedValue(form),
      findMany: jest.fn().mockResolvedValue([form]),
    },
    extFormInstance: {
      create: jest.fn().mockResolvedValue({ id: "instance" }),
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    extSubmissionFieldValue: {
      create: jest.fn().mockResolvedValue({ id: "value" }),
      update: jest.fn(),
    },
    extFormResponseFile: {
      create: jest.fn().mockResolvedValue({ id: "file" }),
    },
    criteriaEvaluation: { deleteMany: jest.fn() },
  };
  return { field, form, tx, client: tx as unknown as Prisma.TransactionClient };
}
describe("workflow integration: initial submission", () => {
  test("core endpoint cannot bypass a configured form", async () => {
    const { client } = setup();
    await expect(bindInitialForm(client, "submission")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  test("missing required answers prevent intake", async () => {
    const { client, tx } = setup();
    await expect(
      bindInitialForm(client, "submission", {
        versionId: "v1",
        answers: {},
        files: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.extFormInstance.update).not.toHaveBeenCalled();
  });
  test("obsolete version rejected", async () => {
    const { client } = setup();
    await expect(
      bindInitialForm(client, "submission", {
        versionId: "old",
        answers: { field: "yes" },
        files: {},
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  test("unknown fields rejected", async () => {
    const { client } = setup();
    await expect(
      bindInitialForm(client, "submission", {
        versionId: "v1",
        answers: { field: "yes", foreign: "x" },
        files: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  test("successful intake saves answer and finalizes version", async () => {
    const { client, tx } = setup();
    await bindInitialForm(client, "submission", {
      versionId: "v1",
      answers: { field: "yes" },
      files: {},
    });
    expect(tx.extSubmissionFieldValue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fieldValue: "yes", versionId: "v1" }),
      }),
    );
    expect(tx.extFormInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "submitted" }),
      }),
    );
  });
  test("unconfigured intake keeps existing flow", async () => {
    const { client, tx } = setup();
    tx.extFormDefinition.findFirst.mockResolvedValue(null);
    await bindInitialForm(client, "submission");
    expect(tx.extFormInstance.create).not.toHaveBeenCalled();
  });
  test("initial file metadata belongs to saved field", async () => {
    const { client, field, tx } = setup();
    field.fieldType = "file";
    await bindInitialForm(client, "submission", {
      versionId: "v1",
      answers: {},
      files: {
        field: [
          {
            documentName: "a.pdf",
            documentPath: "a",
            mimeType: "application/pdf",
            sizeBytes: 100,
          },
        ],
      },
    });
    expect(tx.extFormResponseFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fieldValueId: "value",
          sizeBytes: 100n,
        }),
      }),
    );
    expect(tx.extSubmissionFieldValue.update).toHaveBeenCalledWith({
      where: { id: "value" },
      data: { fieldValue: ["file"] },
    });
  });
});
describe("workflow integration: stage versions", () => {
  test("stage start binds published version", async () => {
    const { client, tx } = setup();
    await bindStageForms(client, "submission", "stage", 2);
    expect(tx.extFormInstance.create).toHaveBeenCalledWith({
      data: { submissionId: "submission", formId: "form", versionId: "v1" },
    });
    expect(tx.criteriaEvaluation.deleteMany).not.toHaveBeenCalled();
  });
  test("configured evaluator criteria replace default criteria only on start", async () => {
    const { client, form, tx } = setup();
    form.targetAudience = "evaluator_criteria";
    await bindStageForms(client, "submission", "stage", 2);
    expect(tx.criteriaEvaluation.deleteMany).toHaveBeenCalledWith({
      where: { stageId: "stage" },
    });
  });
  test("legacy stage with no instances is not retrofitted", async () => {
    const { client, tx } = setup();
    await requireStageForms(client, "submission", 1);
    expect(tx.extFormDefinition.findMany).not.toHaveBeenCalled();
    expect(tx.extFormInstance.create).not.toHaveBeenCalled();
  });
  test("pending investigator form blocks stage completion", async () => {
    const { client, tx } = setup();
    tx.extFormInstance.findMany.mockResolvedValue([
      { formId: "form", status: "draft", cycleNumber: 1 },
    ]);
    await expect(
      requireStageForms(client, "submission", 1),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  test("submitted forms allow advancing", async () => {
    const { client, tx } = setup();
    tx.extFormInstance.findMany.mockResolvedValue([
      { formId: "form", status: "submitted", cycleNumber: 1 },
    ]);
    await expect(
      requireStageForms(client, "submission", 1),
    ).resolves.toBeUndefined();
  });
  test("new correction must be submitted even when previous cycle was sent", async () => {
    const { client, tx } = setup();
    tx.extFormInstance.findMany.mockResolvedValue([
      { formId: "form", status: "draft", cycleNumber: 2 },
      { formId: "form", status: "submitted", cycleNumber: 1 },
    ]);
    await expect(
      requireStageForms(client, "submission", 1),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

function reviewSetup() {
  const review = {
    id: "review",
    status: "in-progress",
    submission: { classificationStatus: "classified", qualificationCase: null },
    stages: [
      { id: "s1", stageNumber: 1, status: "in-progress", criteria: [] },
      { id: "s2", stageNumber: 2, status: "pending", criteria: [] },
    ],
  };
  const tx = {
    $queryRaw: jest.fn(),
    review: {
      findUnique: jest.fn().mockResolvedValue(review),
      update: jest.fn(),
    },
    reviewStage: { update: jest.fn() },
    criteriaEvaluation: { update: jest.fn() },
    annotation: { deleteMany: jest.fn() },
    extFormInstance: { findMany: jest.fn().mockResolvedValue([]) },
    extFormDefinition: { findMany: jest.fn().mockResolvedValue([]) },
    submission: { update: jest.fn() },
  };
  const prisma = {
    $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx),
  };
  const service = new ReviewsService(prisma as unknown as PrismaService);
  const input = {
    expectedStageId: "s1",
    submissionId: "submission",
    status: "in-progress",
    stages: [
      { id: "s1", stage_number: 1, status: "completed", criteria: [] },
      { id: "s2", stage_number: 2, status: "in-progress", criteria: [] },
    ],
  };
  return { review, tx, service, input };
}
describe("core review transition validation", () => {
  test("pending form blocks the actual saveReview transition", async () => {
    const { service, tx, input } = reviewSetup();
    tx.extFormInstance.findMany.mockResolvedValue([
      { formId: "f", status: "draft" },
    ]);
    await expect(service.saveReview(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.reviewStage.update).not.toHaveBeenCalled();
  });
  test("advances one stage and initializes the next forms", async () => {
    const { service, tx, input } = reviewSetup();
    await service.saveReview(input);
    expect(tx.reviewStage.update).toHaveBeenCalledTimes(2);
    expect(tx.extFormDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stageNumber: 2, isActive: true } }),
    );
  });
  test("cannot skip to completed review", async () => {
    const { service, input } = reviewSetup();
    input.status = "completed";
    await expect(service.saveReview(input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  test("cross-review stage IDs rejected", async () => {
    const { service, input } = reviewSetup();
    input.stages[1].id = "foreign";
    await expect(service.saveReview(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  test("closed review rejects mutation", async () => {
    const { service, input, review } = reviewSetup();
    review.status = "completed";
    await expect(service.saveReview(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  test("stale duplicate advance does not advance again", async () => {
    const { service, input, review } = reviewSetup();
    review.stages[0].status = "completed";
    review.stages[1].status = "in-progress";
    await expect(service.saveReview(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(review.stages[1].status).toBe("in-progress");
  });
});
