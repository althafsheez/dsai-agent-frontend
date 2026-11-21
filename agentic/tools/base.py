from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any, Dict
from google.genai import types


class BaseTool(ABC):
    """
    Abstract base class for all agentic tools.
    Subclasses define their name, description, parameters schema,
    and execution logic.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique identifier for the tool used in Gemini function calling."""
        ...

    @property
    @abstractmethod
    def description(self) -> str:
        """Detailed instructions to the LLM on when and how to invoke this tool."""
        ...

    @property
    @abstractmethod
    def parameters_schema(self) -> Dict[str, Any]:
        """JSON schema defining the expected arguments."""
        ...

    def to_gemini_declaration(self) -> types.FunctionDeclaration:
        """Convert tool metadata to Google GenAI FunctionDeclaration."""
        return types.FunctionDeclaration(
            name=self.name,
            description=self.description,
            parameters_json_schema=self.parameters_schema,
        )

    @abstractmethod
    def execute(self, **kwargs: Any) -> Dict[str, Any]:
        """Execute the tool synchronously or asynchronously and return a result dict."""
        ...
