import {
  bindStageForms,
  requireStageForms,
} from "../extensions/dynamic-forms/dynamic-forms.workflow";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

const STAGE_TEMPLATE = [
  {
    name: "Estructura",
    criteria: [
      "El documento contiene una introducción clara",
      "Los objetivos están claramente definidos",
      "La hipótesis o pregunta de investigación está planteada",
    ],
  },
  {
    name: "Metodología",
    criteria: [
      "La metodología es apropiada para el tipo de investigación",
      "La población de estudio está correctamente definida",
      "Los instrumentos de recolección están descritos",
    ],
  },
  {
    name: "Resultados",
    criteria: [
      "Los resultados se presentan de forma clara y ordenada",
      "El análisis estadístico es correcto y justificado",
      "Las conclusiones responden a los objetivos planteados",
    ],
  },
  {
    name: "Formato",
    criteria: [
      "Las referencias bibliográficas están en formato APA",
      "El documento cumple con los criterios de extensión mínima",
    ],
  },
];

export interface SaveReviewInput {
  expectedStageId: string;
  submissionId: string;
  comment?: string;
  grade?: number;
  status?: string;
  stages?: Array<{
    id: string;
    stage_number: number;
    status: string;
    criteria?: Array<{
      id: string;
      status: string;
      comment?: string;
      pageNumber?: number;
    }>;
  }>;
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  private mapReview(rev: any) {
    if (!rev) return null;
    return {
      id: rev.id,
      submission_id: rev.submissionId,
      student_id: rev.submission.studentId,
      reviewer_id: rev.reviewerId,
      reviewer_name: rev.reviewer.name,
      comment: rev.comment,
      grade: rev.grade ? Number(rev.grade) : null,
      status: rev.status,
      created_at: rev.createdAt,
      stages: (rev.stages ?? []).map((st: any) => ({
        id: st.id,
        stage_number: st.stageNumber,
        status: st.status,
        completed_at: st.completedAt,
        criteria: (st.criteria ?? []).map((cr: any) => ({
          id: cr.id,
          criterion: cr.criterion,
          status: cr.status,
          comment: cr.comment,
          annotations: (cr.annotations ?? []).map((an: any) => ({
            id: an.id,
            page_number: an.pageNumber,
            x: Number(an.x),
            y: Number(an.y),
            width: Number(an.width),
            height: Number(an.height),
            comment: an.comment,
          })),
        })),
      })),
    };
  }

  async getReviewBySubmission(submissionId: string) {
    const rev = await this.prisma.review.findUnique({
      where: { submissionId },
      include: {
        reviewer: true,
        submission: true,
        stages: {
          orderBy: { stageNumber: "asc" },
          include: {
            criteria: {
              include: { annotations: true },
            },
          },
        },
      },
    });
    return this.mapReview(rev);
  }

