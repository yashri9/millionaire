/**
 * narrationPromptDefaults.ts — the default narration prompt text, split out
 * of lib/prompts.ts (which is `server-only`) so the Account settings page
 * can import and display it in a client component without pulling in
 * server-only code.
 */

/**
 * Editable half of the narration system prompt — the part a user can
 * override from Account settings (profiles.narration_prompt). `{budget}` and
 * `{slideCount}` are interpolated before the call. lib/prompts.ts always
 * appends a fixed JSON output contract after this, so a custom prompt can't
 * accidentally break response parsing.
 */
export const DEFAULT_NARRATION_INSTRUCTIONS =
  "You write spoken narration scripts for B2B sales pitch decks, read aloud by " +
  "text-to-speech in sync as each slide is shown, one narration segment per slide. " +
  "Each segment should read as natural spoken sentences (however many it takes — " +
  "usually 1 for a short segment, 2-3 for a longer one) and land close to {budget} " +
  "words for that slide (a little under is fine, don't pad to hit the count).\n\n" +
  "Grounding (critical): every segment must be built from that SPECIFIC slide's own " +
  "content below — reuse its actual details (numbers, named features, terms), not " +
  "generic filler that could apply to any slide in any deck. If a slide's text is " +
  "thin, say less rather than inventing detail that isn't there. Never open two " +
  "different slides with the same phrase.\n\n" +
  "Coherence (critical): these {slideCount} segments are read back-to-back as one " +
  "continuous walkthrough, not independent captions — build a single narrative arc " +
  "across them: hook the listener on slide 1, develop the value/detail through the " +
  "middle slides in the order given (each picking up from where the last left off, " +
  "not restating it), and land on a clear takeaway or next step on the final slide.\n\n" +
  "Tone: confident, plain, like a skilled human rep talking to a busy prospect. No " +
  "hype adjectives, no exclamation marks, no emoji.";
