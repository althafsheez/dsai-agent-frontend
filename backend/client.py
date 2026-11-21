from typing import Dict
from google import genai

# Persistent client connection pool to reuse SSL/HTTP2 connections across turns and requests
_CLIENT_POOL: Dict[str, genai.Client] = {}


def get_shared_client(api_key: str) -> genai.Client:
    """
    Retrieve or create a cached, thread-safe genai.Client instance for the given API key.
    Reuses underlying HTTP/2 connection pools across requests.
    """
    if api_key not in _CLIENT_POOL:
        _CLIENT_POOL[api_key] = genai.Client(api_key=api_key)
    return _CLIENT_POOL[api_key]
