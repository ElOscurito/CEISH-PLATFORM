import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { ExternalResearchersController } from "./external-researchers.controller";
import { ExternalResearchersService } from "./external-researchers.service";

// Vinculación · Tarea 4. Módulo satélite: reutiliza RegistrationRequestsService
// para crear la cuenta y no modifica controladores ni servicios troncales.
@Module({
  imports: [AuthModule],
  controllers: [ExternalResearchersController],
  providers: [ExternalResearchersService],
})
export class ExternalResearchersModule {}
