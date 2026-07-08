import os
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI

_backend_root = Path(__file__).resolve().parent.parent
load_dotenv(_backend_root / ".env")
load_dotenv(_backend_root / ".env.local", override=True)


FALLBACK_MODELS = [
    "nvidia/nemotron-3-super-120b-a12b:free",
    "openai/gpt-oss-120b:free",
    "google/gemma-4-31b-it:free",
]

client = OpenRouter = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
)


def ask(prompt: str, temperature: float = 1.0, use_fallback: bool = True) -> str:
    """Call OpenRouter. By default uses the fallback chain of free models; set
    use_fallback=False to pin the primary model only (for reproducible structured output).
    """
    kwargs = {
        "model": FALLBACK_MODELS[0],
        "temperature": temperature,
        "messages": [{"role": "user", "content": prompt}],
    }
    if use_fallback:
        kwargs["extra_body"] = {"models": FALLBACK_MODELS, "route": "fallback"}
    completion = client.chat.completions.create(**kwargs)
    return completion.choices[0].message.content


if __name__ == "__main__":
    print(ask("Reply with exactly one word: pong"))
