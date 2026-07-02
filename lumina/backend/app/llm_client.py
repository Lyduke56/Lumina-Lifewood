import os
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

FALLBACK_MODELS = [
    "nvidia/nemotron-3-super-120b-a12b:free",
    "openai/gpt-oss-120b:free",
    "google/gemma-4-31b-it:free",
]

client = OpenRouter = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
)


def ask(prompt: str) -> str:
    """Call the fallback chain of free OpenRouter models; returns the response text."""
    completion = client.chat.completions.create(
        model=FALLBACK_MODELS[0],
        extra_body={
            "models": FALLBACK_MODELS,
            "route": "fallback",
        },
        messages=[{"role": "user", "content": prompt}],
    )
    return completion.choices[0].message.content


if __name__ == "__main__":
    print(ask("Reply with exactly one word: pong"))
