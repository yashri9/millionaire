import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

/**
 * HeroShredder — scroll-driven interaction that treats the hero as a sheet
 * of paper being fed into a shredder, then morphs the shredder into a
 * sticky top navigation bar once the hero exits.
 *
 * Scroll phases:
 *   State 0  scrollY < LOCK_SCROLL_Y            Shredder shreds the hero.
 *   State 1  LOCK_SCROLL_Y .. +MORPH_RANGE      Shredder morphs into nav bar.
 *   State 2  scrollY > LOCK + MORPH_RANGE       Fixed nav bar, forever.
 */

const STRIP_COUNT = 52;
const NAV_H = 0;
const MACHINE_H = 42;
const MACHINE_TOP_OFFSET = 40;
const CONTENT_LIFT = 48;

// Height of the pinned band's content box. This used to be a hardcoded
// 450px on a `position: sticky` element, but the real hero content (heading
// + copy + CTA + trust logos + built-by row) runs much taller than that on
// every breakpoint, so content got clipped by the pin's overflow-hidden box.
// Sizing a *sticky* pin to fit that content made things worse the other way:
// a sticky element still reserves its full CSS height in document flow, so a
// content-fit pin (900px+) left a huge dead gap before section 2 for as long
// as the pin was taller than its (fading) content.
//
// Fix: the pin is `position: fixed` (like the nav bar it morphs into), not
// sticky, so it never reserves document space at all — it just overlays
// whatever's beneath it while the shred/morph plays, then hides once done.
// The wrapper only needs to reserve the scroll *budget* (PIN_SCROLL_PX)
// for the interaction, so section 2 always sits directly beneath it with no
// dead space, regardless of how tall the hero content is.
const MIN_PIN_HEIGHT = 450;
// Vertical offset from the top of the pin to where hero content starts
// rendering at rest (mirrors the `--machine-bottom - CONTENT_LIFT` inline
// style below).
const CONTENT_TOP_OFFSET = MACHINE_TOP_OFFSET + MACHINE_H - CONTENT_LIFT;

// Scroll budget for the pinned wrapper (px) — the only height the wrapper
// reserves in document flow.
// Split: SHRED_PX for the shred, MORPH_PX for shredder→nav morph, RELEASE_GAP_PX
// tail so the pin releases exactly RELEASE_GAP_PX after the morph completes.
const SHRED_PX = 312;
const MORPH_PX = 20;
const RELEASE_GAP_PX = 0;
const PIN_SCROLL_PX = SHRED_PX + MORPH_PX + RELEASE_GAP_PX;

const PHASE_A_END = SHRED_PX / PIN_SCROLL_PX;
const PHASE_B_END = (SHRED_PX + MORPH_PX) / PIN_SCROLL_PX;
const MORPH_P_RANGE = MORPH_PX / PIN_SCROLL_PX;

const NAV_TOP_LOCKED = 12;
const NAV_SIDE_LOCKED = 12;

const SEEDS = Array.from({ length: STRIP_COUNT }, (_, i) => ({
  wJitter: (Math.sin(i * 9.17) + 1) / 2,
  xDrift: Math.sin(i * 2.31) * 4,
  rot: Math.sin(i * 5.73) * 1.1,
}));

