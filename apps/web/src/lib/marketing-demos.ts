/** Marketing demo decks for the landing Rehearse stage.
 *  Add a new entry to MARKETING_DEMO_DECKS to ship another sample.
 */

export type DemoSlideTheme = "uber-dark" | "uber-light" | "meesho" | "neutral";

export type DemoSlide = {
  n: string;
  title: string;
  label: string;
  script: string;
  durationSec: number;
  /** 1-based PDF page when a pre-rendered image exists */
  pdfPage?: number;
  theme?: DemoSlideTheme;
  /** Optional subtitle on stylized (non-image) slides */
  subtitle?: string;
};

export type MarketingDemoDeck = {
  id: string;
  name: string;
  /** Short picker hint */
  blurb: string;
  slides: DemoSlide[];
  /**
   * How to render the stage visual.
   * - `image`: use slideImage()
   * - `styled`: CSS stage from slide.theme
   */
  visual: "image" | "styled";
  /** Root folder under /public/marketing/{assetKey}/slides/page-XX.jpg */
  assetKey?: string;
};

/** Uber pitch — all 13 pages, scripts from platform deck `ull1ho`. */
export const UBER_DEMO_SLIDES: DemoSlide[] = [
  {
    n: "01",
    title: "Next-Generation Car Service",
    label: "Cover",
    subtitle: "Next-generation car service",
    script:
      "We are building the next generation of car service. Our goal is to make every ride faster, safer, and more reliable for both riders and drivers.",
    durationSec: 10,
    pdfPage: 1,
    theme: "uber-dark",
  },
  {
    n: "02",
    title: "Problem",
    label: "Problem",
    script:
      "In 2008, most cabs relied on aging, inefficient technology. Taxi monopolies lowered service quality, and the lack of GPS coordination created friction between clients and drivers.",
    durationSec: 10,
    pdfPage: 2,
    theme: "uber-dark",
  },
  {
    n: "03",
    title: "Solution",
    label: "Solution",
    script:
      "Our solution is a fast, on-demand car service. We automate dispatch to cut wait times, optimize fleet efficiency, and incentivize drivers. This leverages modern web and mobile technology to deliver a superior ride experience.",
    durationSec: 13,
    pdfPage: 3,
    theme: "uber-light",
  },
  {
    n: "04",
    title: "How it Works",
    label: "Product",
    script:
      "Membership is required to use the service. You book rides directly from your phone, not from the street. Unlike a yellow cab, we guarantee your pick-up.",
    durationSec: 10,
    pdfPage: 4,
    theme: "uber-light",
  },
  {
    n: "05",
    title: "Key Differentiators",
    label: "Differentiators",
    script:
      "We differentiate through a high-tech, optimized fleet and a rating system that ensures great drivers. Our geo-aware software provides fast response times, making it easier than calling a cab and guaranteeing a respectable clientele.",
    durationSec: 13,
    pdfPage: 5,
    theme: "uber-light",
  },
  {
    n: "06",
    title: "Product",
    label: "Product",
    script:
      "Our product is built for speed and simplicity. You can request a ride with one click from your geo-aware device. The app also lets you book trips, check fleet status, and review your trip history.",
    durationSec: 14,
    pdfPage: 6,
    theme: "uber-light",
  },
  {
    n: "07",
    title: "Use Cases",
    label: "Use cases",
    script:
      "We solve real friction points. Whether it's airport transfers, pre-scheduled bar trips, or quick local rides where parking is a nightmare, we make getting around effortless. Plus, you can work while commuting.",
    durationSec: 12,
    pdfPage: 7,
    theme: "uber-dark",
  },
  {
    n: "08",
    title: "User Benefits",
    label: "Benefits",
    script:
      "Traditional cabs are unreliable and often dirty. You might wait forty-five minutes for a pickup that never arrives. Our service guarantees a clean, safe ride exactly when you need it, eliminating that uncertainty.",
    durationSec: 13,
    pdfPage: 8,
    theme: "uber-light",
  },
  {
    n: "09",
    title: "Technology",
    label: "Technology",
    script:
      "Our technology stack combines intelligent scheduling with real-time payment and utilization tracking. We also monitor driver reputation to maintain quality. This system is patent-pending, ensuring our operational edge remains protected and scalable.",
    durationSec: 12,
    pdfPage: 9,
    theme: "uber-light",
  },
  {
    n: "10",
    title: "Market Size",
    label: "Market",
    script:
      "This slide outlines our target customer count and pricing strategy. It demonstrates the potential scale of the company based on these market assumptions.",
    durationSec: 9,
    pdfPage: 10,
    theme: "uber-dark",
  },
  {
    n: "11",
    title: "Looking Forward",
    label: "Outcomes",
    script:
      "We see three paths. Best case, we lead the market with over a billion dollars in yearly revenue. Realistically, we capture five percent of top US cities. Worst case, we remain a local service in San Francisco.",
    durationSec: 14,
    pdfPage: 11,
    theme: "uber-light",
  },
  {
    n: "12",
    title: "Go-To Market plan",
    label: "GTM",
    script:
      "Our go-to-market strategy focuses on referral virality. We launch as an invite-only service, requiring new users to be referred by existing members. This controlled growth allows us to build a premium brand before scaling to become the ubiquitous cab service.",
    durationSec: 15,
    pdfPage: 12,
    theme: "uber-dark",
  },
  {
    n: "13",
    title: "Traction",
    label: "Traction",
    script:
      "We secured our LLC, bank, PayPal, trademark, and dev license. We're live with five advisors and fifteen clients.",
    durationSec: 12,
    pdfPage: 13,
    theme: "uber-light",
  },
];

