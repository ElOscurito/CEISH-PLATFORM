import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { MinioService } from "../../../common/minio/minio.service";
import { SessionUser } from "../../../common/auth/session.util";
import { answer, fields, object, string } from "./dynamic-forms.validation";

const detail = {
  version: {
    include: { fields: { orderBy: { displayOrder: "asc" as const } } },
  },
  form: true,
  values: { include: { files: true } },
};
type Tx = Prisma.TransactionClient;
@Injectable()
export class DynamicFormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MinioService,
  ) {}

  list() {
    return this.prisma.extFormDefinition.findMany({
      orderBy: [{ targetAudience: "asc" }, { stageNumber: "asc" }],
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          include: { fields: { orderBy: { displayOrder: "asc" } } },
        },
      },
    });
  }

  async create(input: unknown) {
    const b = object(input),
      audience = string(b.targetAudience, 30),
      stage = b.stageNumber;
    if (
      !["researcher_submission", "evaluator_criteria"].includes(audience) ||
      typeof stage !== "number" ||
      !Number.isInteger(stage) ||
      stage < 0 ||
      stage > 4 ||
      (audience === "evaluator_criteria" && stage === 0)
    )
      throw new BadRequestException("Destinatario o etapa inválidos");
    const title = string(b.title, 150);
    try {
      return await this.prisma.extFormDefinition.create({
        data: {
          targetAudience: audience,
          stageNumber: stage,
          versions: { create: { versionNumber: 1, title } },
        },
        include: { versions: true },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      )
        throw new ConflictException(
          "Ya existe un formulario para esa etapa y destinatario",
        );
      throw e;
    }
  }

  private async lockForm(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM ext_form_definitions WHERE id=${id}::uuid FOR UPDATE`;
    const form = await tx.extFormDefinition.findUnique({ where: { id } });
    if (!form) throw new NotFoundException("Formulario inexistente");
    return form;
  }

  draft(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockForm(tx, id);
      const existing = await tx.extFormVersion.findFirst({
        where: { formId: id, status: "draft" },
        include: { fields: true },
      });
      if (existing) return existing;
      const latest = await tx.extFormVersion.findFirst({
        where: { formId: id },
        orderBy: { versionNumber: "desc" },
        include: { fields: true },
      });
      if (!latest) throw new ConflictException("Falta la versión inicial");
      return tx.extFormVersion.create({
        data: {
          formId: id,
          versionNumber: latest.versionNumber + 1,
          title: latest.title,
          description: latest.description,
          fields: {
            create: latest.fields.map((f) => ({
              fieldKey: f.fieldKey,
              label: f.label,
              fieldType: f.fieldType,
              isRequired: f.isRequired,
              options: f.options ?? [],
              displayOrder: f.displayOrder,
              placeholder: f.placeholder,
              helpText: f.helpText,
            })),
          },
        },
        include: { fields: true },
      });
    });
  }

  edit(id: string, input: unknown) {
    const b = object(input),
      title = string(b.title, 150),
      description = string(b.description, 10000, true);
    return this.prisma.$transaction(async (tx) => {
      const form = await this.lockForm(tx, id);
      const normalized = fields(b.fields, form.targetAudience);
      const draft = await tx.extFormVersion.findFirst({
        where: { formId: id, status: "draft" },
      });
      if (!draft)
        throw new ConflictException("Crea un borrador antes de editar");
      await tx.extFormField.deleteMany({ where: { versionId: draft.id } });
      return tx.extFormVersion.update({
        where: { id: draft.id },
        data: { title, description, fields: { create: normalized } },
        include: { fields: { orderBy: { displayOrder: "asc" } } },
      });
    });
  }

  publish(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockForm(tx, id);
      const draft = await tx.extFormVersion.findFirst({
        where: { formId: id, status: "draft" },
        include: { fields: true },
      });
      if (!draft || !draft.fields.length)
        throw new ConflictException("Se requiere un borrador con campos");
      await tx.extFormVersion.updateMany({
        where: { formId: id, status: "published" },
        data: { status: "retired" },
      });
      return tx.extFormVersion.update({
        where: { id: draft.id },
        data: { status: "published", publishedAt: new Date() },
        include: { fields: true },
      });
    });
  }

  activate(id: string, input: unknown) {
    const b = object(input);
    if (typeof b.isActive !== "boolean")
      throw new BadRequestException("isActive debe ser booleano");
    const isActive = b.isActive;
    return this.prisma.$transaction(async (tx) => {
      await this.lockForm(tx, id);
      return tx.extFormDefinition.update({ where: { id }, data: { isActive } });
    });
  }

  private async access(
    tx: Tx,
    submissionId: string,
    user: SessionUser,
    write = false,
    stage = 0,
    audience = "researcher_submission",
  ) {
    if (write)
      await tx.$queryRaw`SELECT id FROM submissions WHERE id=${submissionId}::uuid FOR UPDATE`;
    const sub = await tx.submission.findUnique({
      where: { id: submissionId },
      include: {
        review: { include: { stages: true } },
        qualificationCase: true,
      },
    });
    if (!sub) throw new NotFoundException("Investigación inexistente");
    const owner = user.role === "student" && sub.studentId === user.id;
    const assigned =
      user.role === "evaluator" &&
      Boolean(
        await tx.assignment.findFirst({
          where: { teacherId: user.id, studentId: sub.studentId },
        }),
      );
    const otherEvaluator =
      user.role === "evaluator" &&
      (sub.qualificationCase?.qualifierId === user.id ||
        Boolean(
          await tx.stratificationAssignment.findFirst({
            where: { submissionId, stratifierId: user.id },
          }),
        ));
    if (
      !owner &&
      !assigned &&
      !otherEvaluator &&
      !(user.role === "evaluator" && sub.review?.reviewerId === user.id) &&
      user.role !== "admin"
    )
      throw new ForbiddenException("Sin acceso a esta investigación");
    if (!write) return sub;
    if (
      audience === "researcher_submission"
        ? !owner
        : !(sub.review ? sub.review.reviewerId === user.id : assigned)
    )
      throw new ForbiddenException("No puedes responder este formulario");
    if (
      sub.status === "reviewed" ||
      sub.classificationStatus === "cancelled" ||
      ["approved", "cancelled", "expired"].includes(
        sub.qualificationCase?.status ?? "",
      ) ||
      sub.review?.status === "completed"
    )
      throw new ConflictException("Investigación cerrada");
    if (stage === 0) {
      if (
        !["awaiting-assignment", "awaiting-first"].includes(
          sub.classificationStatus,
        ) ||
        (await tx.stratificationAssignment.findFirst({
          where: { submissionId, decidedAt: { not: null } },
        }))
      )
        throw new ConflictException("La postulación ya pasó a revisión");
    } else if (
      !sub.review?.stages.some(
        (s) => s.stageNumber === stage && s.status === "in-progress",
      )
    )
      throw new ConflictException("La etapa no está activa");
    return sub;
  }

  async available(submissionId: string, user: SessionUser) {
    await this.access(this.prisma, submissionId, user);
    const forms = await this.prisma.extFormDefinition.findMany({
      where: {
        isActive: true,
        ...(user.role === "student"
          ? { targetAudience: "researcher_submission" }
          : {}),
      },
      include: {
        versions: {
          where: { status: "published" },
          include: { fields: { orderBy: { displayOrder: "asc" } } },
        },
      },
    });
    return forms.filter((f) => f.versions.length);
  }

  async history(submissionId: string, user: SessionUser) {
    const sub = await this.access(this.prisma, submissionId, user);
    const instances = await this.prisma.extFormInstance.findMany({
      where: {
        submissionId,
        ...(user.role === "student"
          ? { form: { targetAudience: "researcher_submission" } }
          : {}),
      },
      include: detail,
      orderBy: [{ createdAt: "asc" }],
    });
    const closed =
      sub.status === "reviewed" ||
      sub.classificationStatus === "cancelled" ||
      sub.review?.status === "completed" ||
      ["approved", "cancelled", "expired"].includes(
        sub.qualificationCase?.status ?? "",
      );
    return instances.map((instance) => ({
      ...instance,
      canRespond:
        !closed &&
        instance.form.stageNumber > 0 &&
        Boolean(
          sub.review?.stages.some(
            (stage) =>
              stage.stageNumber === instance.form.stageNumber &&
              stage.status === "in-progress",
          ),
        ) &&
        (instance.form.targetAudience === "researcher_submission"
          ? user.role === "student" && sub.studentId === user.id
          : user.role === "evaluator" && sub.review?.reviewerId === user.id),
    }));
  }

  start(submissionId: string, formId: string, user: SessionUser) {
    return this.prisma.$transaction(async (tx) => {
      const form = await tx.extFormDefinition.findUnique({
        where: { id: formId },
      });
      if (!form) throw new NotFoundException("Formulario inexistente");
      await this.access(
        tx,
        submissionId,
        user,
        true,
        form.stageNumber,
        form.targetAudience,
      );
      const existing = await tx.extFormInstance.findFirst({
        where: { submissionId, formId },
        orderBy: { cycleNumber: "desc" },
        include: detail,
      });
      if (existing) return existing;
      throw new ConflictException(
        "Esta etapa no tiene una instancia asignada. Los formularios se fijan al iniciar la etapa.",
      );
    });
  }

  private async instance(tx: Tx, id: string, user: SessionUser, write = false) {
    const initial = await tx.extFormInstance.findUnique({
      where: { id },
      include: { form: true },
    });
    if (!initial) throw new NotFoundException("Instancia inexistente");
    await this.access(
      tx,
      initial.submissionId,
      user,
      write,
      initial.form.stageNumber,
      initial.form.targetAudience,
    );
    if (
      user.role === "student" &&
      initial.form.targetAudience !== "researcher_submission"
    )
      throw new ForbiddenException("Criterios reservados al evaluador");
    if (write)
      await tx.$queryRaw`SELECT id FROM ext_form_instances WHERE id=${id}::uuid FOR UPDATE`;
    const result = await tx.extFormInstance.findUnique({
      where: { id },
      include: detail,
    });
    if (!result) throw new NotFoundException("Instancia inexistente");
    return result;
  }

  get(id: string, user: SessionUser) {
    return this.instance(this.prisma, id, user);
  }

  save(id: string, input: unknown, user: SessionUser) {
    const b = object(input);
    if (!Array.isArray(b.answers) || b.answers.length > 100)
      throw new BadRequestException("Respuestas inválidas");
    const entries = b.answers.map((raw) => {
      const item = object(raw);
      return { fieldId: string(item.fieldId, 36), value: item.value };
    });
    if (new Set(entries.map((e) => e.fieldId)).size !== entries.length)
      throw new BadRequestException("Campo repetido");
    return this.prisma.$transaction(async (tx) => {
      const inst = await this.instance(tx, id, user, true);
      if (inst.status !== "draft")
        throw new ConflictException("El formulario ya fue enviado");
      for (const entry of entries) {
        const field = inst.version.fields.find((f) => f.id === entry.fieldId);
        if (!field) throw new BadRequestException("Campo ajeno a la versión");
        if (field.fieldType === "file")
          throw new BadRequestException("Usa el endpoint de archivos");
        if (entry.value === null) {
          await tx.extSubmissionFieldValue.deleteMany({
            where: { instanceId: id, fieldId: field.id },
          });
          continue;
        }
        const value = answer(field, entry.value, false);
        await tx.extSubmissionFieldValue.upsert({
          where: { instanceId_fieldId: { instanceId: id, fieldId: field.id } },
          create: {
            instanceId: id,
            versionId: inst.versionId,
            fieldId: field.id,
            fieldValue: value,
          },
          update: { fieldValue: value },
        });
      }
      return tx.extFormInstance.findUnique({ where: { id }, include: detail });
    });
  }

  submit(id: string, user: SessionUser) {
    return this.prisma.$transaction(async (tx) => {
      const inst = await this.instance(tx, id, user, true);
      if (inst.status === "submitted") return inst;
      for (const field of inst.version.fields) {
        const value = inst.values.find((v) => v.fieldId === field.id);
        answer(field, value?.fieldValue, true);
        if (field.fieldType === "file" && value) {
          const ids = value.fieldValue as string[];
          if (
            ids.length !== value.files.length ||
            value.files.some((f) => !ids.includes(f.id))
          )
            throw new BadRequestException("Archivo sin vincular");
        }
      }
      return tx.extFormInstance.update({
        where: { id },
        data: { status: "submitted", submittedAt: new Date() },
        include: detail,
      });
    });
  }

  correction(id: string, user: SessionUser) {
    return this.prisma.$transaction(async (tx) => {
      const inst = await this.instance(tx, id, user, true);
      if (inst.status !== "submitted")
        throw new ConflictException("Primero envía el ciclo actual");
      const next = await tx.extFormInstance.findFirst({
        where: {
          submissionId: inst.submissionId,
          formId: inst.formId,
          cycleNumber: inst.cycleNumber + 1,
        },
        include: detail,
      });
      if (next) return next;
      return tx.extFormInstance.create({
        data: {
          submissionId: inst.submissionId,
          formId: inst.formId,
          versionId: inst.versionId,
          cycleNumber: inst.cycleNumber + 1,
        },
        include: detail,
      });
    });
  }

  async upload(
    id: string,
    fieldId: string,
    file: Express.Multer.File | undefined,
    user: SessionUser,
  ) {
    const mime: Record<string, string> = {
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    const extension = file?.originalname.toLowerCase().split(".").pop() ?? "";
    if (
      !file ||
      !mime[extension] ||
      file.size < 1 ||
      file.size > 15728640 ||
      file.originalname.length > 255
    )
      throw new BadRequestException("Adjunta Word o PDF de hasta 15 MB");
    return this.prisma.$transaction(
      async (tx) => {
        const inst = await this.instance(tx, id, user, true);
        if (inst.status !== "draft")
          throw new ConflictException("Formulario enviado");
        const field = inst.version.fields.find(
          (f) => f.id === fieldId && f.fieldType === "file",
        );
        if (!field) throw new BadRequestException("Campo de archivo inválido");
        const value = await tx.extSubmissionFieldValue.upsert({
          where: { instanceId_fieldId: { instanceId: id, fieldId } },
          create: {
            instanceId: id,
            versionId: inst.versionId,
            fieldId,
            fieldValue: [],
          },
          update: {},
          include: { files: true },
        });
        if (value.files.length >= 10)
          throw new BadRequestException("Máximo 10 archivos por campo");
        const documentPath = await this.storage.uploadDocument(
          file.buffer,
          file.originalname,
          mime[extension],
        );
        const created = await tx.extFormResponseFile.create({
          data: {
            fieldValueId: value.id,
            documentName: file.originalname,
            documentPath,
            mimeType: mime[extension],
            sizeBytes: BigInt(file.size),
          },
        });
        await tx.extSubmissionFieldValue.update({
          where: { id: value.id },
          data: { fieldValue: [...value.files.map((f) => f.id), created.id] },
        });
        return created;
      },
      { timeout: 60000 },
    );
  }

  async download(fileId: string, user: SessionUser) {
    const file = await this.prisma.extFormResponseFile.findUnique({
      where: { id: fileId },
      include: { fieldValue: true },
    });
    if (!file) throw new NotFoundException("Archivo inexistente");
    await this.instance(this.prisma, file.fieldValue.instanceId, user);
    return { url: await this.storage.getPresignedUrl(file.documentPath) };
  }

  removeFile(id: string, fileId: string, user: SessionUser) {
    return this.prisma.$transaction(async (tx) => {
      const inst = await this.instance(tx, id, user, true);
      if (inst.status !== "draft")
        throw new ConflictException("Formulario enviado");
      const value = inst.values.find((v) =>
        v.files.some((f) => f.id === fileId),
      );
      if (!value) throw new NotFoundException("Archivo ajeno a la instancia");
      await tx.extFormResponseFile.delete({ where: { id: fileId } });
      await tx.extSubmissionFieldValue.update({
        where: { id: value.id },
        data: {
          fieldValue: value.files
            .filter((f) => f.id !== fileId)
            .map((f) => f.id),
        },
      });
      return { ok: true };
    });
  }
}
