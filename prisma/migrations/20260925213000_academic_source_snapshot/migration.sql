-- Normalized source facts enrich presentation without mutating an immutable analysis version.
ALTER TABLE "AcademicAnalysisSource" ADD COLUMN "parsedSnapshot" JSONB;
