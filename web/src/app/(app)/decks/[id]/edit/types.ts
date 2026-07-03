export type Slide = {
  id: string;
  order_index: number;
  title: string;
  bullets: string[];
  image_url: string | null;
  thumb_url: string | null;
};

export type Deck = {
  id: string;
  title: string;
  status: "uploading" | "parse_failed" | "draft" | "published";
};

export type Share = { token: string; url: string } | null;

export type Voice = { name: string; rate: number };

export type TranscriptMsg = { role: "prospect" | "agent" | "agent-thinking"; text: string; escalated?: boolean; slideRef?: number | null };

export type InboxItem = {
  question: string;
  answer: string;
  escalated: boolean;
  slideRef: number | null;
  ts: Date;
};
