import { extractEssentialPoints } from "./essential-points.ts";

export type PitchDraftInput = {
  pageText: string;
  pageNum: number;
  title?: string;
  essentialPoints?: string[];
  /** 0 = first slide, last index known via totalPages */
  totalPages?: number;
};

const HOOKS = [
  (p: string) => `Here's the beat that matters: ${p}`,
  (p: string) => `This is the moment I want you to remember â€” ${p}`,
  (p: string) => `Start here: ${p}`,
];

const BODY = [
  (a: string, b?: string) =>
    b ? `${a}. That lands because ${uncap(b)}.` : `${a}.`,
  (a: string, b?: string) =>
    b ? `${a} â€” and the proof is ${uncap(b)}.` : `${a}.`,
  (a: string, b?: string) =>
    b ? `Two things: ${uncap(a)}, and ${uncap(b)}.` : `${a}.`,
];

const CLOSES = [
  (p: string) => `So the ask is simple: ${uncap(p)}.`,
  (p: string) => `If this is the outcome you want, let's ${uncap(p)}.`,
  (p: string) => `Next step from here: ${uncap(p)}.`,
];

function uncap(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function trimWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim().replace(/\s+/g, " ");
  return words.slice(0, maxWords).join(" ").replace(/[,:;â€“â€”-]$/, "") + ".";
}

function stripTrailingJunk(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/[.!?]{2,}/g, ".")
    .trim();
}

/**
 * Draft a spoken pitch line from essentials â€” never a verbatim read of the slide.
 */
export function draftPitchLine(input: PitchDraftInput): string {
  const points =
    input.essentialPoints?.filter((p) => p.trim()).slice(0, 4) ??
    extractEssentialPoints(input.pageText, {
      title: input.title,
      limit: 4,
    });

  if (!points.length) {
    return `This is slide ${input.pageNum}. Walk the visual and land the one thing you need them to believe.`;
  }

  const total = input.totalPages ?? 0;
  const isFirst = input.pageNum <= 1;
  const isLast = total > 0 && input.pageNum >= total;
  const variant = (input.pageNum - 1) % 3;

  let line: string;
  if (isFirst) {
    line = HOOKS[variant](points[0]);
    if (points[1]) line += ` ${BODY[variant](points[0], points[1]).replace(/^.*?[.â€”]\s*/, "")}`;
  } else if (isLast) {
    line = CLOSES[variant](points[0]);
  } else {
    line = BODY[variant](points[0], points[1]);
  }

  // Avoid sounding like a caption dump of the title alone
  const title = (input.title ?? "").trim().toLowerCase();
  if (title && line.trim().toLowerCase() === title) {
    line = `Here's why this matters: ${points[0]}.`;
  }

  return stripTrailingJunk(trimWords(line, 32));
}
