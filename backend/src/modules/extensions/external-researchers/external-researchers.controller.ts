import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { AuthGuard, RolesGuard } from "../../../common/guards";
import { CurrentUser, Public, Roles } from "../../../common/decorators";
import type { SessionUser } from "../../../common/auth/session.util";
import {
  DOSSIER_STATUSES,
  type DossierStatus,
  RegisterExternalResearcherDto,
  VerifyDossierDto,
} from "./external-researchers.dto";
import {
  ENDORSEMENT_MAX_BYTES,
  ExternalResearchersService,
} from "./external-researchers.service";

// Mensaje en español cuando el identificador de la URL no es un UUID.
const dossierIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException("El identificador del expediente no es válido"),
});

@Controller("extensions")
@UseGuards(AuthGuard, RolesGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class ExternalResearchersController {
  constructor(private readonly service: ExternalResearchersService) {}

  @Public()
  @Post("auth/register-external")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor("endorsementLetter", {
      limits: { fileSize: ENDORSEMENT_MAX_BYTES, files: 1 },
    }),
  )
  async register(
    @Body() body: RegisterExternalResearcherDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.register(body, file);
  }

  @Get("admin/external-dossiers")
  @Roles("admin")
  async listDossiers(@Query("status") status?: string) {
    if (status && !DOSSIER_STATUSES.includes(status as DossierStatus)) {
      throw new BadRequestException("Estado de expediente no válido");
    }
    return this.service.listDossiers(status as DossierStatus | undefined);
  }

  @Get("admin/external-dossiers/:id")
  @Roles("admin")
  async getDossier(@Param("id", dossierIdPipe) id: string) {
    return this.service.getDossier(id);
  }

  @Get("admin/external-dossiers/:id/letter")
  @Roles("admin")
  async getEndorsementLetter(
    @Param("id", dossierIdPipe) id: string,
    @Res() res: Response,
  ) {
    const { stream, fileName } = await this.service.getEndorsementLetter(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    stream.on("error", () => {
      if (!res.headersSent) res.status(404);
      res.end();
    });
    stream.pipe(res);
  }

  @Patch("admin/external-dossiers/:id/verify")
  @Roles("admin")
  async verify(
    @Param("id", dossierIdPipe) id: string,
    @Body() body: VerifyDossierDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.service.verify(id, body, user.id);
  }
}
