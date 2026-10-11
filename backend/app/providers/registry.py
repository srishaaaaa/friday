from __future__ import annotations

from .base import Provider


class ProviderRegistry:
    def __init__(self, providers: list[Provider]):
        self._p = {p.id: p for p in providers}

    def get(self, provider_id: str) -> Provider | None:
        return self._p.get(provider_id)

    def all(self) -> list[Provider]:
        return list(self._p.values())

    def register(self, provider: Provider) -> None:
        """Add another provider adapter (see README: 'Adding a provider')."""
        self._p[provider.id] = provider
