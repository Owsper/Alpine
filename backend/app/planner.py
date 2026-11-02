"""The next session: 60 % weak-spot questions, 20 % anchor repeats, 20 % new.

With five questions that is 3 aimed at the two weakest dimensions, 1 repeated anchor (so progress is
measured on the same question), and 1 from a category not asked yet.
"""

import random

from . import questions as qb

MIX = {"weak": 3, "anchor": 1, "new": 1}


def plan(job: dict, previous_questions: list[dict], weak_dims: list[str], asked_before: set[str], seed: int | None = None) -> list[dict]:
    rng = random.Random(seed)
    used = set(asked_before)
    picked: list[tuple[str, str, str]] = []

    # Weak spots first, alternating between the two weakest dimensions.
    for i in range(MIX["weak"]):
        dim = weak_dims[i % len(weak_dims)] if weak_dims else "STAR"
        category = qb.categories_for(dim)[0]
        picked.append((category, "weak", qb.pick(category, job, used, rng)))

    # The anchor repeats a question from last time word for word, so the scores are comparable.
    anchors = [q for q in previous_questions if q.get("kind") == "anchor"] or previous_questions
    anchor = rng.choice(anchors)
    picked.append((anchor.get("category", "opening"), "anchor", anchor["text"]))

    # One genuinely new angle: a category that was not asked in the previous session.
    seen_categories = {q.get("category") for q in previous_questions}
    fresh = [c for c in qb.BANK if c not in seen_categories] or list(qb.BANK)
    category = rng.choice(fresh)
    picked.append((category, "new", qb.pick(category, job, used, rng)))

    # The anchor goes first, as a warm-up the candidate has seen before.
    picked.sort(key=lambda item: 0 if item[1] == "anchor" else 1)
    return [qb.question(cat, kind, text, n) for n, (cat, kind, text) in enumerate(picked, start=1)]