/** Meesho first pitch — all 19 pages, scripts from platform deck `8t0aed`. */
export const MEESHO_DEMO_SLIDES: DemoSlide[] = [
  {
    n: "01",
    title: "Enabling next-gen",
    label: "Cover",
    script:
      "Welcome to Meesho. We are turning housewives into business owners. This deck outlines our model and growth strategy.",
    durationSec: 8,
    pdfPage: 1,
    theme: "meesho",
  },
  {
    n: "02",
    title: "Why social selling?",
    label: "Insight",
    script:
      "We target over two hundred million Indian housewives. They have free time, need secondary income, and are highly social. This makes social selling the perfect channel for them to start their own businesses.",
    durationSec: 13,
    pdfPage: 2,
    theme: "meesho",
  },
  {
    n: "03",
    title: "Social Selling 2.0",
    label: "Market",
    script:
      "We are evolving social selling into a modern, scalable model. Unlike traditional direct selling, our approach offers a hundred times the opportunity. It provides wider reach and lower barriers to entry, making it significantly more lucrative for entrepreneurs.",
    durationSec: 15,
    pdfPage: 3,
    theme: "meesho",
  },
  {
    n: "04",
    title: "Fast growing market",
    label: "Market",
    script:
      "The market is exploding. We project resellers will grow from two million in 2017 to twenty-three million by 2022. That drives total addressable market from eight billion to fifty billion dollars. The graph shows this rapid expansion.",
    durationSec: 14,
    pdfPage: 4,
    theme: "meesho",
  },
  {
    n: "05",
    title: "Reselling in China",
    label: "Proof",
    script:
      "Weidian proves the model. Launched in 2014, it hit fifty million resellers. By 2015, GMV reached ten billion dollars. Seventy percent of shops come from Tier 3 cities. They raised three hundred fifty million dollars from Tencent.",
    durationSec: 14,
    pdfPage: 5,
    theme: "meesho",
  },
  {
    n: "06",
    title: "Why consumers buy",
    label: "Demand",
    script:
      "Consumers buy from resellers for three reasons: impulse shopping, intent shopping, and unique products. Resellers act as personal shoppers, providing social proof and inbound social selling rather than outbound ads.",
    durationSec: 12,
    pdfPage: 6,
    theme: "meesho",
  },
  {
    n: "07",
    title: "Hard to be a reseller",
    label: "Problem",
    script:
      "But becoming a reseller is hard. Housewives struggle with difficult access to supply, low trust between resellers and suppliers, and no price visibility. These barriers make the current model unreliable for everyday sellers.",
    durationSec: 13,
    pdfPage: 7,
    theme: "meesho",
  },
  {
    n: "08",
    title: "Our solution",
    label: "Product",
    script:
      "We built a curated marketplace connecting resellers with verified suppliers. By adding new, larger suppliers who previously couldn't take orders, we drive price competition. This ensures lowest prices, transparency, and reliable dispute resolution for every seller.",
    durationSec: 14,
    pdfPage: 8,
    theme: "meesho",
  },
  {
    n: "09",
    title: "Product experience",
    label: "Product",
    script:
      "We offer curated collections with easy social sharing. You get supplier price ratings and order tracking. This transparency helps resellers make informed decisions and manage their inventory effectively.",
    durationSec: 11,
    pdfPage: 9,
    theme: "meesho",
  },
  {
    n: "10",
    title: "Consistent growth",
    label: "Traction",
    script:
      "We show consistent growth in monthly GMV and orders. As you can see, both metrics rise steadily from our WhatsApp MVP launch through the app release, demonstrating strong user adoption and scaling.",
    durationSec: 12,
    pdfPage: 10,
    theme: "meesho",
  },
  {
    n: "11",
    title: "Strong user engagement",
    label: "Engagement",
    script:
      "Our users are deeply engaged, spending about twenty-five minutes daily. The charts show strong growth in product shares and monthly shares, highlighting consistent activity across our platform.",
    durationSec: 10,
    pdfPage: 11,
    theme: "meesho",
  },
  {
    n: "12",
    title: "High user retention",
    label: "Retention",
    script:
      "Retention is our core strength. The graphs show consistent user and GMV retention over time. Please review the specific trends in the charts to see how our community stays active.",
    durationSec: 12,
    pdfPage: 12,
    theme: "meesho",
  },
  {
    n: "13",
    title: "Resellers growth",
    label: "Growth",
    script:
      "Our reseller base is expanding rapidly. The chart shows daily active, sharing, and ordering resellers climbing steadily over time. Please review the specific growth trends in the graphs to see how our community scales.",
    durationSec: 13,
    pdfPage: 13,
    theme: "meesho",
  },
  {
    n: "14",
    title: "Acquisition cracked",
    label: "Acquisition",
    script:
      "We cracked acquisition. We scaled from zero to two million active resellers, building a two-hundred-thousand database. We targeted housewives via referrals, training, and WhatsApp, keeping costs to just two dollars per user.",
    durationSec: 12,
    pdfPage: 14,
    theme: "meesho",
  },
  {
    n: "15",
    title: "Next big distribution channel",
    label: "Vision",
    script:
      "Traditional e-commerce is stuck at forty million shoppers. Our social selling model unlocks the path to five hundred million online buyers, solving the friction and variety gaps holding the market back.",
    durationSec: 12,
    pdfPage: 15,
    theme: "meesho",
  },
  {
    n: "16",
    title: "Passionate & capable team",
    label: "Team",
    script:
      "Our founders bring IIT pedigree and experience from ITC, Sony, and Housing. We've built the core team to drive product, growth, and operations with the same intensity.",
    durationSec: 10,
    pdfPage: 16,
    theme: "meesho",
  },
  {
    n: "17",
    title: "Strategic investors",
    label: "Investors",
    script:
      "We are backed by strategic investors like Eric Kwan, Rajul Garg, and Sundeep Madra. With advice from Neeraj Arora and capital from Venkatesh Karnam, we have the network and support to scale effectively.",
    durationSec: 13,
    pdfPage: 17,
    theme: "meesho",
  },
  {
    n: "18",
    title: "Plan & ask",
    label: "Ask",
    script:
      "We are raising a three million dollar Series A. This capital funds our expansion from twenty million to one hundred million dollars in GMV, scaling our daily orders and reseller network to meet our Year Two targets.",
    durationSec: 14,
    pdfPage: 18,
    theme: "meesho",
  },
  {
    n: "19",
    title: "Thank you",
    label: "Close",
    script:
      "Thank you. I'm Vidit Aatrey. Reach me at vidit at meesho dot com to discuss next steps.",
    durationSec: 8,
    pdfPage: 19,
    theme: "meesho",
  },
];

