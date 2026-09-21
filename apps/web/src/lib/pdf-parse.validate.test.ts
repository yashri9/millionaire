/**
 * Lightweight node checks for PDF upload validation + error mapping.
 * Run: npx --yes tsx src/lib/pdf-parse.validate.test.ts
 */
import {
  PdfParseError,
  userMessageForParseError,
  validatePdfFile,
} from "./pdf-parse";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function fakeFile(partial: {
  name: string;
  size: number;
  type?: string;
}): File {
  return {
    name: partial.name,
    size: partial.size,
    type: partial.type ?? "",
  } as File;
}

assert(
  validatePdfFile(fakeFile({ name: "notes.txt", size: 10, type: "text/plain" }))
    ?.code === "invalid_file",
  "rejects non-pdf extension",
);

assert(
  validatePdfFile(
    fakeFile({ name: "deck.pdf", size: 10, type: "image/png" }),
  )?.code === "invalid_file",
  "rejects pdf name with image mime",
);

assert(
  validatePdfFile(
    fakeFile({ name: "deck.pdf", size: 26 * 1024 * 1024 }),
  )?.code === "file_too_large",
  "rejects oversized pdf",
);

assert(
  validatePdfFile(fakeFile({ name: "deck.pdf", size: 0 }))?.code === "empty",
  "rejects empty pdf",
);

assert(
  validatePdfFile(
    fakeFile({ name: "deck.pdf", size: 1200, type: "application/pdf" }),
  ) === null,
  "accepts valid pdf",
);

assert(
  userMessageForParseError(
    new PdfParseError("corrupt", "We couldn't read this PDF. Please try another file."),
  ) === "We couldn't read this PDF. Please try another file.",
  "passes through PdfParseError message",
);

assert(
  userMessageForParseError({
    name: "PasswordException",
    message: "No password given",
  }).includes("password-protected"),
  "maps password errors",
);

assert(
  userMessageForParseError({
    name: "TypeError",
    message: "this[#methodPromises].getOrInsertComputed is not a function",
  }) === "We couldn't process this PDF. Please try again.",
  "hides getOrInsertComputed internals",
);

assert(
  !userMessageForParseError(new Error("stack at foo")).includes("stack at"),
  "does not echo raw stack-ish messages",
);

console.log("pdf-parse.validate.test.ts: ok");
