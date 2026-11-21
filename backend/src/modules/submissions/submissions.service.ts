import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomInt } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { normalizeAnnex2Schedule } from "../../common/annexes/annex2-schedule";

export interface CreateSubmissionDto {
  studentId: string;
  title: string;
  comment?: string;
  documents: Array<{
    documentName: string;
    documentPath: string;
    mimeType: string;
    sizeBytes: number;
  }>;
  annex2Schedule?: unknown;
}

export interface UpdateSubmissionDto {
  title?: string;
  comment?: string;
  documents?: Array<{
    documentName: string;
    documentPath: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}

@Injectable()
export class SubmissionsService {
  constructor(private readonly prisma: PrismaService) {}

  private mapSubmission(sub: any) {
    if (!sub) return null;
    const currentCycle = sub.qualificationCase?.cycles?.find(
      (c: any) => c.cycleNumber === sub.qualificationCase?.currentCycle,
    );
    const activeAnnex11 = sub.annexes?.find(
      (a: any) => a.annexNumber === 11 && a.status !== "voided",
    );
    const annex2 = sub.annexes?.find((a: any) => a.annexNumber === 2 && a.status === "completed");

    return {
      id: sub.id,
      student_id: sub.studentId,
      student_name: sub.student?.name ?? "",
      research_code: sub.researchCode,
      title: sub.title,
      document_name: sub.documentName,
      document_path: sub.documentPath,
      comment: sub.comment,
      status: sub.status,
      submitted_at: sub.submittedAt,
      reviewed_at: sub.reviewedAt,
      grade: sub.grade ? Number(sub.grade) : null,
      final_comment: sub.finalComment,
      classification_status: sub.classificationStatus,
      risk_level: sub.riskLevel,
      classified_at: sub.classifiedAt,
      qualification_id: sub.qualificationCase?.id ?? null,
      qualification_status: sub.qualificationCase?.status ?? null,
      qualification_cycle: sub.qualificationCase?.currentCycle ?? null,
      qualification_observations: currentCycle?.observations ?? null,
      correction_due_at: currentCycle?.correctionDueAt ?? null,
      documents: (sub.documents ?? []).map((d: any) => ({
        id: d.id,
        submission_id: d.submissionId,
        document_name: d.documentName,
        document_path: d.documentPath,
        mime_type: d.mimeType,
        size_bytes: Number(d.sizeBytes),
        uploaded_at: d.uploadedAt,
      })),
      annex_11_status: activeAnnex11?.status ?? null,
      annex_2_schedule: sub.annex2Schedule ?? { items: [] },
      annex_2_id: annex2?.id ?? null,
      annex_2_status: annex2?.status ?? "draft",
    };
  }

  async listSubmissions() {
    const list = await this.prisma.submission.findMany({
      include: {
        student: true,
        documents: { orderBy: [{ uploadedAt: "asc" }, { id: "asc" }] },
        qualificationCase: { include: { cycles: true } },
        annexes: { where: { annexNumber: { in: [2, 11] }, status: { not: "voided" } }, orderBy: { createdAt: "desc" } },
      },
      orderBy: { submittedAt: "desc" },
    });
    return list.map((s) => this.mapSubmission(s));
  }

  async listSubmissionsByStudent(studentId: string, all = false) {
    if (all) {
      const list = await this.prisma.submission.findMany({
        where: { studentId },
        include: {
          student: true,
          documents: { orderBy: [{ uploadedAt: "asc" }, { id: "asc" }] },
          qualificationCase: { include: { cycles: true } },
          annexes: { where: { annexNumber: { in: [2, 11] }, status: { not: "voided" } }, orderBy: { createdAt: "desc" } },
        },
        orderBy: { submittedAt: "desc" },
      });
      return list.map((s) => this.mapSubmission(s));
    }

    const single = await this.prisma.submission.findFirst({
      where: { studentId },
      include: {
        student: true,
        documents: { orderBy: [{ uploadedAt: "asc" }, { id: "asc" }] },
        qualificationCase: { include: { cycles: true } },
        annexes: { where: { annexNumber: { in: [2, 11] }, status: { not: "voided" } }, orderBy: { createdAt: "desc" } },
      },
      orderBy: { submittedAt: "desc" },
    });
    return this.mapSubmission(single);
  }

