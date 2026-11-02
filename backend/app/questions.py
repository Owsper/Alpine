"""The question bank and the first session's question set.

Each category probes specific scoring dimensions, which is what lets /next aim questions at weak spots.
"""

import random

BANK: dict[str, list[str]] = {
    "opening": [
        "Tell me about yourself.",
        "Walk me through your CV in two minutes.",
        "What should I know about you that is not on your CV?",
        "How would a former teammate describe you?",
    ],
    "motivation": [
        "Why do you want to work at {company}?",
        "Why are you interested in the {role} position?",
        "What do you know about {company} and what it does?",
        "Where do you see yourself in three to five years?",
    ],
    "behavioral": [
        "Tell me about a time you had to learn a new technology under a tight deadline.",
        "Describe a time you disagreed with a teammate. How did you handle it?",
        "Tell me about a mistake you made and what you learned from it.",
        "Describe a project that did not go as planned. What happened?",
        "Tell me about a time you had to manage several priorities at once.",
        "Give me an example of a time you led without being the official lead.",
        "Tell me about a time you received critical feedback. How did you respond?",
        "Tell me about a decision you made with incomplete information.",
    ],
    "evidence": [
        "Tell me about your biggest achievement so far. How did you measure it?",
        "Give me an example of a goal you set and how you reached it, with numbers if you can.",
        "Describe something you improved. What was it like before and after?",
    ],
    "role": [
        "Walk me through how you would debug a problem you have never seen before.",
        "Tell me about the most technically challenging thing you have built.",
        "How do you make sure the code you write is reliable?",
        "Describe how you would approach your first month as a {role}.",
        "Which tools or technologies are you strongest in, and how did you learn them?",
    ],
    "concise": [
        "In one minute: what is the project you are proudest of?",
        "Explain your last project to someone who is not technical, briefly.",
    ],
}

# Which dimensions each category gives the grader the most signal on.
PROBES: dict[str, list[str]] = {
    "opening": ["Relevance", "Conciseness"],
    "motivation": ["Company fit", "Relevance"],
    "behavioral": ["STAR", "Evidence"],
    "evidence": ["Evidence", "STAR"],
    "role": ["Role knowledge", "Relevance"],
    "concise": ["Conciseness", "Relevance"],
}

FIRST_SESSION = [("opening", "anchor"), ("behavioral", "new"), ("role", "new"), ("behavioral", "new"), ("motivation", "anchor")]


def question(category: str, kind: str, text: str, number: int) -> dict:
    return {"id": f"q{number}", "text": text, "kind": kind, "category": category, "probes": PROBES[category]}


def fill(template: str, job: dict) -> str:
    return template.format(company=job["company"], role=job["title"])


def pick(category: str, job: dict, used: set[str], rng: random.Random) -> str:
    options = [fill(t, job) for t in BANK[category]]
    fresh = [t for t in options if t not in used] or options
    choice = rng.choice(fresh)
    used.add(choice)
    return choice


def first_session(job: dict, seed: int | None = None) -> list[dict]:
    rng = random.Random(seed)
    used: set[str] = set()
    return [question(cat, kind, pick(cat, job, used, rng), i) for i, (cat, kind) in enumerate(FIRST_SESSION, start=1)]


def categories_for(dimension: str) -> list[str]:
    """Categories whose first probed dimension is this one, best match first."""
    primary = [cat for cat, dims in PROBES.items() if dims[0] == dimension]
    secondary = [cat for cat, dims in PROBES.items() if dimension in dims[1:]]
    return primary + secondary