/** Ordered list shown in the Rehearse deck picker. Append new demos here. */
export const MARKETING_DEMO_DECKS: MarketingDemoDeck[] = [
  {
    id: "uber",
    name: "Uber",
    blurb: "Classic on-demand pitch",
    slides: UBER_DEMO_SLIDES,
    visual: "image",
    assetKey: "uber",
  },
  {
    id: "meesho",
    name: "Meesho",
    blurb: "Social selling, India",
    slides: MEESHO_DEMO_SLIDES,
    visual: "image",
    assetKey: "meesho",
  },
];

export const DEFAULT_MARKETING_DEMO_ID = MARKETING_DEMO_DECKS[0]!.id;

export function getMarketingDemo(id: string): MarketingDemoDeck {
  return (
    MARKETING_DEMO_DECKS.find((d) => d.id === id) ?? MARKETING_DEMO_DECKS[0]!
  );
}

/** Pre-rendered JPEG path for image-backed demos. */
export function demoSlideImage(deck: MarketingDemoDeck, slide: DemoSlide) {
  const page = slide.pdfPage;
  if (!deck.assetKey || !page) return null;
  return `/marketing/${deck.assetKey}/slides/page-${String(page).padStart(2, "0")}.jpg`;
}

/** @deprecated use demoSlideImage */
export function meeshoSlideImage(pdfPage: number) {
  return `/marketing/meesho/slides/page-${String(pdfPage).padStart(2, "0")}.jpg`;
}