  async listAssignedSubmissionsForEvaluator(evaluatorId: string) {
    const assignments = await this.prisma.assignment.findMany({
      where: { teacherId: evaluatorId },
      select: { studentId: true },
    });
    const studentIds = assignments.map((a) => a.studentId);

    const list = await this.prisma.submission.findMany({
      where: { studentId: { in: studentIds } },
      include: {
        student: true,
        documents: { orderBy: [{ uploadedAt: "asc" }, { id: "asc" }] },
        qualificationCase: { include: { cycles: true } },
        annexes: { where: { annexNumber: { in: [2, 11] }, status: { not: "voided" } }, orderBy: { createdAt: "desc" } },
      },
      orderBy: { submittedAt: "desc" },
    });
    return list.map((s) => this.mapSubmission(s));
  }

  async getSubmissionById(id: string) {
    const sub = await this.prisma.submission.findUnique({
      where: { id },
      include: {
        student: true,
        documents: { orderBy: [{ uploadedAt: "asc" }, { id: "asc" }] },
        qualificationCase: { include: { cycles: true } },
        annexes: { where: { annexNumber: { in: [2, 11] }, status: { not: "voided" } }, orderBy: { createdAt: "desc" } },
      },
    });
    return this.mapSubmission(sub);
  }

  async createSubmission(input: CreateSubmissionDto) {
    const primaryDocument = input.documents[0];
    if (!primaryDocument) {
      throw new BadRequestException("Se requiere al menos un documento");
    }
    const annex2Schedule = normalizeAnnex2Schedule(input.annex2Schedule);
    if (!annex2Schedule.items.some((item) => item.type === "objective")) {
      throw new BadRequestException("Registra al menos un objetivo en el cronograma del Anexo 2");
    }

    return this.prisma
      .$transaction(async (tx) => {
        let createdSubmission: any = null;
        for (let attempt = 0; attempt < 20; attempt++) {
          const researchCode = `CEISH-${randomInt(100_000).toString().padStart(5, "0")}`;
          const exists = await tx.submission.findUnique({
            where: { researchCode },
          });
          if (!exists) {
            createdSubmission = await tx.submission.create({
              data: {
                studentId: input.studentId,
                researchCode,
                title: input.title.trim(),
                documentName: primaryDocument.documentName,
                documentPath: primaryDocument.documentPath,
                comment: input.comment ?? "",
                status: "submitted",
                classificationStatus: "awaiting-assignment",
                annex2Schedule: annex2Schedule as any,
              },
            });
            break;
          }
        }

        if (!createdSubmission) {
          throw new ConflictException(
            "No se pudo generar un código CEISH único",
          );
        }

        // Guardar todos los documentos
        for (const doc of input.documents) {
          await tx.submissionDocument.create({
            data: {
              submissionId: createdSubmission.id,
              documentName: doc.documentName,
              documentPath: doc.documentPath,
              mimeType: doc.mimeType,
              sizeBytes: BigInt(doc.sizeBytes),
            },
          });
        }

        const user = await tx.user.findUnique({
          where: { id: input.studentId },
        });

        // Preparar borrador del Anexo 11
        await tx.researchAnnex.create({
          data: {
            submissionId: createdSubmission.id,
            annexNumber: 11,
            status: "draft",
            data: {
              researchCode: createdSubmission.researchCode,
              title: createdSubmission.title,
              researcherName: user?.name ?? "",
              researcherEmail: user?.email ?? "",
              documents: input.documents.map((d) => ({
                name: d.documentName,
                sizeBytes: d.sizeBytes,
              })),
            },
            createdBy: input.studentId,
          },
        });

        // Asignar primer miembro CEISH con menor carga activa
        const members = await tx.user.findMany({
          where: {
            role: {
              name: {
                in: [
                  "teacher",
                  "evaluator",
                  "member",
                  "miembro",
                  "ceish",
                  "ceish_member",
                  "miembro_ceish",
                ],
              },
            },
          },
          include: {
            stratificationTasks: {
              include: { submission: true },
            },
          },
        });

        if (members.length > 0) {
          const loads = members.map((m) => {
            const activeCount = m.stratificationTasks.filter(
              (st) => st.submission.classificationStatus !== "classified",
            ).length;
            return { id: m.id, activeCount };
          });

          const minLoad = Math.min(...loads.map((l) => l.activeCount));
          const candidates = loads.filter((l) => l.activeCount === minLoad);
          const selected = candidates[randomInt(candidates.length)];

          await tx.stratificationAssignment.create({
            data: {
              submissionId: createdSubmission.id,
              stratifierId: selected.id,
              roundNumber: 1,
            },
          });

          await tx.submission.update({
            where: { id: createdSubmission.id },
            data: { classificationStatus: "awaiting-first" },
          });
        }

        return createdSubmission.id;
      })
      .then((id) => this.getSubmissionById(id));
  }

