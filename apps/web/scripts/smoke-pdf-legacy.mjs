import { writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const dir = dirname(fileURLToPath(import.meta.url));
const pdfPath = join(dir, "tmp-test.pdf");

const pdf = `%PDF-1.1
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 44 >>stream
BT /F1 24 Tf 50 80 Td (Hello Voxdeck) Tj ET
endstream endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000361 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
440
%%EOF`;

writeFileSync(pdfPath, pdf);

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
console.log("pdfjs", pdfjs.version);
console.log("getOrInsertComputed", typeof Map.prototype.getOrInsertComputed);

const data = new Uint8Array(readFileSync(pdfPath));
const doc = await pdfjs.getDocument({ data, disableWorker: true }).promise;
console.log("pages", doc.numPages);
const page = await doc.getPage(1);
const text = await page.getTextContent();
console.log(
  "text",
  text.items.map((i) => ("str" in i ? i.str : "")).join(""),
);
console.log("legacy parse ok");