export const MEESHO_PDF_URL = "/marketing/meesho/meesho-first-pitch.pdf";

/** Fixed 16:9 hero deck slides — scripts from platform deck `85pod7`. */
export const VOXDECK_HERO_SLIDES: (DemoSlide & { image: string })[] = [
  {
    n: "01",
    title: "Decks that talk back",
    label: "Cover",
    image: "/marketing/voxdeck/slides/page-01.png",
    script:
      "Meet Voxdeck. Upload your deck, and it narrates, publishes, and answers questions for you when you're not in the room. Let's see how it works.",
    durationSec: 10,
  },
  {
    n: "02",
    title: "The problem",
    label: "Problem",
    image: "/marketing/voxdeck/slides/page-02.png",
    script:
      "The problem is clear. A PDF is opened once, then forgotten. One in four demo calls ends in a no-show. And sixty-seven percent of B2B buyers now prefer a rep-free buying experience.",
    durationSec: 12,
  },
  {
    n: "03",
    title: "How it works",
    label: "Solution",
    image: "/marketing/voxdeck/slides/page-03.png",
    script:
      "It works in four steps. Upload your PDF, let AI write grounded pitch lines, publish a shareable link, and hand off. The deck answers buyer questions and routes complex ones to you, no meeting required.",
    durationSec: 14,
  },
  {
    n: "04",
    title: "Why now, why Voxdeck",
    label: "Why now",
    image: "/marketing/voxdeck/slides/page-04.png",
    script:
      "India's sales-enablement market hits $762.7M by 2030, growing at 21.5% annually. Voxdeck beats Loom and Vidyard by keeping your deck static, skipping self-recording, and adding AI Q&A with human handoff.",
    durationSec: 12,
  },
  {
    n: "05",
    title: "Pitch while you sleep",
    label: "Ask",
    image: "/marketing/voxdeck/slides/page-05.png",
    script:
      "Send your first narrated deck this week. It is free for founding partners. Book a pilot today to start pitching while you sleep.",
    durationSec: 9,
  },
];

/** @deprecated use VOXDECK_HERO_SLIDES[0].image */
export const VOXDECK_HERO_SLIDE = VOXDECK_HERO_SLIDES[0]!.image;

/** @deprecated use VOXDECK_HERO_SLIDES */
export const VOXDECK_HERO_BEATS = VOXDECK_HERO_SLIDES;
