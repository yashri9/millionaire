"""
llm.py — pluggable LLM provider
====================================================================
One place that talks to whichever model provider you configure. Swap
providers by changing a single value (LLM_PROVIDER) in backend/.env —
no code changes needed.

Supported providers:
  - "groq"       -> OpenAI-compatible chat API (default here)
  - "anthropic"  -> Anthropic Messages API

The rest of the app only calls `call_llm(system, user)` and never needs
to know which provider is active.
"""

from __future__ import annotations

import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import HTTPException

# Load .env sitting next to this file (safe to call more than once).
load_dotenv(Path(__file__).resolve().parent / ".env")


def _cfg() -> dict:
    """Read provider config lazily so .env is always respected at call time."""
    provider = os.getenv("LLM_PROVIDER", "groq").strip().lower()
    return {
        "provider": provider,
        # Groq (OpenAI-compatible)
        "groq_key": os.getenv("GROQ_API_KEY", "").strip(),
        "groq_model": os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip(),
        "groq_base": os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1").strip(),
        # Anthropic
        "anthropic_key": os.getenv("ANTHROPIC_API_KEY", "").strip(),
        "anthropic_model": os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6").strip(),
        "anthropic_version": os.getenv("ANTHROPIC_VERSION", "2023-06-01").strip(),
    }


def provider_status() -> dict:
    """Used by /health so you can see what's configured."""
    c = _cfg()
    key_set = bool(c["anthropic_key"]) if c["provider"] == "anthropic" else bool(c["groq_key"])
    model = c["anthropic_model"] if c["provider"] == "anthropic" else c["groq_model"]
    return {"provider": c["provider"], "model": model, "key_set": key_set}


def _strip_fences(text: str) -> str:
    return text.replace("```json", "").replace("```", "").strip()


async def call_llm(system: str, user: str, max_tokens: int = 1200) -> str:
    """Send a system + user prompt to the active provider, return raw text."""
    c = _cfg()

    if c["provider"] == "anthropic":
        if not c["anthropic_key"]:
            raise HTTPException(503, "ANTHROPIC_API_KEY is not set in backend/.env")
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "content-type": "application/json",
            "x-api-key": c["anthropic_key"],
            "anthropic-version": c["anthropic_version"],
        }
        payload = {
            "model": c["anthropic_model"],
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(url, headers=headers, json=payload)
        if r.status_code != 200:
            raise HTTPException(502, f"Anthropic API error {r.status_code}: {r.text[:200]}")
        data = r.json()
        block = next((b for b in data.get("content", []) if b.get("type") == "text"), None)
        if not block:
            raise HTTPException(502, "No text response from model")
        return _strip_fences(block["text"])

    # Default: Groq / any OpenAI-compatible chat endpoint
    if not c["groq_key"]:
        raise HTTPException(503, "GROQ_API_KEY is not set in backend/.env")
    url = f"{c['groq_base']}/chat/completions"
    headers = {
        "content-type": "application/json",
        "authorization": f"Bearer {c['groq_key']}",
    }
    payload = {
        "model": c["groq_model"],
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(url, headers=headers, json=payload)
    if r.status_code != 200:
        raise HTTPException(502, f"{c['provider']} API error {r.status_code}: {r.text[:200]}")
    data = r.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        raise HTTPException(502, "No text response from model")
    return _strip_fences(content)
