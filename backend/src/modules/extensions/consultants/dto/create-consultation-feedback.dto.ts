import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class SingleFeedbackItemDto {
  @IsString()
  @IsNotEmpty()
  criteriaLabel!: string;

  @IsString()
  @IsOptional()
  @IsIn(["approved", "rejected", "neutral"])
  suggestedStatus?: "approved" | "rejected" | "neutral";

  @IsString()
  @IsNotEmpty()
  technicalComments!: string;
}

export class SubmitConsultationFeedbackDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SingleFeedbackItemDto)
  feedbacks!: SingleFeedbackItemDto[];
}
