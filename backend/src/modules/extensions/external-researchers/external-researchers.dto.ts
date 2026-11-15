import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

// Mínimo de caracteres para los campos de texto: descarta entradas de un solo
// carácter sin rechazar valores cortos legítimos (p. ej. "UK" o "TI").
const MIN_TEXT = 2;

const tooShort = (label: string) =>
  `${label} debe tener al menos ${MIN_TEXT} caracteres`;
const tooLong = (label: string, max: number) =>
  `${label} no puede superar los ${max} caracteres`;
const asText = (label: string) => `${label} debe ser un texto`;

// Los campos llegan como texto porque el registro se envía en multipart/form-data.
export class RegisterExternalResearcherDto {
  @Transform(trim)
  @IsString({ message: asText("El nombre") })
  @MinLength(MIN_TEXT, { message: tooShort("El nombre") })
  @MaxLength(120, { message: tooLong("El nombre", 120) })
  name!: string;

  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: "Ingresa un correo válido" })
  @MaxLength(255, { message: tooLong("El correo", 255) })
  email!: string;

  @IsString({ message: asText("La contraseña") })
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres" })
  @MaxLength(128, { message: tooLong("La contraseña", 128) })
  password!: string;

  @Transform(trim)
  @IsString({ message: asText("La institución") })
  @IsNotEmpty({ message: "La institución de procedencia es obligatoria" })
  @MinLength(MIN_TEXT, { message: tooShort("La institución") })
  @MaxLength(200, { message: tooLong("La institución", 200) })
  homeInstitution!: string;

  @Transform(trim)
  @IsString({ message: asText("El país") })
  @IsNotEmpty({ message: "El país de la institución es obligatorio" })
  @MinLength(MIN_TEXT, { message: tooShort("El país") })
  @MaxLength(100, { message: tooLong("El país", 100) })
  institutionCountry!: string;

  @Transform(trim)
  @IsString({ message: asText("El cargo") })
  @IsNotEmpty({ message: "El cargo en la institución es obligatorio" })
  @MinLength(MIN_TEXT, { message: tooShort("El cargo") })
  @MaxLength(120, { message: tooLong("El cargo", 120) })
  positionRole!: string;

  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean({ message: "Indica si existe convenio con la ULEAM" })
  hasUleamAgreement!: boolean;

  @ValidateIf((dto: RegisterExternalResearcherDto) => dto.hasUleamAgreement)
  @Transform(trim)
  @IsString({ message: asText("El convenio") })
  @IsNotEmpty({
    message: "Indica el nombre o código del convenio con la ULEAM",
  })
  @MinLength(MIN_TEXT, { message: tooShort("El convenio") })
  @MaxLength(200, { message: tooLong("El convenio", 200) })
  agreementCodeOrName?: string;
}

export const VERIFICATION_DECISIONS = [
  "verified_with_agreement",
  "verified_without_agreement",
  "rejected",
] as const;

export type VerificationDecision = (typeof VERIFICATION_DECISIONS)[number];

export class VerifyDossierDto {
  @IsIn(VERIFICATION_DECISIONS, { message: "El dictamen no es válido" })
  decision!: VerificationDecision;

  @IsOptional()
  @Transform(trim)
  @IsString({ message: asText("Las observaciones") })
  @MaxLength(2000, { message: tooLong("Las observaciones", 2000) })
  adminNotes?: string;

  @IsOptional()
  @Transform(trim)
  @IsString({ message: asText("El convenio") })
  @MaxLength(200, { message: tooLong("El convenio", 200) })
  agreementCodeOrName?: string;
}

export const DOSSIER_STATUSES = [
  "under_review",
  ...VERIFICATION_DECISIONS,
] as const;
export type DossierStatus = (typeof DOSSIER_STATUSES)[number];
