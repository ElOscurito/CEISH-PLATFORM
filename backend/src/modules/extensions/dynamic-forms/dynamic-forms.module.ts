import { DynamicSubmissionsController } from "./dynamic-submissions.controller";
import { SubmissionsModule } from "../../submissions/submissions.module";
import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser, Roles } from "../../../common/decorators";
import { AuthGuard, RolesGuard } from "../../../common/guards";
import { SessionUser } from "../../../common/auth/session.util";
import { DynamicFormsService } from "./dynamic-forms.service";

// Prisma BigInt metadata must be JSON-safe at the HTTP boundary.
export function json<T>(value: T): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? Number(v) : v)),
  );
}

@Controller("extensions/admin/forms")
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class DynamicFormsController {
  constructor(private readonly service: DynamicFormsService) {}
  @Get() list() {
    return this.service.list();
  }
  @Post() create(@Body() body: unknown) {
    return this.service.create(body);
  }
  @Post(":id/draft") draft(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.draft(id);
  }
  @Put(":id/draft") edit(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.service.edit(id, body);
  }
  @Post(":id/publish") publish(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.publish(id);
  }
  @Patch(":id") activate(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.service.activate(id, body);
  }
}

@Controller("extensions")
@UseGuards(AuthGuard, RolesGuard)
export class DynamicFormResponsesController {
  constructor(private readonly service: DynamicFormsService) {}
  @Get("submissions/:id/forms") available(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.service.available(id, user);
  }
  @Get("submissions/:id/form-instances") async history(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser,
  ) {
    return json(await this.service.history(id, user));
  }
  @Post("submissions/:id/forms/:formId/start")
  @Roles("student", "evaluator")
  async start(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("formId", ParseUUIDPipe) formId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return json(await this.service.start(id, formId, user));
  }
  @Get("form-instances/:id") async get(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser,
  ) {
    return json(await this.service.get(id, user));
  }
  @Put("form-instances/:id/answers")
  @Roles("student", "evaluator")
  async save(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
  ) {
    return json(await this.service.save(id, body, user));
  }
  @Post("form-instances/:id/submit")
  @Roles("student", "evaluator")
  async submit(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser,
  ) {
    return json(await this.service.submit(id, user));
  }
  @Post("form-instances/:id/corrections")
  @Roles("student", "evaluator")
  async correction(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser,
  ) {
    return json(await this.service.correction(id, user));
  }
  @Post("form-instances/:id/fields/:fieldId/files")
  @Roles("student", "evaluator")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 15728640, files: 1 } }),
  )
  async upload(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("fieldId", ParseUUIDPipe) fieldId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: SessionUser,
  ) {
    return json(await this.service.upload(id, fieldId, file, user));
  }
  @Get("form-files/:id") download(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.service.download(id, user);
  }
  @Delete("form-instances/:id/files/:fileId")
  @Roles("student", "evaluator")
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("fileId", ParseUUIDPipe) fileId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.service.removeFile(id, fileId, user);
  }
}

@Module({
  imports: [SubmissionsModule],
  controllers: [
    DynamicFormsController,
    DynamicFormResponsesController,
    DynamicSubmissionsController,
  ],
  providers: [DynamicFormsService],
  exports: [DynamicFormsService],
})
export class DynamicFormsModule {}
