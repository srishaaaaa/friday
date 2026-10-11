from __future__ import annotations

import hmac

from fastapi import Request

from .errors import AppError


async def require_token(request: Request) -> None:
    expected: str = request.app.state.settings.token
    supplied = request.headers.get("x-friday-token", "")
    if not expected or not hmac.compare_digest(expected.encode(), supplied.encode()):
        raise AppError(401, "unauthorized", "Missing or invalid local API token.")


class SecretStore:
    """API-key storage via the OS credential vault (Windows Credential Manager) using keyring.

    If no usable vault exists the key is held in memory for this session only; it is never
    written to the database, logs or disk by FRIDAY.
    """

    SERVICE = "FRIDAY"

    def __init__(self) -> None:
        self._mem: dict[str, str] = {}
        self._vault_ok = False
        self._keyring = None
        try:
            import keyring
            from keyring.backends.fail import Keyring as FailKeyring

            self._keyring = keyring
            self._vault_ok = not isinstance(keyring.get_keyring(), FailKeyring)
        except Exception:  # noqa: BLE001
            pass

    @property
    def persistent(self) -> bool:
        return self._vault_ok

    def get(self, name: str) -> str | None:
        if self._vault_ok:
            try:
                return self._keyring.get_password(self.SERVICE, name)
            except Exception:  # noqa: BLE001
                pass
        return self._mem.get(name)

    def set(self, name: str, value: str) -> None:
        if self._vault_ok:
            try:
                self._keyring.set_password(self.SERVICE, name, value)
                return
            except Exception:  # noqa: BLE001
                self._vault_ok = False
        self._mem[name] = value

    def delete(self, name: str) -> None:
        self._mem.pop(name, None)
        if self._vault_ok:
            try:
                self._keyring.delete_password(self.SERVICE, name)
            except Exception:  # noqa: BLE001
                pass


class MemorySecretStore(SecretStore):
    """In-memory only; used by tests."""

    def __init__(self) -> None:
        self._mem = {}
        self._vault_ok = False
        self._keyring = None
