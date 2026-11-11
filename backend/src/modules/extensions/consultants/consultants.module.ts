import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { ConsultantsController } from "./consultants.controller";
import { ConsultantsService } from "./consultants.service";

@Module({
  imports: [PrismaModule],
  controllers: [ConsultantsController],
  providers: [ConsultantsService],
  exports: [ConsultantsService],
})
export class ConsultantsModule {}