const rawWidths = SEEDS.map((s) => 1 + s.wJitter * 0.45);
const widthTotal = rawWidths.reduce((a, b) => a + b, 0);
const WIDTHS_PCT = rawWidths.map((w) => (w / widthTotal) * 100);
const LEFTS_PCT: number[] = (() => {
  const out: number[] = [];
  let acc = 0;
  for (const w of WIDTHS_PCT) {
    out.push(acc);
    acc += w;
  }
  return out;
})();

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function HeroShredder({ children }: { children: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stripHostRefs = useRef<(HTMLDivElement | null)[]>([]);
  const shredderRef = useRef<HTMLDivElement>(null);
  const navContentRef = useRef<HTMLDivElement>(null);
  const slitRef = useRef<HTMLDivElement>(null);
  const stripLayerRef = useRef<HTMLDivElement>(null);
  const [navLocked, setNavLocked] = useState(false);
  // `null` means "not measured yet" — the pin renders with `height: auto`
  // in that state so it always fits its content exactly, on the server and
  // during the brief window before hydration finishes. A numeric fallback
  // here (there used to be one) is *always* wrong for some breakpoint —
  // hero content ranges from ~900px tall on desktop to ~1300px on mobile —
  // and a too-short fallback lets section 2 show through underneath the
  // hero during that window.
  const [pinHeight, setPinHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const src = contentRef.current;
    if (!src) return;
    stripHostRefs.current.forEach((host) => {
      if (!host) return;
      host.innerHTML = "";
      const clone = src.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
      clone.style.pointerEvents = "none";
      host.appendChild(clone);
    });

    const measure = () => {
      // Also floor to the viewport height: on a tall enough display the
      // content can be shorter than the window, and the pin must still
      // cover the full viewport at rest or section 2 peeks in underneath.
      setPinHeight(
        Math.max(MIN_PIN_HEIGHT, window.innerHeight, Math.ceil(CONTENT_TOP_OFFSET + src.offsetHeight))
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(src);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    // Scroll-driven shred/morph math needs a concrete pin height to
    // interpolate from — skip until the layout effect above has measured
    // the real content (auto-sizing handles correctness up to that point).
    if (pinHeight == null) return;

    const wrapper = wrapperRef.current;
    const pin = pinRef.current;
    const content = contentRef.current;
    const shredder = shredderRef.current;
    const navContent = navContentRef.current;
    const slit = slitRef.current;
    const stripLayer = stripLayerRef.current;
    if (!wrapper || !pin || !content || !shredder || !navContent || !slit || !stripLayer) return;

    let raf = 0;
    let pending = false;

    const apply = () => {
      pending = false;
      const rect = wrapper.getBoundingClientRect();
      // The wrapper's whole height *is* the scroll budget now (the pin is
      // fixed and reserves no document space of its own).
      const scrollable = wrapper.offsetHeight;
      const p = Math.max(0, Math.min(1, -rect.top / Math.max(1, scrollable)));

      const contentH = content.offsetHeight || pin.offsetHeight * 0.6;
      const machineTop = MACHINE_TOP_OFFSET;
      const machineBottom = machineTop + MACHINE_H;

      // Feed the sheet: at p === PHASE_A_END the sheet has been fully consumed
      // (i.e. the shredder has "eaten" the bottom of the hero). That exact
      // moment is the trigger for the morph — not a hardcoded scrollY.
      const pFeed = Math.min(1, p / PHASE_A_END);
      // Travel distance: move the content up just enough that the marked
      // target row's bottom lands on the shredder's bottom edge at pFeed=1.
      const target = content.querySelector<HTMLElement>("[data-hero-shred-target]");
      let totalTravel: number;
      if (target) {
        const targetBottomInContent = target.offsetTop + target.offsetHeight;
        totalTravel = targetBottomInContent - CONTENT_LIFT;
      } else {
        totalTravel = machineBottom + contentH + 160;
      }
      const feedY = -pFeed * totalTravel;

      // Morph progress: 0 while shredding, 1 by (PHASE_A_END + MORPH_P_RANGE)
      const morphP = Math.max(0, Math.min(1, (p - PHASE_A_END) / MORPH_P_RANGE));

      // ---- Easing helpers (premium morph feel) ----
      // easeInOutCubic drives shape (top / margin / radius): slow start & end,
      // fast middle — reads as a purposeful "click into place".
      const easeInOutCubic = (t: number) =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      // easeOutQuint drives fade-outs (slit, strips, gradient) — most of the
      // opacity change happens early so the machine sheds its "shredder" skin
      // before the nav content fades in.
      const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);
      // easeOutCubic drives nav fade-in — arrives late, then settles softly.
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
      const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

      const shapeT = easeInOutCubic(morphP);
      // Staggered opacity sub-timelines within morphP
      const slitFadeT = easeOutQuint(clamp01(morphP / 0.35)); // out by 35%
      const stripFadeT = easeOutQuint(clamp01(morphP / 0.45)); // out by 45%
      const navFadeT = easeOutCubic(clamp01((morphP - 0.4) / 0.55)); // in from 40%→95%
      const navRiseY = (1 - navFadeT) * 6; // px, subtle upward drift

      // Gradient fades with the shred exit AND additionally with the morph.
      const pExit = clamp01((p - PHASE_A_END) / (PHASE_B_END - PHASE_A_END));
      const gradientOpacity = Math.min(1 - pExit, 1 - easeOutQuint(clamp01(morphP / 0.5)));

      pin.style.setProperty("--feed-y", `${feedY}px`);
      pin.style.setProperty("--feed-progress", `${pFeed}`);
      pin.style.setProperty("--gradient-opacity", `${Math.max(0, gradientOpacity)}`);
      pin.style.setProperty("--machine-top", `${machineTop}px`);
      pin.style.setProperty("--machine-bottom", `${machineBottom}px`);

      // The pin's box always hugs exactly down to the sheet's *current*
      // bottom edge on screen (contentBottomScreen), not a fixed timeline —
      // tying the shrink to morphP alone left a window late in the shred
      // where the sheet had already fed fully out of view but the box
      // hadn't caught up yet, showing blank backing before section 2
      // appears. Tracking the real content position means the box is never
      // taller than what's actually still visible inside it, and it
      // settles at the machine strip's size once the sheet is fully
      // consumed (contentBottomScreen approaches machineBottom).
      const restPinHeight = machineBottom + 24;
      const contentBottomScreen = CONTENT_TOP_OFFSET + feedY + contentH;
      const curPinHeight = Math.max(restPinHeight, Math.min(pinHeight, contentBottomScreen));
      pin.style.height = `${curPinHeight}px`;

      // The pin is a fixed overlay (not document flow), so once the morph
      // is done it must get out of the way instead of continuing to sit on
      // top of section 2.
      const pinFadeT = easeOutQuint(clamp01((morphP - 0.85) / 0.15));
      pin.style.opacity = `${1 - pinFadeT}`;
      pin.style.visibility = pinFadeT >= 1 ? "hidden" : "visible";
      pin.style.pointerEvents = pinFadeT >= 1 ? "none" : "auto";

      const locked = morphP >= 1;
      if (locked !== navLocked) setNavLocked(locked);

      // Shape interpolations use eased shapeT
      const curTop = lerp(MACHINE_TOP_OFFSET, NAV_TOP_LOCKED, shapeT);
      const curRadius = lerp(10, 14, shapeT); // subtle radius growth for pill-nav feel
      const vw = window.innerWidth;
      const startMargin = 0.03 * vw;
      const curMargin = lerp(startMargin, NAV_SIDE_LOCKED, shapeT);
      // Height grows slightly as it becomes a proper nav bar
      const curHeight = lerp(MACHINE_H, 52, shapeT);
      // Background darkens/richens slightly at lock — mimics the nav in the reference
      const bgLift = shapeT;
      const bgR = Math.round(lerp(22, 14, bgLift));
      const bgG = Math.round(lerp(26, 18, bgLift));
      const bgB = Math.round(lerp(34, 26, bgLift));
      // Shadow deepens as it lifts to become floating nav
      const shadowAlpha = lerp(0.25, 0.45, shapeT);
      const shadowY = lerp(10, 18, shapeT);
      const shadowBlur = lerp(24, 40, shapeT);

      shredder.style.position = "fixed";
      shredder.style.top = `${curTop}px`;
      shredder.style.left = `${curMargin}px`;
      shredder.style.right = `${curMargin}px`;
      shredder.style.height = `${curHeight}px`;
      shredder.style.borderRadius = `${curRadius}px`;
      shredder.style.background = `rgb(${bgR}, ${bgG}, ${bgB})`;
      shredder.style.boxShadow = `0 ${shadowY}px ${shadowBlur}px -12px rgba(0,0,0,${shadowAlpha}), inset 0 1px 0 rgba(255,255,255,${lerp(0.08, 0.06, shapeT)})`;

      slit.style.opacity = `${1 - slitFadeT}`;
      slit.style.transform = `translateX(-50%) scaleX(${lerp(1, 0.4, slitFadeT)})`;

      navContent.style.opacity = `${navFadeT}`;
      navContent.style.transform = `translateY(${navRiseY}px)`;
      navContent.style.pointerEvents = navFadeT >= 0.95 ? "auto" : "none";

      stripLayer.style.opacity = `${1 - stripFadeT}`;
      stripLayer.style.visibility = stripFadeT >= 1 ? "hidden" : "visible";
    };

    const schedule = () => {
      if (pending) return;
      pending = true;
      raf = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [navLocked, pinHeight]);

  return (
    <>
      <div ref={wrapperRef} data-hero-shredder-wrapper className="relative" style={{ height: `${PIN_SCROLL_PX}px` }}>
        <div
          ref={pinRef}
          className="overflow-visible bg-background"
          style={{
            position: "fixed",
            top: NAV_H,
            left: 0,
            right: 0,
            zIndex: 25,
            // Before the content height is measured, cover the full
            // viewport rather than guessing a pixel value — every layer
            // inside is `position: absolute`, so `height: auto` would
            // collapse to 0. 100dvh guarantees section 2 (which starts well
            // within one viewport height) can never show through during
            // that window; it's replaced with the real measured height the
            // instant layout effects run, before the browser paints.
            height: pinHeight != null ? `${pinHeight - NAV_H}px` : "100dvh",
            ["--feed-y" as string]: "0px",
            ["--gradient-opacity" as string]: "1",
            ["--machine-top" as string]: `${MACHINE_TOP_OFFSET}px`,
            ["--machine-bottom" as string]: `${MACHINE_TOP_OFFSET + MACHINE_H}px`,
          }}
        >
          {/* Blue → white gradient backdrop */}
          <div
            className="absolute left-0 right-0 pointer-events-none"
            style={{
              top: 0,
              height: `var(--machine-top)`,
              background:
                "linear-gradient(180deg, #0a1836 0%, #1e3a6b 22%, #4a6fa8 48%, #9db4d4 70%, #dee7f2 86%, #ffffff 100%)",
              opacity: "var(--gradient-opacity)",
              willChange: "opacity",
              zIndex: 3,
            }}
            aria-hidden
          />

          {/* INTACT SHEET */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              clipPath: "inset(var(--machine-bottom) 0 0 0)",
              zIndex: 10,
            }}
          >
            <div
              className="absolute left-0 right-0"
              style={{
                top: `calc(var(--machine-bottom) - ${CONTENT_LIFT}px)`,
                transform: "translate3d(0, var(--feed-y), 0)",
                willChange: "transform",
              }}
            >
              <div ref={contentRef}>{children}</div>
            </div>
          </div>

          {/* SHREDDED STRIPS */}
          <div
            ref={stripLayerRef}
            className="absolute inset-0 pointer-events-none overflow-hidden"
            aria-hidden
            style={{ zIndex: 20 }}
          >
            {SEEDS.map((seed, i) => {
              const left = LEFTS_PCT[i];
              const width = WIDTHS_PCT[i];
              const right = 100 - left - width;
              return (
                <div
                  key={i}
                  className="absolute inset-0"
                  style={{
                    clipPath: `inset(0 ${right}% calc(100% - var(--machine-top)) ${left}%)`,
                    transform: `translate3d(${seed.xDrift}px, 0, 0) rotate(${seed.rot}deg)`,
                    transformOrigin: `${left + width / 2}% var(--machine-top)`,
                    willChange: "transform",
                  }}
                >
                  <div
                    className="absolute left-0 right-0"
                    style={{
                      top: `calc(var(--machine-bottom) - ${CONTENT_LIFT}px)`,
                      transform: "translate3d(0, var(--feed-y), 0)",
                      willChange: "transform",
                    }}
                  >
                    <div
                      ref={(el) => {
                        stripHostRefs.current[i] = el;
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* SHREDDER / NAV BAR — rendered outside the pin so it can go fixed */}
      <div
        ref={shredderRef}
        className="rounded-lg"
        style={{
          position: "fixed",
          top: `${MACHINE_TOP_OFFSET}px`,
          left: `3vw`,
          right: `3vw`,
          height: MACHINE_H,
          zIndex: 50,
          background: "#161a22",
          willChange: "top, left, right, height, border-radius, background, box-shadow",
          boxShadow:
            "0 10px 24px -12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
        aria-hidden={!navLocked}
      >
        {/* Intake slit (shredder mode) */}
        <div
          ref={slitRef}
          className="absolute left-1/2 rounded-full pointer-events-none"
          style={{
            bottom: 8,
            width: "70%",
            height: 3,
            transform: "translateX(-50%)",
            transformOrigin: "center",
            background: "#000",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.9)",
            willChange: "opacity, transform",
          }}
        />

        {/* Nav content (fades in during morph) */}
        <div
          ref={navContentRef}
          className="absolute inset-0 flex items-center justify-between px-6"
          style={{ opacity: 0, pointerEvents: "none", willChange: "opacity, transform" }}
        >
          <Link
            to="/"
            className="font-display text-sm font-bold tracking-[0.2em] text-white"
          >
            VOXDECK
          </Link>
          <nav className="flex items-center gap-8">
            <a
              href="#product"
              className="text-xs font-semibold uppercase tracking-[0.15em] text-white/70 transition-colors hover:text-white"
            >
              Product
            </a>
            <a
              href="#voices"
              className="text-xs font-semibold uppercase tracking-[0.15em] text-white/70 transition-colors hover:text-white"
            >
              Voices
            </a>
            <a
              href="#how"
              className="text-xs font-semibold uppercase tracking-[0.15em] text-white/70 transition-colors hover:text-white"
            >
              How it works
            </a>
            <Link
              to="/signup"
              className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-foreground transition-transform hover:-translate-y-0.5"
            >
              Sign up
            </Link>
          </nav>
        </div>
      </div>
    </>
  );
}