  async getOrCreateReview(submissionId: string, reviewerId: string) {
    const rev = await this.getReviewBySubmission(submissionId);
    if (rev) return rev;

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM submissions WHERE id=${submissionId}::uuid FOR UPDATE`;
      const sub = await tx.submission.findUnique({
        where: { id: submissionId },
        include: { qualificationCase: true },
      });
      if (!sub) throw new NotFoundException("Investigación inexistente");
      if (
        sub.status === "reviewed" ||
        sub.classificationStatus === "cancelled" ||
        ["approved", "cancelled", "expired"].includes(
          sub.qualificationCase?.status ?? "",
        )
      )
        throw new ConflictException("Investigación cerrada");
      if (await tx.review.findUnique({ where: { submissionId } })) return;
      const createdReview = await tx.review.create({
        data: {
          submissionId,
          reviewerId,
          status: "in-progress",
        },
      });

      for (let i = 0; i < STAGE_TEMPLATE.length; i++) {
        const stageNum = i + 1;
        const stageStatus = i === 0 ? "in-progress" : "pending";
        const template = STAGE_TEMPLATE[i];

        const createdStage = await tx.reviewStage.create({
          data: {
            reviewId: createdReview.id,
            stageNumber: stageNum,
            status: stageStatus,
          },
        });

        for (const critText of template.criteria) {
          await tx.criteriaEvaluation.create({
            data: {
              stageId: createdStage.id,
              criterion: critText,
              status: "pending",
              comment: "",
            },
          });
        }
      }

      const firstStage = await tx.reviewStage.findFirstOrThrow({
        where: { reviewId: createdReview.id, stageNumber: 1 },
      });
      await bindStageForms(tx, submissionId, firstStage.id, 1);
      await tx.submission.update({
        where: { id: submissionId },
        data: { status: "submitted" },
      });
    });

    return this.getReviewBySubmission(submissionId);
  }

  async saveReview(input: SaveReviewInput) {
    if (!input || !Array.isArray(input.stages))
      throw new BadRequestException("Etapas inválidas");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM submissions WHERE id=${input.submissionId}::uuid FOR UPDATE`;
      const review = await tx.review.findUnique({
        where: { submissionId: input.submissionId },
        include: {
          submission: { include: { qualificationCase: true } },
          stages: {
            orderBy: { stageNumber: "asc" },
            include: { criteria: true },
          },
        },
      });
      if (!review) throw new NotFoundException("Revisión inexistente");
      if (
        review.status === "completed" ||
        review.submission.classificationStatus === "cancelled" ||
        ["approved", "cancelled", "expired"].includes(
          review.submission.qualificationCase?.status ?? "",
        )
      )
        throw new ConflictException("Investigación cerrada");
      const current = review.stages.find((s) => s.status === "in-progress");
      if (!current) throw new ConflictException("No hay etapa activa");
      if (input.expectedStageId !== current.id)
        throw new ConflictException(
          "La etapa cambió; recarga la revisión antes de guardar",
        );
      const patch = input.stages!.find((s) => s.id === current.id);
      if (
        !patch ||
        input.stages!.length !== review.stages.length ||
        new Set(input.stages!.map((s) => s.id)).size !== review.stages.length
      )
        throw new BadRequestException("Etapas incompletas o duplicadas");
      const advance = patch.status === "completed";
      const next = review.stages.find(
        (s) => s.stageNumber === current.stageNumber + 1,
      );
      if (
        !["in-progress", "completed"].includes(patch.status) ||
        input.status !== (advance && !next ? "completed" : "in-progress")
      )
        throw new BadRequestException("Transición inválida");
      for (const st of input.stages!) {
        const stored = review.stages.find((s) => s.id === st.id);
        const expected =
          stored?.id === current.id
            ? advance
              ? "completed"
              : "in-progress"
            : stored?.id === next?.id && advance
              ? "in-progress"
              : stored?.status;
        if (!stored || st.status !== expected)
          throw new ConflictException(
            "Las etapas cambiaron; recarga la revisión",
          );
      }
      const criteria = patch.criteria ?? [];
      if (
        criteria.length !== current.criteria.length ||
        new Set(criteria.map((c) => c.id)).size !== criteria.length
      )
        throw new BadRequestException("Criterios incompletos");
      for (const cr of criteria) {
        if (
          !current.criteria.some((c) => c.id === cr.id) ||
          !["pending", "approved", "rejected"].includes(cr.status) ||
          (cr.comment !== undefined && typeof cr.comment !== "string") ||
          (cr.pageNumber != null &&
            (!Number.isInteger(cr.pageNumber) ||
              cr.pageNumber < 1 ||
              cr.pageNumber > 32767))
        )
          throw new BadRequestException("Criterio inválido");
        if (advance && cr.status === "pending")
          throw new ConflictException(
            "Completa todos los criterios antes de avanzar",
          );
        await tx.criteriaEvaluation.update({
          where: { id: cr.id },
          data: { status: cr.status, comment: cr.comment ?? "" },
        });
        await tx.annotation.deleteMany({
          where: { criteriaEvaluationId: cr.id },
        });
        if (cr.pageNumber != null)
          await tx.annotation.create({
            data: {
              criteriaEvaluationId: cr.id,
              pageNumber: cr.pageNumber,
              x: 0,
              y: 0,
              width: 0,
              height: 0,
              comment: cr.comment ?? "",
            },
          });
      }
      if (advance) {
        await requireStageForms(tx, input.submissionId, current.stageNumber);
        await tx.reviewStage.update({
          where: { id: current.id },
          data: { status: "completed", completedAt: new Date() },
        });
        if (next) {
          await tx.reviewStage.update({
            where: { id: next.id },
            data: { status: "in-progress" },
          });
          await bindStageForms(
            tx,
            input.submissionId,
            next.id,
            next.stageNumber,
          );
        } else {
          if (
            typeof input.grade !== "number" ||
            !Number.isFinite(input.grade) ||
            input.grade < 0 ||
            input.grade > 10 ||
            typeof input.comment !== "string" ||
            !input.comment.trim()
          )
            throw new BadRequestException(
              "Calificación o comentario inválidos",
            );
          await tx.review.update({
            where: { id: review.id },
            data: {
              status: "completed",
              grade: input.grade,
              comment: input.comment,
            },
          });
          await tx.submission.update({
            where: { id: input.submissionId },
            data: {
              status: "reviewed",
              reviewedAt: new Date(),
              grade: input.grade,
              finalComment: input.comment,
            },
          });
        }
      }
      return { ok: true };
    });
  }
}
