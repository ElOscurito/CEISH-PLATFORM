import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { AuthGuard, RolesGuard } from "../../../common/guards";
import { CurrentUser, Roles } from "../../../common/decorators";
import { SessionUser } from "../../../common/auth/session.util";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { MinioService } from "../../../common/minio/minio.service";
import { SubmissionsService } from "../../submissions/submissions.service";
import { answer, object, string } from "./dynamic-forms.validation";
import { InitialFormData } from "./dynamic-forms.workflow";

@Controller("extensions/submission-intake")
@UseGuards(AuthGuard, RolesGuard)
@Roles("student")
export class DynamicSubmissionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MinioService,
    private readonly submissions: SubmissionsService,
  ) {}
  @Get() async configuration() {
    const form = await this.prisma.extFormDefinition.findFirst({
      where: {
        targetAudience: "researcher_submission",
        stageNumber: 0,
        isActive: true,
      },
      include: {
        versions: {
          where: { status: "published" },
          include: { fields: { orderBy: { displayOrder: "asc" } } },
        },
      },
    });
    return form?.versions[0] ?? null;
  }
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "documents", maxCount: 10 },
        { name: "attachments", maxCount: 100 },
      ],
      {
        limits: {
          fileSize: 15728640,
          files: 110,
          fieldSize: 1048576,
          fields: 1,
        },
      },
    ),
  )
  async create(
    @Body("payload") payload: string,
    @UploadedFiles()
    files: {
      documents?: Express.Multer.File[];
      attachments?: Express.Multer.File[];
    },
    @CurrentUser() user: SessionUser,
  ) {
    let b: Record<string, unknown>;
    try {
      b = object(JSON.parse(payload));
    } catch {
      throw new BadRequestException("Datos de postulación inválidos");
    }
    const title = string(b.title, 300),
      comment = string(b.comment, 20000, true);
    const answers = object(b.answers ?? {});
    const mapping = b.attachmentFields ?? [];
    const documents = files?.documents ?? [],
      attachments = files?.attachments ?? [];
    if (
      !documents.length ||
      !Array.isArray(mapping) ||
      mapping.length !== attachments.length ||
      mapping.some((id) => typeof id !== "string")
    )
      throw new BadRequestException("Documentos o adjuntos inválidos");
    const mime: Record<string, string> = {
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    for (const file of [...documents, ...attachments])
      if (
        !mime[file.originalname.toLowerCase().split(".").pop() ?? ""] ||
        file.size < 1 ||
        file.size > 15728640 ||
        file.originalname.length > 255
      )
        throw new BadRequestException("Solo Word/PDF de hasta 15 MB");
    const version = await this.configuration();
    if ((version?.id ?? null) !== (b.versionId ?? null))
      throw new BadRequestException(
        "La configuración cambió. Vuelve a abrir la postulación.",
      );
    for (const id of mapping)
      if (!version?.fields.some((f) => f.id === id && f.fieldType === "file"))
        throw new BadRequestException("Adjunto sin campo válido");
    for (const field of version?.fields ?? [])
      answer(
        field,
        field.fieldType === "file"
          ? mapping.flatMap((id, i) => (id === field.id ? [String(i)] : []))
          : answers[field.id],
        true,
      );
    const upload = async (file: Express.Multer.File) => ({
      documentName: file.originalname,
      documentPath: await this.storage.uploadDocument(
        file.buffer,
        file.originalname,
        mime[file.originalname.toLowerCase().split(".").pop()!],
      ),
      mimeType: mime[file.originalname.toLowerCase().split(".").pop()!],
      sizeBytes: file.size,
    });
    const uploadedDocuments = [];
    for (const file of documents) uploadedDocuments.push(await upload(file));
    const initial: InitialFormData = {
      versionId: version?.id ?? null,
      answers,
      files: {},
    };
    for (let i = 0; i < attachments.length; i++) {
      const id = String(mapping[i]);
      (initial.files[id] ??= []).push(await upload(attachments[i]));
    }
    return this.submissions.createSubmission(
      { studentId: user.id, title, comment, documents: uploadedDocuments },
      initial,
    );
  }
}
