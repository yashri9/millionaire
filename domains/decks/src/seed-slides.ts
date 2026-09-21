// Shared demo deck data — used by editor + preview so highlight timings agree.
export type SeedSlide = {
  n: string;
  title: string;
  script: string;
  durationSec: number;
};

export const SEED_SLIDES: SeedSlide[] = [
  { n: "01", title: "Cover",    script: "Hey — I'm going to walk you through Scapia in about four minutes. Grab a coffee.", durationSec: 12 },
  { n: "02", title: "Problem",  script: "Booking travel with a credit card should feel like magic. Right now, it feels like paperwork.", durationSec: 34 },
  { n: "03", title: "Insight",  script: "We looked at 12,000 trips and found one number that mattered: the 47-second decision window.", durationSec: 41 },
  { n: "04", title: "Product",  script: "So we built My Trips — a booking canvas that lives inside the card, not next to it.", durationSec: 52 },
  { n: "05", title: "Traction", script: "In six months, 92% of pilots converted to paid. Here's the cohort breakdown.", durationSec: 38 },
  { n: "06", title: "Ask",      script: "We're raising a Series B to double down on the US market. Here's what we're offering.", durationSec: 44 },
];
