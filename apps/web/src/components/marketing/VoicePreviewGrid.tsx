"use client";

import { useState } from "react";

const VOICES = [
  { id: "marcus", name: "Marcus", meta: "US", desc: "Confident · Clear" },
  { id: "kai", name: "Kai", meta: "AUS", desc: "Conversational · Direct" },
  { id: "sofia", name: "Sofia", meta: "UK", desc: "Warm · Polished" },
  { id: "warm", name: "Warm", meta: "Clear", desc: "Friendly · Concise" },
] as const;

export function VoicePreviewGrid() {
  const [active, setActive] = useState<(typeof VOICES)[number]["id"]>("marcus");

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {VOICES.map((v) => {
        const on = v.id === active;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => setActive(v.id)}
            className={`flex flex-col border p-6 text-left transition-colors md:p-8 ${
              on
                ? "border-[#176bff] bg-[#176bff]/10"
                : "border-[#07111f28] bg-transparent hover:border-[#176bff]/50"
            }`}
          >
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-[#07111f28] bg-[#eaf3ff]">
              <div
                className={`waveform ${on ? "text-[#77a8ff]" : "text-[#68768a]"}`}
                aria-hidden
              >
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-xl font-normal text-[#07111f] md:text-2xl">{v.name}</h3>
              <span className="text-sm text-[#68768a]">{v.meta}</span>
            </div>
            <p className="text-[#526176]">{v.desc}</p>
            <div className="mt-6 text-sm font-semibold text-[#07111f]">▶ Preview voice</div>
          </button>
        );
      })}
    </div>
  );
}
