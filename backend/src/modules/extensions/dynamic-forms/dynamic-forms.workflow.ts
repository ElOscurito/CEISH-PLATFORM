import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { answer } from "./dynamic-forms.validation";

export interface InitialFormData {
  versionId: string | null;
  answers: Record<string, unknown>;
  files: Record<
    string,
    {
      documentName: string;
      documentPath: string;
      mimeType: string;
      sizeBytes: number;
    }[]
  >;
}
// Called inside the same transaction as submission creation. The core route also
// calls this without a payload, so a configured form cannot be bypassed.
export async function bindInitialForm(
  tx: Prisma.TransactionClient,
  submissionId: string,
  input?: InitialFormData,
) {
  await tx.$queryRaw`SELECT id FROM ext_form_definitions WHERE target_audience='researcher_submission' AND stage_number=0 FOR UPDATE`;
  const form = await tx.extFormDefinition.findFirst({
    where: {
      targetAudience: "researcher_submission",
      stageNumber: 0,
      isActive: true,
    },
    include: {
      versions: { where: { status: "published" }, include: { fields: true } },
    },
  });
  const version = form?.versions[0];
  if (!version) {
    if (input?.versionId)
      throw new ConflictException(
        "El formulario cambió. Vuelve a abrir la postulación.",
      );
    return;
  }
  if (!input || input.versionId !== version.id)
    throw new ConflictException(
      "Completa el formulario vigente de postulación. Vuelve a abrir la postulación.",
    );
  const known = new Set(version.fields.map((f) => f.id));
  if (
    [...Object.keys(input.answers), ...Object.keys(input.files)].some(
      (id) => !known.has(id),
    )
  )
    throw new BadRequestException("Campo ajeno a la versión");
  const instance = await tx.extFormInstance.create({
    data: { submissionId, formId: form!.id, versionId: version.id },
  });
  for (const field of version.fields) {
    const uploaded = input.files[field.id] ?? [];
    const value =
      field.fieldType === "file"
        ? uploaded.map((_, i) => String(i))
        : input.answers[field.id];
    answer(field, value, true);
    if (value === undefined || value === null || value === "") continue;
    const saved = await tx.extSubmissionFieldValue.create({
      data: {
        instanceId: instance.id,
        versionId: version.id,
        fieldId: field.id,
        fieldValue:
          field.fieldType === "file" ? [] : answer(field, value, true),
      },
    });
    if (field.fieldType === "file") {
      const ids: string[] = [];
      for (const file of uploaded)
        ids.push(
          (
            await tx.extFormResponseFile.create({
              data: {
                fieldValueId: saved.id,
                ...file,
                sizeBytes: BigInt(file.sizeBytes),
              },
            })
          ).id,
        );
      await tx.extSubmissionFieldValue.update({
        where: { id: saved.id },
        data: { fieldValue: ids },
      });
    }
  }
  await tx.extFormInstance.update({
    where: { id: instance.id },
    data: { status: "submitted", submittedAt: new Date() },
  });
}

// Called only when a stage starts, never on a GET or on an already active stage.
export async function bindStageForms(
  tx: Prisma.TransactionClient,
  submissionId: string,
  stageId: string,
  stageNumber: number,
) {
  await tx.$queryRaw`SELECT id FROM ext_form_definitions WHERE stage_number=${stageNumber} ORDER BY id FOR UPDATE`;
  const forms = await tx.extFormDefinition.findMany({
    where: { stageNumber, isActive: true },
    include: { versions: { where: { status: "published" } } },
  });
  for (const form of forms) {
    const version = form.versions[0];
    if (!version) continue;
    await tx.extFormInstance.create({
      data: { submissionId, formId: form.id, versionId: version.id },
    });
    // Configurable criteria replace the default template only for this new stage.
    if (form.targetAudience === "evaluator_criteria")
      await tx.criteriaEvaluation.deleteMany({ where: { stageId } });
  }
}

export async function requireStageForms(
  tx: Prisma.TransactionClient,
  submissionId: string,
  stageNumber: number,
) {
  const instances = await tx.extFormInstance.findMany({
    where: { submissionId, form: { stageNumber } },
    include: { form: true },
    orderBy: { cycleNumber: "desc" },
  });
  const latest = new Map<string, (typeof instances)[number]>();
  for (const instance of instances)
    if (!latest.has(instance.formId)) latest.set(instance.formId, instance);
  if ([...latest.values()].some((i) => i.status !== "submitted"))
    throw new ConflictException(
      "El investigador y el evaluador deben enviar los formularios de esta etapa antes de avanzar.",
    );
}
