from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ProviderEvent:
    type: str
    data: dict[str, Any]


class RunnerCancelled(Exception):
    pass


class RunnerSteered(Exception):
    def __init__(self, instructions: list[str]):
        super().__init__("The active run received a steering instruction.")
        self.instructions = instructions


@dataclass(frozen=True)
class RunnerEvent:
    type: str
    data: dict[str, Any]
