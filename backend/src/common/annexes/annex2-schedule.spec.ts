import AdmZip from "adm-zip";
import { AnnexDocumentService } from "./annex-document.service";
import { materializeAnnex2Schedule, normalizeAnnex2Schedule } from "./annex2-schedule";

describe("Anexo 2 schedule", () => {
  const schedule = normalizeAnnex2Schedule({
    items: [
      { id: "o1", parentId: null, type: "objective", label: "Objetivo específico", startMonth: 1, durationMonths: 5 },
      { id: "a1", parentId: "o1", type: "activity", label: "Recolección de datos", startMonth: 1, durationMonths: 2 },
      { id: "a2", parentId: "o1", type: "activity", label: "Análisis", startMonth: 2, durationMonths: 3 },
    ],
  });

  it("calcula fechas reales desde la aprobación y conserva solapamientos", () => {
    const result = materializeAnnex2Schedule(schedule, new Date("2026-12-15T00:00:00.000Z"));
    expect(result.items[1].startDate).toBe("2026-12-15T00:00:00.000Z");
    expect(result.items[1].endDate).toBe("2027-02-15T00:00:00.000Z");
    expect(result.items[2].startDate).toBe("2027-01-15T00:00:00.000Z");
  });

  it("rellena la matriz completa del documento institucional", async () => {
    const service = new AnnexDocumentService();
    const data = materializeAnnex2Schedule(schedule, new Date("2026-12-15T00:00:00.000Z"));
    const buffer = await service.generateAnnexDocx({
      annexNumber: 2,
      researchCode: "CEISH-00001",
      title: "Investigación de prueba",
      researcherName: "Investigador",
      memberName: "Evaluador",
      data,
      documents: [],
    });
    const zip = new AdmZip(buffer);
    const xml = zip.getEntry("word/document.xml")?.getData().toString("utf8") ?? "";
    expect(xml).toContain("Recolección de datos (15/12/2026 - 15/02/2027)");
    expect(xml).toContain('w:fill="000000"');
    expect(xml).toContain('w:fill="BFBFBF"');
    expect(xml).not.toContain("Objetivo Específico 4");
  });
});
