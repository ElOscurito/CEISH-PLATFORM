import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, RolesGuard } from "../../../common/guards";
import { CurrentUser, Roles } from "../../../common/decorators";
import type { SessionUser } from "../../../common/auth/session.util";
import { ConsultantsService } from "./consultants.service";
import { CreateConsultationRequestDto } from "./dto/create-consultation-request.dto";
import { SubmitConsultationFeedbackDto } from "./dto/create-consultation-feedback.dto";

@Controller("extensions/consultants")
@UseGuards(AuthGuard, RolesGuard)
export class ConsultantsController {
  constructor(private readonly consultantsService: ConsultantsService) {}

  /**
   * Catálogo de Consultores Permanentes de Odontología
   */
  @Get("permanent")
  @Roles("evaluator", "admin")
  async getPermanentConsultants() {
    return this.consultantsService.getPermanentConsultants();
  }

  /**
   * Crear solicitud de interconsulta técnica
   */
  @Post("requests")
  @Roles("evaluator", "admin")
  async createRequest(
    @CurrentUser() user: SessionUser,
    @Body() dto: CreateConsultationRequestDto,
  ) {
    return this.consultantsService.createRequest(user.id, dto);
  }

  /**
   * Consultas asignadas al docente autenticado
   */
  @Get("requests/my-requests")
  @Roles("evaluator", "admin")
  async getMyRequests(@CurrentUser() user: SessionUser) {
    return this.consultantsService.getMyConsultations(user.id);
  }

  /**
   * Consultas de una investigación específica
   */
  @Get("submissions/:submissionId/requests")
  @Roles("evaluator", "admin")
  async getRequestsForSubmission(
    @Param("submissionId") submissionId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.consultantsService.getRequestsForSubmission(
      submissionId,
      user.id,
      user.role,
    );
  }

  /**
   * Detalle de una solicitud de interconsulta
   */
  @Get("requests/:id")
  @Roles("evaluator", "admin")
  async getRequestById(
    @Param("id") id: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.consultantsService.getRequestById(id, user.id, user.role);
  }

  /**
   * Envío del informe técnico de recomendaciones por el consultor
   */
  @Post("requests/:id/feedback")
  @Roles("evaluator", "admin")
  async submitFeedback(
    @Param("id") id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: SubmitConsultationFeedbackDto,
  ) {
    return this.consultantsService.submitFeedback(id, user.id, dto);
  }

  /**
   * Adopción en bloque de las recomendaciones por el miembro titular
   */
  @Post("requests/:id/accept-all")
  @Roles("evaluator", "admin")
  async acceptAllFeedback(
    @Param("id") id: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.consultantsService.acceptAllFeedback(id, user.id);
  }
}
