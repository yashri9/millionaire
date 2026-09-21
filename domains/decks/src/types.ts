/** Core deck shapes shared by web, studio, and future app. */

export type DeckStatus = "draft" | "published" | "processing" | "failed";

export type SlideWord = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type DeckSlide = {
  n: string;
  title: string;
  script: string;
  durationSec: number;
  /** Pitch-critical claims the narrator must land (editable). */
  essentialPoints?: string[];
  thumbnail?: string;
  pageText?: string;
  words?: SlideWord[];
};

export type StoredDeck = {
  id: string;
  title: string;
  createdAt: number;
  slides: DeckSlide[];
};
