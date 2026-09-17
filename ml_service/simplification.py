from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

MAPPING_PATH = Path(__file__).with_name("terminology.json")


@lru_cache(maxsize=1)
def mapping() -> dict[str, dict[str, str]]:
    with MAPPING_PATH.open(encoding="utf-8") as source:
        return json.load(source)


def simplify(term: str) -> tuple[str | None, str | None]:
    item = mapping().get(term.casefold().strip())
    if not item:
        return None, None
    return item["plain"], item["context"]
