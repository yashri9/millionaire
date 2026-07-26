# Landing Page Mock Doc — Deck Agent (Voxdeck)

A content/wireframe mock for the marketing landing page. Every section below
names the psychological principle it's built on (from the "If You Don't
Understand Psychology, You Don't Understand Landing Pages" transcript) so the
reasoning survives even if the copy gets rewritten later.

**Product, in one line:** Upload a sales deck → it renders every page, writes
a spoken narration grounded in your slides, records it in an AI voice, and
publishes a full-screen shareable link that plays the walkthrough aloud and
answers prospect questions — handing off to the rep when it can't answer
confidently.

**Audience:** founders, AEs, and agencies who send decks (sales, fundraising,
partnerships) and get ghosted after.

---

## 1. Core desire map (Life Force 8)

The outcome we sell is "your deck talks and answers questions." That's the
surface. The table below is the *why* underneath it — this is what the copy
should actually be aimed at, per section.

| Desire (Life Force 8) | How it shows up for this audience | Where it's used |
|---|---|---|
| Superiority / winning | Wants to close the deal, look sharper than competitors sending flat PDFs | Hero, proof section |
| Freedom from fear & pain | Fears the deck dies in someone's inbox, fears an awkward call where they can't answer a question live | Problem/loss section |
| Social approval | Wants prospects/investors to think "wow, that was slick" — reflects well on them personally | Hero visual, halo/first-impression design |
| Comfortable living (time back) | Doesn't want to re-explain the same deck on 10 calls a week | How-it-works, secondary benefit line |

Everything below writes to the desire, not just the feature.

---

## 2. Section-by-section mock

### Hero

**Principle: sell the core desire (not the outcome) + halo effect (first 5 seconds).**

The obvious outcome-only headline is "Give your deck a voice" — that's a
feature description. Reframed to the desire underneath (stop losing deals to
silence, look sharp doing it):

> **H1:** Your deck goes quiet the second you stop talking. This one doesn't.
> **Sub:** Upload a PDF. It narrates every slide in a voice that sounds like
> you, answers questions on its own, and tells you the moment someone opens it.
> **CTA:** Upload your deck → (secondary link: See a 30-second example)

Design note (halo effect): first impression is judged in ~50ms — the hero
needs to look expensive *before* anyone reads a word. Clean type, generous
whitespace, one confident visual (the deck literally narrating itself), no
clutter. If the hero looks like a template, the reader assumes the product is
one too.

### Problem / loss section

**Principle: loss aversion.** Losing feels ~2x worse than winning feels good,
so this section should outweigh the benefits section in emotional weight, not
just list pain points politely.

> **Eyebrow:** What's actually happening after you hit send
> **H2:** You don't get ghosted. You get skimmed, then forgotten.
> **Body:** Your prospect opens the deck once, for 40 seconds, on their phone,
> in a Slack scroll. They miss the one slide that would've closed them. You
> won't know it happened — there's no signal, no follow-up trigger, nothing.
> The deal doesn't die with a "no." It just goes quiet.

Bullets under it, each a specific loss (not a feature):
- No idea if they even opened it
- No one there to answer "wait, what about X" — so they assume the worst and move on
- You re-explain the same deck live, every time, because the PDF can't

### How it works

**Principle: labor illusion.** Showing the visible work in progress makes
people trust the result more, even though the end state is identical to an
instant result. This section should look like a process, not a black box.

> **Eyebrow:** What happens in the 90 seconds after you upload
> **H2:** Watch it actually work.

Four visible steps, shown as a live-feeling sequence (progress indicators,
not a static list):

1. **Reading every page** — extracting the real text and numbers off your
   slides (not guessing)
2. **Writing the narration** — grounded only in what's on the page, in your
   pacing, slide by slide
3. **Recording the voice** — an elite AI voice, matched to the tone you pick
4. **Wiring up the Q&A** — so it can answer from your deck's own content, and
   knows when to hand off to you instead of making something up

This section directly answers "why does this cost anything, it's just AI" —
by making the labor visible, the price stops feeling arbitrary.

### Proof / social approval

**Principle: social approval + halo effect carryover.** Once the hero has
built trust, this section needs to confirm it wasn't a fluke.

- Logos ("Built by operators from…")
- One or two testimonials that specifically mention *being complimented* or
  *looking more prepared* in front of a prospect/investor — not just "great
  tool," but "my investor said the deck felt like a real product demo"
- A concrete number if available (e.g., completion rate of narrated decks vs.
  static PDF open rates)

### Objection / how it handles risk

**Principle: cognitive fluency.** This is the section most likely to be
full of jargon ("grounded generation," "hallucination-safe retrieval") —
that kills trust. Rewrite at a plain-language level.

> **H2:** It only knows what's in your deck.
> **Body:** It can't invent numbers or make promises you didn't put on a
> slide. If a prospect asks something the deck doesn't cover, it says so and
> loops you in — it doesn't guess.

### Final CTA

**Principle: loss aversion, mirrored back.**

> **H2:** Stop sending dead links.
> **Body:** Ship your first talking deck in under three minutes.
> **CTA:** Get started — it's free

---

## 3. Copy style guide (cognitive fluency)

- Target reading level: 5th–8th grade. Rewrite any sentence a 12-year-old
  couldn't follow on one read.
- Short sentences. One idea per sentence.
- No internal jargon on customer-facing copy: ban words like "grounded
  generation," "LLM," "pipeline," "escalation logic" outside of docs. Say
  "answers from your deck" instead of "grounded retrieval," say "hands off to
  you" instead of "escalation."
- Every heading should be understandable on its own, without the paragraph
  under it.

## 4. Halo effect checklist (first impression)

- [ ] Hero renders correctly and fully visible with zero layout shift (ties
      directly into the hero animation/spacing fix already shipped)
- [ ] One consistent type scale, no more than 2 fonts
- [ ] Visual hierarchy reads top-to-bottom without the reader having to hunt
- [ ] No section looks unfinished or templated — if in doubt, cut it rather
      than ship it rough

## 5. Open questions for whoever builds this next

- Do we have a real testimonial that hits the "looked more impressive to my
  investor/prospect" angle, or does one need to be sourced?
- Is there a real number for "faster to close" / "higher completion rate"
  we can put in the proof section instead of a vague claim?
- Should the "how it works" section be an actual live animation (matching
  the labor-illusion progress-bar example from the transcript) or a static
  4-step graphic for v1?
