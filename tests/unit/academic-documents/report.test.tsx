import { it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceAttribution } from "@/features/student-portal/source-attribution";
import { presentAcademicSnapshot } from "@/services/academic-documents/presentation";
import { extractAcademicDocument } from "@/services/academic-documents/adapters";
import { parsePdf } from "@/services/pdf/parser";
import { academicPdf, academicHistoryPdf } from "../../fixtures/academic-pdf";
it("watermarks only the generated simple report", () => {
  expect(
    renderToStaticMarkup(
      <SourceAttribution type="SIMPLE_ACADEMIC_HISTORY" report />,
    ),
  ).toContain("academic-source-watermark");
  expect(
    renderToStaticMarkup(
      <SourceAttribution type="OFFICIAL_ACADEMIC_HISTORY" report />,
    ),
  ).not.toContain("academic-source-watermark");
  expect(
    renderToStaticMarkup(
      <SourceAttribution type="CURRICULAR_EXTRACT" report />,
    ),
  ).not.toContain("academic-source-watermark");
  expect(
    renderToStaticMarkup(<SourceAttribution type="SIMPLE_ACADEMIC_HISTORY" />),
  ).not.toContain("academic-source-watermark");
});
it("presents official workload without rewriting a version or undoing tutor corrections", async () => {
  const snapshot = extractAcademicDocument(
    await parsePdf(academicPdf("12345")),
    "extract.pdf",
  );
  const parsedSnapshot = extractAcademicDocument(
    await parsePdf(academicHistoryPdf("12345", true)),
    "official.pdf",
    snapshot,
  );
  const preferredSource = {
    parsedSnapshot,
    documentType: "OFFICIAL_ACADEMIC_HISTORY" as const,
  };
  const displayed = presentAcademicSnapshot({ snapshot, preferredSource });
  expect(displayed.plannedWorkload).toBe(140);
  expect(displayed.integralizedWorkload).toBe(40);
  expect(displayed.documentType).toBe("OFFICIAL_ACADEMIC_HISTORY");
  expect(snapshot.plannedWorkload).toBeUndefined();
  const corrected = structuredClone(snapshot);
  corrected.disciplines[0].normalizedStatus = "9.5";
  expect(
    presentAcademicSnapshot({ snapshot: corrected, preferredSource })
      .disciplines[0].normalizedStatus,
  ).toBe("9.5");
});
