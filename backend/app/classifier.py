from __future__ import annotations

import re
from typing import Iterable


CRYPTO_KEYWORDS = {
    "crypto": [
        "crypto",
        "bitcoin",
        "btc",
        "ethereum",
        "eth",
        "solana",
        "sol",
        "trading",
        "forex",
        "token",
        "airdrop",
        "airdrops",
        "meme",
        "coin",
        "nft",
        "defi",
        "altcoin",
        "pump",
        "whale",
        "signal",
    ],
    "trading": ["trading", "signals", "fx", "forex", "chart", "market"],
    "airdrops": ["airdrop", "giveaway", "claim", "faucet"],
    "games": ["game", "gaming", "guild", "arena", "playtoearn", "p2e"],
    "announcement": ["announcement", "updates", "official", "news"],
    "duplicate": ["duplicate", "clone", "archive", "old project", "old chat"],
    "old_projects": ["old project", "legacy", "retired", "archive"],
}


def classify_membership(name: str, category: str | None = None) -> str:
    text = f"{name} {category or ''}".lower()
    for label, keywords in CRYPTO_KEYWORDS.items():
        if any(keyword in text for keyword in keywords):
            return label
    return "unclassified"


def classify_memberships(memberships: Iterable[dict]) -> list[dict]:
    updated = []
    for membership in memberships:
        classification = classify_membership(membership.get("name", ""), membership.get("category"))
        result = dict(membership)
        result["category"] = classification if classification != "unclassified" else (membership.get("category") or "Other")
        result["status"] = "review" if classification != "unclassified" else membership.get("status", "unclassified")
        updated.append(result)
    return updated
