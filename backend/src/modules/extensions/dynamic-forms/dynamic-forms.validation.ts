import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new BadRequestException("Objeto inválido");
  return input as Record<string, unknown>;
}
export function string(input: unknown, max: number, optional = false): string {
  if (optional && (input === undefined || input === null)) return "";
  if (
    typeof input !== "string" ||
    input.length > max ||
    (!optional && !input.trim())
  )
    throw new BadRequestException("Texto inválido");
  return input.trim();
}
export function fields(input: unknown, audience: string) {
  if (!Array.isArray(input) || input.length > 100)
    throw new BadRequestException("Se admiten hasta 100 campos");
  const keys = new Set<string>();
  return input.map((raw, index) => {
    const f = object(raw);
    const fieldKey = string(f.fieldKey, 80);
    if (!/^[a-z][a-z0-9_]*$/.test(fieldKey) || keys.has(fieldKey))
      throw new BadRequestException("Clave de campo inválida o duplicada");
    keys.add(fieldKey);
    const fieldType = string(f.fieldType, 30);
    const types =
      audience === "evaluator_criteria"
        ? ["criterion"]
        : [
            "text",
            "textarea",
            "single_select",
            "multi_select",
            "checkbox",
            "file",
          ];
    if (!types.includes(fieldType) || typeof f.isRequired !== "boolean")
      throw new BadRequestException("Tipo u obligatoriedad inválidos");
    if (!Array.isArray(f.options ?? []))
      throw new BadRequestException("Opciones inválidas");
    const options = (f.options ?? []) as unknown[];
    const select = ["single_select", "multi_select"].includes(fieldType);
    if (
      (select && (!options.length || options.length > 100)) ||
      (!select && options.length)
    )
      throw new BadRequestException("Opciones incompatibles con el tipo");
    const seen = new Set<string>();
    const normalized = options.map((rawOption) => {
      const option = object(rawOption);
      const value = string(option.value, 80);
      if (seen.has(value)) throw new BadRequestException("Opción duplicada");
      seen.add(value);
      return { value, label: string(option.label, 200) };
    });
    return {
      fieldKey,
      fieldType,
      label: string(f.label, 2000),
      isRequired: f.isRequired,
      options: normalized,
      displayOrder: index + 1,
      placeholder: string(f.placeholder, 500, true),
      helpText: string(f.helpText, 2000, true),
    };
  });
}

export function answer(
  field: {
    fieldType: string;
    isRequired: boolean;
    options: Prisma.JsonValue;
    label: string;
  },
  value: unknown,
  final: boolean,
): Prisma.InputJsonValue {
  const fail = () => {
    throw new BadRequestException(`Respuesta inválida: ${field.label}`);
  };
  const missing =
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0);
  if (missing) {
    if (final && field.isRequired) return fail();
    return field.fieldType === "multi_select" || field.fieldType === "file"
      ? []
      : field.fieldType === "checkbox"
        ? false
        : "";
  }
  switch (field.fieldType) {
    case "text":
    case "textarea":
      if (
        typeof value !== "string" ||
        value.length > (field.fieldType === "text" ? 2000 : 20000) ||
        (final && field.isRequired && !value.trim())
      )
        return fail();
      return value;
    case "checkbox":
      if (typeof value !== "boolean" || (final && field.isRequired && !value))
        return fail();
      return value;
    case "single_select":
    case "multi_select": {
      const allowed = (field.options as { value: string }[]).map(
        (o) => o.value,
      );
      const values = field.fieldType === "single_select" ? [value] : value;
      if (
        !Array.isArray(values) ||
        values.some((v) => typeof v !== "string" || !allowed.includes(v)) ||
        new Set(values).size !== values.length
      )
        return fail();
      return value as Prisma.InputJsonValue;
    }
    case "file":
      if (
        !Array.isArray(value) ||
        value.length > 10 ||
        value.some((v) => typeof v !== "string") ||
        new Set(value).size !== value.length
      )
        return fail();
      return value;
    case "criterion": {
      const item = object(value);
      if (
        !["pending", "approved", "rejected"].includes(String(item.status)) ||
        (final && item.status === "pending")
      )
        return fail();
      const page = item.pageReference ?? null;
      if (
        page !== null &&
        (typeof page !== "number" ||
          !Number.isInteger(page) ||
          page < 1 ||
          page > 32767)
      )
        return fail();
      return {
        status: String(item.status),
        observation: string(item.observation, 20000, true),
        pageReference: page,
      };
    }
    default:
      return fail();
  }
}
