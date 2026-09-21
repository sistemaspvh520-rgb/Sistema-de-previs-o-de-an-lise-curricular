import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";
const file = process.argv[2];
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 }).promise;
console.log("PAGES", doc.numPages);
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const c = await page.getTextContent();
  const items = c.items.filter(i => i.str && i.str.trim()).map(i => ({ x: Math.round(i.transform[4]), y: Math.round(i.transform[5]), s: i.str }));
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of items) {
    const l = lines.find(l => Math.abs(l.y - it.y) <= 3);
    if (l) l.parts.push(it); else lines.push({ y: it.y, parts: [it] });
  }
  console.log(`\n=== PAGE ${p} (${Math.round(vp.width)}x${Math.round(vp.height)}) ===`);
  for (const l of lines) console.log(String(l.y).padStart(4), "|", l.parts.sort((a,b)=>a.x-b.x).map(p => `[${p.x}]${p.s}`).join("  "));
}
