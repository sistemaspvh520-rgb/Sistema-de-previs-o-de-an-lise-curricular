import {
  documentLabels,
  sourceReportText,
  type AcademicDocumentType,
} from "@/services/academic-documents/classifier";
export function SourceAttribution({
  type = "CURRICULAR_EXTRACT",
  report = false,
}: {
  type?: AcademicDocumentType;
  report?: boolean;
}) {
  return (
    <>
      {report && type === "SIMPLE_ACADEMIC_HISTORY" && (
        <div className="academic-source-watermark" aria-hidden="true">
          SIMPLES CONFERÊNCIA
        </div>
      )}
      <p className={report ? "report-source-footer" : "text-xs text-slate-500"}>
        {report
          ? sourceReportText(type)
          : `Análise baseada em: ${documentLabels[type]}`}
      </p>
    </>
  );
}
