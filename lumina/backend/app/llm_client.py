"""Where the AI comes from.

The provider is a setting rather than a decision baked into the code, because free
allowances differ enormously and are the practical limit on this product. OpenRouter's
free tier permits 50 requests a day — roughly three conversations — while Groq and
Google's free tiers permit 1,000 and 1,500. All three speak the same protocol, so
moving between them is a web address and a key, not a rewrite.

Set LUMINA_LLM_PROVIDER to pick one, or give LUMINA_LLM_BASE_URL and LUMINA_LLM_API_KEY
for anything else that is OpenAI-compatible. Defaults to OpenRouter so nothing changes
for anyone who has not chosen.
"""

import os
import time
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

_backend_root = Path(__file__).resolve().parent.parent
load_dotenv(_backend_root / ".env")
load_dotenv(_backend_root / ".env.local", override=True)


# name -> (base URL, environment variable holding the key, a sensible free model)
PROVIDERS = {
    "openrouter": (
        "https://openrouter.ai/api/v1",
        "OPENROUTER_API_KEY",
        "nvidia/nemotron-3-super-120b-a12b:free",
    ),
    "groq": (
        "https://api.groq.com/openai/v1",
        "GROQ_API_KEY",
        # Noticeably better at this than llama-3.3-70b, which described columns to the
        # customer by number despite being told not to, and called for the file to be
        # built before anything had been summarised.
        "openai/gpt-oss-120b",
    ),
    "gemini": (
        "https://generativelanguage.googleapis.com/v1beta/openai",
        "GEMINI_API_KEY",
        # Google moves which models carry a free allowance. gemini-2.0-flash now has
        # none — it answers with "limit: 0" rather than a quota that has run out, which
        # reads like an exhausted key and is not. Check with models.list() if this
        # starts refusing.
        "gemini-3.5-flash",
    ),
    "cerebras": (
        "https://api.cerebras.ai/v1",
        "CEREBRAS_API_KEY",
        "llama-3.3-70b",
    ),
}

PROVIDER = os.getenv("LUMINA_LLM_PROVIDER", "openrouter").lower()

if PROVIDER not in PROVIDERS and not os.getenv("LUMINA_LLM_BASE_URL"):
    raise RuntimeError(
        f"Unknown LUMINA_LLM_PROVIDER {PROVIDER!r}. Choose one of "
        f"{', '.join(PROVIDERS)}, or set LUMINA_LLM_BASE_URL and LUMINA_LLM_API_KEY."
    )

_base, _key_var, _default_model = PROVIDERS.get(
    PROVIDER, ("", "LUMINA_LLM_API_KEY", "")
)

BASE_URL = os.getenv("LUMINA_LLM_BASE_URL", _base)
API_KEY = os.getenv("LUMINA_LLM_API_KEY") or os.getenv(_key_var, "")
DEFAULT_MODEL = os.getenv("LUMINA_AGENT_MODEL", _default_model)

if not API_KEY:
    raise RuntimeError(
        f"No API key for provider {PROVIDER!r}. Set {_key_var} in lumina/backend/.env "
        f"(or LUMINA_LLM_API_KEY)."
    )

client = OpenAI(base_url=BASE_URL, api_key=API_KEY)


@dataclass
class Supplier:
    """One place we can get an answer from."""

    name: str
    client: OpenAI
    model: str


# A supplier that has run out stays out for a while. Without this, every step of
# every conversation pays the cost of asking two exhausted suppliers before reaching the
# working one — which is what made a conversation feel like it had hung: the allowances
# reset daily, but the software kept hopefully asking, several times a minute.
EXHAUSTED_FOR_SECONDS = 15 * 60

# A supplier that failed for some other reason — a withdrawn model, a rejected key, a
# network blip — is set aside for much less time. Long enough that a conversation stops
# paying for the same failure at every step, short enough that a passing problem does not
# cost us a working supplier for a quarter of an hour.
FAILED_FOR_SECONDS = 2 * 60

_exhausted: dict[str, float] = {}


def mark_exhausted(name: str, seconds: float = EXHAUSTED_FOR_SECONDS) -> None:
    """Remember that this supplier is not worth asking for a while."""
    _exhausted[name] = time.time() + seconds


def available_suppliers() -> list[Supplier]:
    """Every supplier we hold a key for, preferred one first.

    Free tiers run out — of requests, of tokens, of patience — and each supplier runs
    out differently and on its own schedule. Being told "no" by one is not a reason to
    abandon a customer's conversation when another is sitting there with an unused
    allowance, so the agent works down this list rather than needing somebody to edit a
    setting and restart, which is what happened the first time Groq's daily tokens ran
    dry mid-sentence.
    """
    order = [PROVIDER] + [p for p in PROVIDERS if p != PROVIDER]
    suppliers: list[Supplier] = []
    for stale in [n for n, until in _exhausted.items() if until <= time.time()]:
        del _exhausted[stale]  # allowances come back; give them another chance
    for name in order:
        base, key_var, default_model = PROVIDERS[name]
        key = os.getenv(key_var, "")
        if name == PROVIDER:
            key = API_KEY  # honours LUMINA_LLM_API_KEY and LUMINA_LLM_BASE_URL
            base = BASE_URL
            default_model = DEFAULT_MODEL
        if not key:
            continue
        if _exhausted.get(name, 0) > time.time():
            continue
        suppliers.append(
            Supplier(name, OpenAI(base_url=base, api_key=key), default_model)
        )
    return suppliers

# Trying several models in turn is an OpenRouter feature; other providers serve one
# model per request and reject the extra field.
SUPPORTS_MODEL_FALLBACK = PROVIDER == "openrouter"

FALLBACK_MODELS = [
    "nvidia/nemotron-3-super-120b-a12b:free",
    "openai/gpt-oss-120b:free",
    "google/gemma-4-31b-it:free",
]


def ask(prompt: str, temperature: float = 1.0, use_fallback: bool = True) -> str:
    """One question, one answer. Uses the fallback chain where the provider supports it;
    set use_fallback=False to pin a single model for reproducible structured output."""
    kwargs = {
        "model": FALLBACK_MODELS[0] if SUPPORTS_MODEL_FALLBACK else DEFAULT_MODEL,
        "temperature": temperature,
        "messages": [{"role": "user", "content": prompt}],
    }
    if use_fallback and SUPPORTS_MODEL_FALLBACK:
        kwargs["extra_body"] = {"models": FALLBACK_MODELS, "route": "fallback"}
    completion = client.chat.completions.create(**kwargs)
    return completion.choices[0].message.content


if __name__ == "__main__":
    print(f"provider: {PROVIDER}  model: {DEFAULT_MODEL}")
    print(ask("Reply with exactly one word: pong"))
