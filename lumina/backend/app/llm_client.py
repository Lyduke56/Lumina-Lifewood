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
        "gemini-2.0-flash",
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
