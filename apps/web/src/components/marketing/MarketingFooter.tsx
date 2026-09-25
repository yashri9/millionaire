import Link from "next/link";

const PRODUCT = [
  { href: "#how", label: "How it works" },
  { href: "#studio", label: "Examples" },
  { href: "#voices", label: "Voices" },
  { href: "#use", label: "Use cases" },
];

const COMPANY = [
  { href: "/decks/new", label: "Get started" },
];

const ACCOUNT = [
  { href: "/login", label: "Log in" },
  { href: "/decks/new", label: "Sign up" },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-[#07111f28] bg-[#eaf3ff]">
      <div className="px-[5%] py-12 md:py-18">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-[2fr_1fr_1fr_1fr] lg:gap-x-12">
          <div>
            <Link href="/" className="inline-flex items-center gap-2">
              <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#07111f] text-[#f4f8ff]">
                <span className="waveform text-[#77a8ff]" aria-hidden>
                  <span /><span /><span /><span /><span /><span /><span />
                </span>
              </span>
              <span className="mkt-h2 text-lg tracking-tight text-[#07111f]">
                VOXDECK<span className="text-[#176bff]">.</span>
              </span>
            </Link>
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-[#526176]">
              Make the deck talk. Narrated walkthroughs prospects and investors
              can watch on their own time.
            </p>
          </div>
          <FooterCol title="Product" links={PRODUCT} />
          <FooterCol title="Company" links={COMPANY} />
          <FooterCol title="Account" links={ACCOUNT} />
        </div>
      </div>
      <div className="border-t border-[#07111f28] px-[5%] py-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-4 text-sm text-[#68768a] sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Voxdeck. All rights reserved.</p>
          <div className="flex flex-wrap gap-6">
            <span>Privacy</span>
            <span>Terms</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <h2 className="mb-4 font-semibold text-[#07111f]">{title}</h2>
      <ul className="flex flex-col gap-3 text-sm text-[#526176]">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="transition-colors hover:text-[#176bff]">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
