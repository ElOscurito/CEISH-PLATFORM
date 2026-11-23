import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from "class-validator";
import type { Limits } from "./business-days";

export const PROCESS_TYPES = [
  "stratification",
  "qualification",
  "correction_review",
] as const;
export type ProcessType = (typeof PROCESS_TYPES)[number];

export class PeriodDto {
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}

export class FilterDto extends PeriodDto {
  @IsOptional()
  @IsUUID()
  memberId?: string;
}

export class ThresholdDto implements Limits {
  @IsIn(PROCESS_TYPES)
  process_type!: ProcessType;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  warning_days!: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  critical_days!: number;
}
