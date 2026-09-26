/** Shape returned by GET /api/decks/:id/analytics. */
export type DeckQuestion = {
  text: string;
  answer_text: string | null;
  escalated: boolean;
  confidence: number | null;
  slide_ref: number | null;
  created_at: string;
};

export type SlideViews = { order_index: number; title: string; views: number };

export type DeckAnalytics = {
  deckTitle: string;
  totalOpens: number;
  completedCount: number;
  completionRate: number;
  perSlide: SlideViews[];
  questions: DeckQuestion[];
};
