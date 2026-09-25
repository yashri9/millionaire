/**
 * Stress: prove cwd-based pdfjs path breaks in monorepo layout (Vercel apps/web),
 * while package-resolve works.
 */
import { existsSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";

const require = createRequire(import.meta.url);

const vercelCwd = join(process.cwd(), "apps", "web");
const broken = join(vercelCwd, "node_modules", "pdfjs-dist");
const resolved = dirname(require.resolve("pdfjs-dist/package.json"));

console.log(
  JSON.stringify(
    {
      repoCwd: process.cwd(),
      vercelLikeCwd: vercelCwd,
      brokenPathExists: existsSync(broken),
      brokenPath: broken,
      resolvedPathExists: existsSync(resolved),
      resolvedPath: resolved,
      cmaps: existsSync(join(resolved, "cmaps")),
      fonts: existsSync(join(resolved, "standard_fonts")),
      canvasOk: Boolean(require.resolve("@napi-rs/canvas")),
    },
    null,
    2,
  ),
);

if (existsSync(broken)) {
  console.error("UNEXPECTED: apps/web/node_modules/pdfjs-dist exists — Vercel bug may differ");
  process.exit(2);
}
if (!existsSync(resolved) || !existsSync(join(resolved, "cmaps"))) {
  console.error("FAIL: cannot resolve pdfjs assets");
  process.exit(1);
}
console.log("PASS: cwd path broken (as on Vercel), package resolve OK");
