import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { CreateConsultationRequestDto } from "./dto/create-consultation-request.dto";
import { SubmitConsultationFeedbackDto } from "./dto/create-consultation-feedback.dto";

export interface PermanentConsultantDto {
  userId: string;
  name: string;
  email: string;
  faculty: string;
  specialty: string;
  department: string | null;
  isActive: boolean;
}

@Injectable()
export class ConsultantsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Catálogo de Consultores Permanentes (Docentes activos del Área de Odontología)
   */
  async getPermanentConsultants(): Promise<PermanentConsultantDto[]> {
    const profiles = await this.prisma.extConsultantProfile.findMany({
      where: {
        consultantType: "permanent_dentistry",
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        user: {
          name: "asc",
        },
      },
    });

    return profiles.map((p) => ({
      userId: p.userId,
      name: p.user.name,
      email: p.user.email,
      faculty: p.faculty,
      specialty: p.specialty,
      department: p.department,
      isActive: p.isActive,
    }));
  }

  /**
   * Crea una solicitud de interconsulta técnica a un docente de Odontología
   */
  async createRequest(
    requesterMemberId: string,
    dto: CreateConsultationRequestDto,
  ) {
    if (requesterMemberId === dto.consultantId) {
      throw new BadRequestException(
        "No puedes solicitar interconsulta a ti mismo",
      );
    }

    // Validar que la investigación exista
    const submission = await this.prisma.submission.findUnique({
      where: { id: dto.submissionId },
      include: {
        stratifications: true,
      },
    });
    if (!submission) {
      throw new NotFoundException("La investigación especificada no existe");
    }

    // Validar que el consultor tenga perfil permanente activo
    const consultantProfile = await this.prisma.extConsultantProfile.findUnique(
      {
        where: { userId: dto.consultantId },
      },
    );
    if (!consultantProfile || !consultantProfile.isActive) {
      throw new BadRequestException(
        "El docente seleccionado no está activo como consultor",
      );
    }

    // Comprobar si ya existe una solicitud pendiente o en progreso para el mismo consultor y submission
    const existing = await this.prisma.extConsultationRequest.findFirst({
      where: {
        submissionId: dto.submissionId,
        consultantId: dto.consultantId,
        status: { in: ["pending", "in_progress"] },
      },
    });
    if (existing) {
      throw new BadRequestException(
        "Ya existe una solicitud activa enviada a este consultor para esta investigación",
      );
    }

    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    return this.prisma.extConsultationRequest.create({
      data: {
        submissionId: dto.submissionId,
        requesterMemberId,
        consultantId: dto.consultantId,
        status: "pending",
        instructions: dto.instructions ?? null,
        dueDate,
      },
      include: {
        consultant: {
          select: { id: true, name: true, email: true },
        },
        feedbacks: true,
      },
    });
  }

  /**
   * Lista las interconsultas de una investigación (para el miembro titular del CEISH o admin)
   */
  async getRequestsForSubmission(
    submissionId: string,
    userId: string,
    role: string,
  ) {
    const isSpecial = role === "admin";
    const requests = await this.prisma.extConsultationRequest.findMany({
      where: { submissionId },
      include: {
        consultant: {
          select: {
            id: true,
            name: true,
            email: true,
            consultantProfile: true,
          },
        },
        requesterMember: {
          select: { id: true, name: true, email: true },
        },
        feedbacks: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { requestedAt: "desc" },
    });

    if (isSpecial) return requests;

    // Solo devolver si el usuario es el requester, o consultor, o miembro CEISH
    return requests.filter(
      (r) =>
        r.requesterMemberId === userId ||
        r.consultantId === userId ||
        role === "evaluator",
    );
  }

  /**
   * Lista las interconsultas asignadas al consultor autenticado
   */
  async getMyConsultations(consultantId: string) {
    return this.prisma.extConsultationRequest.findMany({
      where: { consultantId },
      include: {
        submission: {
          select: {
            id: true,
            title: true,
            researchCode: true,
            documentName: true,
            documentPath: true,
            status: true,
            submittedAt: true,
          },
        },
        requesterMember: {
          select: { id: true, name: true, email: true },
        },
        feedbacks: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { requestedAt: "desc" },
    });
  }

  /**
   * Detalle de una solicitud individual de interconsulta
   */
  async getRequestById(requestId: string, userId: string, role: string) {
    const req = await this.prisma.extConsultationRequest.findUnique({
      where: { id: requestId },
      include: {
        submission: {
          select: {
            id: true,
            title: true,
            researchCode: true,
            documentName: true,
            documentPath: true,
            status: true,
            submittedAt: true,
            documents: true,
          },
        },
        requesterMember: {
          select: { id: true, name: true, email: true },
        },
        consultant: {
          select: {
            id: true,
            name: true,
            email: true,
            consultantProfile: true,
          },
        },
        feedbacks: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!req) {
      throw new NotFoundException("Solicitud de interconsulta no encontrada");
    }

    if (
      role !== "admin" &&
      req.consultantId !== userId &&
      req.requesterMemberId !== userId &&
      role !== "evaluator"
    ) {
      throw new ForbiddenException(
        "No tienes permiso para consultar esta interconsulta",
      );
    }

    return req;
  }

  /**
   * Registra o actualiza las recomendaciones técnicas del consultor por criterio
   */
  async submitFeedback(
    requestId: string,
    consultantId: string,
    dto: SubmitConsultationFeedbackDto,
  ) {
    const request = await this.prisma.extConsultationRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException("Solicitud no encontrada");
    }

    if (request.consultantId !== consultantId) {
      throw new ForbiddenException(
        "Solo el consultor asignado puede emitir el informe técnico",
      );
    }

    if (request.status === "declined" || request.status === "expired") {
      throw new BadRequestException(
        `No es posible enviar recomendaciones en estado ${request.status}`,
      );
    }

    if (!dto.feedbacks || dto.feedbacks.length === 0) {
      throw new BadRequestException(
        "Debes incluir al menos un criterio evaluado",
      );
    }

    // Reemplaza o registra los feedbacks en transacción y marca la solicitud como completada
    return this.prisma.$transaction(async (tx) => {
      await tx.extConsultationFeedback.deleteMany({
        where: { requestId },
      });

      await tx.extConsultationFeedback.createMany({
        data: dto.feedbacks.map((f) => ({
          requestId,
          criteriaLabel: f.criteriaLabel,
          suggestedStatus: f.suggestedStatus ?? "neutral",
          technicalComments: f.technicalComments,
          isAcceptedByMember: false,
        })),
      });

      return tx.extConsultationRequest.update({
        where: { id: requestId },
        data: {
          status: "completed",
          completedAt: new Date(),
        },
        include: {
          feedbacks: true,
          consultant: {
            select: { id: true, name: true, email: true },
          },
        },
      });
    });
  }

  /**
   * Adopta en bloque las recomendaciones del consultor para la revisión del miembro titular
   */
  async acceptAllFeedback(requestId: string, _memberId: string) {
    const request = await this.prisma.extConsultationRequest.findUnique({
      where: { id: requestId },
      include: {
        feedbacks: true,
      },
    });

    if (!request) {
      throw new NotFoundException("Solicitud no encontrada");
    }

    if (request.status !== "completed") {
      throw new BadRequestException(
        "El consultor aún no ha completado el informe técnico",
      );
    }

    // Marcar todos los feedbacks como aceptados
    await this.prisma.extConsultationFeedback.updateMany({
      where: { requestId },
      data: { isAcceptedByMember: true },
    });

    return this.prisma.extConsultationRequest.findUnique({
      where: { id: requestId },
      include: {
        feedbacks: true,
        consultant: {
          select: {
            id: true,
            name: true,
            email: true,
            consultantProfile: true,
          },
        },
      },
    });
  }
}