  async updateSubmission(id: string, dto: UpdateSubmissionDto, userId: string) {
    const current = await this.prisma.submission.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Entrega no encontrada");
    if (current.studentId !== userId)
      throw new ForbiddenException("No puedes modificar esta entrega");
    if (
      !["awaiting-assignment", "awaiting-first"].includes(
        current.classificationStatus,
      )
    ) {
      throw new ConflictException(
        "No se puede modificar una entrega cuya estratificación ya comenzó",
      );
    }

    const primaryDoc = dto.documents?.[0];

    await this.prisma.$transaction(async (tx) => {
      await tx.submission.update({
        where: { id },
        data: {
          title: dto.title?.trim() ?? undefined,
          comment: dto.comment !== undefined ? dto.comment : undefined,
          documentName: primaryDoc?.documentName ?? undefined,
          documentPath: primaryDoc?.documentPath ?? undefined,
        },
      });

      if (dto.documents && dto.documents.length > 0) {
        await tx.submissionDocument.deleteMany({ where: { submissionId: id } });
        for (const doc of dto.documents) {
          await tx.submissionDocument.create({
            data: {
              submissionId: id,
              documentName: doc.documentName,
              documentPath: doc.documentPath,
              mimeType: doc.mimeType,
              sizeBytes: BigInt(doc.sizeBytes),
            },
          });
        }
      }
    });

    return this.getSubmissionById(id);
  }

  async getAnnex2Schedule(id: string, userId: string, role: string) {
    if (!(await this.canAccessSubmission(userId, role, id))) {
      throw new ForbiddenException("No puedes consultar este cronograma");
    }
    const submission = await this.prisma.submission.findUnique({
      where: { id },
      include: { annexes: { where: { annexNumber: 2, status: "completed" }, orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!submission) throw new NotFoundException("Investigación no encontrada");
    return {
      schedule: submission.annex2Schedule,
      editable: role === "student" && !submission.annexes.length,
      annexId: submission.annexes[0]?.id ?? null,
      approvedSchedule: submission.annexes[0]?.data ?? null,
    };
  }

  async updateAnnex2Schedule(id: string, userId: string, raw: unknown) {
    const submission = await this.prisma.submission.findUnique({
      where: { id },
      include: { annexes: { where: { annexNumber: 2, status: "completed" }, take: 1 } },
    });
    if (!submission || submission.studentId !== userId) {
      throw new NotFoundException("Investigación no encontrada");
    }
    if (submission.annexes.length || submission.classificationStatus === "cancelled") {
      throw new ConflictException("El cronograma aprobado ya no puede modificarse");
    }
    const schedule = normalizeAnnex2Schedule(raw);
    await this.prisma.submission.update({ where: { id }, data: { annex2Schedule: schedule as any } });
    return { schedule, editable: true, annexId: null, approvedSchedule: null };
  }

  async deleteSubmission(id: string, userId: string) {
    const current = await this.prisma.submission.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Entrega no encontrada");
    if (current.studentId !== userId)
      throw new ForbiddenException("No puedes eliminar esta entrega");
    if (
      !["awaiting-assignment", "awaiting-first"].includes(
        current.classificationStatus,
      )
    ) {
      throw new ConflictException(
        "No se puede eliminar una entrega cuya estratificación ya comenzó",
      );
    }

    await this.prisma.submission.delete({ where: { id } });
    return { ok: true };
  }

  async getSubmissionDocument(id: string) {
    return this.prisma.submissionDocument.findUnique({ where: { id } });
  }

  async canAccessSubmission(
    userId: string,
    role: string,
    submissionId: string,
  ): Promise<boolean> {
    if (role === "admin") return true;
    const sub = await this.prisma.submission.findUnique({
      where: { id: submissionId },
    });
    if (!sub) return false;
    if (role === "student") return sub.studentId === userId;

    // Evaluator
    const hasReviewAssignment = await this.prisma.assignment.findFirst({
      where: { teacherId: userId, studentId: sub.studentId },
    });
    if (hasReviewAssignment) return true;

    const hasStratAssignment =
      await this.prisma.stratificationAssignment.findFirst({
        where: { stratifierId: userId, submissionId },
      });
    return !!hasStratAssignment;
  }
}
