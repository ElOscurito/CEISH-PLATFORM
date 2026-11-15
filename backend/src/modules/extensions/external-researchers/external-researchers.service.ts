import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { MinioService } from "../../../common/minio/minio.service";
import { hashPassword } from "../../../common/auth/session.util";
import { RegistrationRequestsService } from "../../auth/registration-requests.service";
import type {
  DossierStatus,
  RegisterExternalResearcherDto,
  VerifyDossierDto,
} from "./external-researchers.dto";

export const ENDORSEMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const PDF_SIGNATURE = Buffer.from("%PDF-");
const AFFILIATION_MAX_LENGTH = 180; // registration_requests.affiliation

type DossierRecord = {
  id: string;
  registrationRequestId: string;
  userId: string | null;
  homeInstitution: string;
  institutionCountry: string;
  positionRole: string;
  hasUleamAgreement: boolean;
  agreementCodeOrName: string | null;
  verifiedAgreementCodeOrName: string | null;
  endorsementLetterName: string;
  verificationStatus: string;
  adminNotes: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
};

type RequestSummary = {
  id: string;
  name: string;
  email: string;
  status: string;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function mapDossier(dossier: DossierRecord, request?: RequestSummary) {
  return {
    id: dossier.id,
    registration_request_id: dossier.registrationRequestId,
    user_id: dossier.userId,
    name: request?.name ?? "",
    email: request?.email ?? "",
    request_status: request?.status ?? "pending",
    home_institution: dossier.homeInstitution,
    institution_country: dossier.institutionCountry,
    position_role: dossier.positionRole,
    has_uleam_agreement: dossier.hasUleamAgreement,
    agreement_code_or_name: dossier.agreementCodeOrName,
    verified_agreement_code_or_name: dossier.verifiedAgreementCodeOrName,
    endorsement_letter_name: dossier.endorsementLetterName,
    verification_status: dossier.verificationStatus,
    admin_notes: dossier.adminNotes,
    verified_at: dossier.verifiedAt,
    created_at: dossier.createdAt,
  };
}

const dossierSelect = {
  id: true,
  registrationRequestId: true,
  userId: true,
  homeInstitution: true,
  institutionCountry: true,
  positionRole: true,
  hasUleamAgreement: true,
  agreementCodeOrName: true,
  verifiedAgreementCodeOrName: true,
  endorsementLetterName: true,
  verificationStatus: true,
  adminNotes: true,
  verifiedAt: true,
  createdAt: true,
} as const;

@Injectable()
export class ExternalResearchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
    private readonly registrationRequests: RegistrationRequestsService,
  ) {}

  async register(
    dto: RegisterExternalResearcherDto,
    file: Express.Multer.File | undefined,
  ) {
    this.assertEndorsementLetter(file);

    const email = dto.email.trim().toLowerCase();
    await this.assertEmailAvailable(email);

    const passwordHash = await hashPassword(dto.password);
    const letterPath = await this.minio.uploadDocument(
      file.buffer,
      file.originalname,
      "application/pdf",
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        const request = await tx.registrationRequest.create({
          data: {
            name: dto.name.trim(),
            email,
            passwordHash,
            researcherType: "external",
            affiliation: dto.homeInstitution.slice(0, AFFILIATION_MAX_LENGTH),
            status: "pending",
          },
        });
        await tx.extExternalResearcherDossier.create({
          data: {
            registrationRequestId: request.id,
            homeInstitution: dto.homeInstitution,
            institutionCountry: dto.institutionCountry,
            positionRole: dto.positionRole,
            hasUleamAgreement: dto.hasUleamAgreement,
            agreementCodeOrName: dto.hasUleamAgreement
              ? (dto.agreementCodeOrName ?? null)
              : null,
            endorsementLetterName: file.originalname.slice(0, 255),
            endorsementLetterPath: letterPath,
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          "Ya existe una cuenta o una solicitud con este correo",
        );
      }
      throw error;
    }

    return {
      message:
        "Solicitud enviada. El CEISH verificará tu carta de aval y podrás iniciar sesión cuando sea aprobada.",
    };
  }

  async listDossiers(status?: DossierStatus) {
    const dossiers = await this.prisma.extExternalResearcherDossier.findMany({
      where: status ? { verificationStatus: status } : undefined,
      select: dossierSelect,
      orderBy: { createdAt: "desc" },
    });
    const requests = await this.findRequests(
      dossiers.map((dossier) => dossier.registrationRequestId),
    );
    return dossiers.map((dossier) =>
      mapDossier(dossier, requests.get(dossier.registrationRequestId)),
    );
  }

  async getDossier(id: string) {
    const dossier = await this.prisma.extExternalResearcherDossier.findUnique({
      where: { id },
      select: dossierSelect,
    });
    if (!dossier) throw new NotFoundException("El expediente no existe");
    const requests = await this.findRequests([dossier.registrationRequestId]);
    return mapDossier(dossier, requests.get(dossier.registrationRequestId));
  }

  async getEndorsementLetter(id: string) {
    const dossier = await this.prisma.extExternalResearcherDossier.findUnique({
      where: { id },
      select: { endorsementLetterName: true, endorsementLetterPath: true },
    });
    if (!dossier) throw new NotFoundException("El expediente no existe");
    try {
      const stream = await this.minio.getObjectStream(
        dossier.endorsementLetterPath,
      );
      return { stream, fileName: dossier.endorsementLetterName };
    } catch {
      throw new NotFoundException(
        "La carta de aval no existe en el almacenamiento",
      );
    }
  }

  async verify(id: string, dto: VerifyDossierDto, adminId: string) {
    const dossier = await this.prisma.extExternalResearcherDossier.findUnique({
      where: { id },
    });
    if (!dossier) throw new NotFoundException("El expediente no existe");
    if (dossier.verificationStatus !== "under_review") {
      throw new ConflictException("El expediente ya fue dictaminado");
    }

    const agreement =
      dto.agreementCodeOrName || dossier.agreementCodeOrName || null;
    if (
      dto.decision === "verified_with_agreement" &&
      (!agreement || agreement.length < 2)
    ) {
      throw new BadRequestException(
        "Indica el nombre o código del convenio verificado (mínimo 2 caracteres)",
      );
    }

    const notes = dto.adminNotes?.trim();
    if (dto.decision === "rejected" && !notes) {
      throw new BadRequestException(
        "Explica el motivo del rechazo en las observaciones",
      );
    }
    if (
      dto.decision === "verified_without_agreement" &&
      dossier.hasUleamAgreement &&
      !notes
    ) {
      throw new BadRequestException(
        "El investigador declaró un convenio: explica en las observaciones por qué se aprueba sin convenio",
      );
    }

    // Reclama el expediente de forma atómica para que dos administradores no
    // dictaminen el mismo caso al mismo tiempo.
    const claimed = await this.prisma.extExternalResearcherDossier.updateMany({
      where: { id, verificationStatus: "under_review" },
      data: {
        verificationStatus: dto.decision,
        adminNotes: dto.adminNotes || null,
        // Lo declarado por el investigador no se modifica; lo verificado va aparte.
        verifiedAgreementCodeOrName:
          dto.decision === "verified_with_agreement" ? agreement : null,
        verifiedBy: adminId,
        verifiedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException("El expediente ya fue dictaminado");
    }

    try {
      // Flujo troncal: crea el usuario con rol student y su researcher_profile.
      await this.registrationRequests.reviewRequest(
        dossier.registrationRequestId,
        dto.decision === "rejected" ? "rejected" : "approved",
        adminId,
      );
    } catch (error) {
      await this.prisma.extExternalResearcherDossier.update({
        where: { id },
        data: {
          verificationStatus: "under_review",
          adminNotes: dossier.adminNotes,
          verifiedAgreementCodeOrName: null,
          verifiedBy: null,
          verifiedAt: null,
        },
      });
      throw error;
    }

    if (dto.decision !== "rejected") {
      const request = await this.prisma.registrationRequest.findUnique({
        where: { id: dossier.registrationRequestId },
        select: { email: true },
      });
      const user = request
        ? await this.prisma.user.findUnique({
            where: { email: request.email },
            select: { id: true },
          })
        : null;
      if (user) {
        await this.prisma.extExternalResearcherDossier.update({
          where: { id },
          data: { userId: user.id },
        });
      }
    }

    return this.getDossier(id);
  }

  private assertEndorsementLetter(
    file: Express.Multer.File | undefined,
  ): asserts file is Express.Multer.File {
    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException(
        "La carta de aval institucional es obligatoria",
      );
    }
    if (file.size > ENDORSEMENT_MAX_BYTES) {
      throw new PayloadTooLargeException(
        "La carta de aval supera el límite de 10 MB",
      );
    }
    const isPdf =
      file.originalname.toLowerCase().endsWith(".pdf") &&
      file.buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE);
    if (!isPdf) {
      throw new BadRequestException("La carta de aval debe ser un archivo PDF");
    }
  }

  private async assertEmailAvailable(email: string) {
    const [user, request] = await Promise.all([
      this.prisma.user.findUnique({ where: { email }, select: { id: true } }),
      this.prisma.registrationRequest.findUnique({
        where: { email },
        select: { id: true },
      }),
    ]);
    if (user || request) {
      throw new ConflictException(
        "Ya existe una cuenta o una solicitud con este correo",
      );
    }
  }

  private async findRequests(ids: string[]) {
    if (ids.length === 0) return new Map<string, RequestSummary>();
    const requests = await this.prisma.registrationRequest.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true, status: true },
    });
    return new Map(requests.map((request) => [request.id, request]));
  }
}
