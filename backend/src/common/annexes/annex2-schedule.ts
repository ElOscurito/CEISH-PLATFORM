import { BadRequestException } from "@nestjs/common";

export type Annex2ItemType = "objective" | "activity";

export interface Annex2ScheduleItem {
  id: string;
  parentId: string | null;
  type: Annex2ItemType;
  label: string;
  startMonth: number;
  durationMonths: number;
}

export interface Annex2Schedule {
  items: Annex2ScheduleItem[];
}

const integer = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) ? value : NaN;

export function normalizeAnnex2Schedule(raw: unknown): Annex2Schedule {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as any).items)) {
    throw new BadRequestException("El cronograma del Anexo 2 no es válido");
  }

  const items: Annex2ScheduleItem[] = (raw as any).items.map(
    (entry: unknown, index: number) => {
      if (!entry || typeof entry !== "object") {
        throw new BadRequestException(`La actividad ${index + 1} no es válida`);
      }
      const value = entry as Record<string, unknown>;
      const type = value.type;
      const id = String(value.id ?? "").trim();
      const label = String(value.label ?? "").trim();
      const startMonth = integer(value.startMonth);
      const durationMonths = integer(value.durationMonths);
      const parentId = value.parentId == null ? null : String(value.parentId);
      if (!id || !label || !["objective", "activity"].includes(String(type))) {
        throw new BadRequestException(`Completa el nombre y tipo de la actividad ${index + 1}`);
      }
      if (startMonth < 1 || durationMonths < 1 || startMonth + durationMonths - 1 > 36) {
        throw new BadRequestException("Cada barra debe permanecer entre los meses 1 y 36");
      }
      return { id, label, type: type as Annex2ItemType, parentId, startMonth, durationMonths };
    },
  );

  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new BadRequestException("Las actividades del cronograma deben tener identificadores únicos");
  }
  const objectives = new Map(items.filter((item) => item.type === "objective").map((item) => [item.id, item]));
  for (const item of items) {
    if (item.type === "objective" && item.parentId !== null) {
      throw new BadRequestException("Un objetivo principal no puede depender de otra actividad");
    }
    if (item.type === "activity") {
      const parent = item.parentId ? objectives.get(item.parentId) : undefined;
      if (!parent) throw new BadRequestException(`La subactividad ${item.label} debe pertenecer a un objetivo`);
      const itemEnd = item.startMonth + item.durationMonths - 1;
      const parentEnd = parent.startMonth + parent.durationMonths - 1;
      if (item.startMonth < parent.startMonth || itemEnd > parentEnd) {
        throw new BadRequestException(`La subactividad ${item.label} debe quedar dentro del rango de su objetivo`);
      }
    }
  }
  return { items };
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function materializeAnnex2Schedule(schedule: Annex2Schedule, approvedAt: Date) {
  return {
    approvedAt: approvedAt.toISOString(),
    items: schedule.items.map((item) => ({
      ...item,
      startDate: addMonths(approvedAt, item.startMonth - 1).toISOString(),
      endDate: addMonths(approvedAt, item.startMonth + item.durationMonths - 1).toISOString(),
    })),
  };
}
