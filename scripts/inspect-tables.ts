import "dotenv/config";
import { readFileSync } from "node:fs";
import { parsePdf } from "../src/services/pdf/parser";
import { detectTables, effectiveRows, tableToText } from "../src/services/pdf/table-detector";

const file = process.argv[2];
parsePdf(readFileSync(file)).then((local) => {
  const table = detectTables(local.pages);
  console.log(tableToText(table));
  const rows = effectiveRows(table);
  const byPeriod: Record<number, { total: number; exempted: number }> = {};
  for (const r of rows) {
    const p = (byPeriod[r.period ?? 0] ??= { total: 0, exempted: 0 });
    p.total++;
    if (r.usedSubject) p.exempted++;
  }
  console.log("\nROWS", rows.length, "duplicates", table.rows.length - rows.length);
  console.log(byPeriod);
  console.log("\nFREE TEXT p1:", table.freeText[1]);
});
