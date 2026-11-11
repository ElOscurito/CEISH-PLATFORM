import { IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";

export class CreateConsultationRequestDto {
  @IsUUID()
  @IsNotEmpty()
  submissionId!: string;

  @IsUUID()
  @IsNotEmpty()
  consultantId!: string;

  @IsString()
  @IsOptional()
  instructions?: string;

  @IsString()
  @IsOptional()
  dueDate?: string;
}
