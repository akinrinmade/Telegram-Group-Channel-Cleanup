from __future__ import annotations

import os
import asyncio
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from telethon import TelegramClient
from telethon.errors import FloodWaitError
from telethon.tl.types import Channel, Chat, User

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


class TelegramService:
    def __init__(self) -> None:
        self.client: TelegramClient | None = None
        self.api_id, self.api_hash, self.session_name = self._load_config()
        self._operation_lock = asyncio.Lock()
        self._membership_cache: list[dict[str, Any]] | None = None
        self._membership_cache_at = 0.0
        self._cache_ttl_seconds = 20.0

    def _load_config(self) -> tuple[int, str, str]:
        api_id = os.getenv("TELEGRAM_API_ID") or "0"
        api_hash = os.getenv("TELEGRAM_API_HASH") or ""
        session_name = os.getenv("TELEGRAM_SESSION") or "telegram_cleanup"
        return int(api_id), api_hash, session_name

    def _session_candidates(self) -> list[str]:
        candidates = [self.session_name] if self.session_name else []
        for env_name in ["TELEGRAM_SESSION", "TELEGRAM_SESSION_NAME"]:
            value = os.getenv(env_name)
            if value:
                candidates.append(value)
        candidates.extend(["telegram_cleanup", "tg_cleanup", "telethon_session"])
        seen: set[str] = set()
        unique: list[str] = []
        for item in candidates:
            if item and item not in seen:
                seen.add(item)
                unique.append(item)
        return unique

    def _can_connect(self) -> bool:
        return bool(self.api_id and self.api_hash)

    def get_client(self) -> TelegramClient:
        if self.client is not None:
            return self.client
        if not self._can_connect():
            raise RuntimeError("Telegram API credentials are not configured in the backend environment.")

        session_name = self._session_candidates()[0]
        self.client = TelegramClient(session_name, self.api_id, self.api_hash)
        return self.client

    async def ensure_connected(self) -> tuple[bool, str | None, int]:
        async with self._operation_lock:
            client = self.get_client()
            try:
                await client.connect()
            except Exception:
                return False, None, 0

            if not await client.is_user_authorized():
                return False, None, 0

            me = await client.get_me()
            memberships = await self._read_memberships(client)
            return True, me.first_name or me.username or "Telegram account", len(memberships)

    async def get_memberships(self) -> list[dict[str, Any]]:
        async with self._operation_lock:
            client = self.get_client()
            await client.connect()
            return await self._read_memberships(client)

    async def _read_memberships(self, client: TelegramClient) -> list[dict[str, Any]]:
        if self._membership_cache is not None and time.monotonic() - self._membership_cache_at < self._cache_ttl_seconds:
            return self._membership_cache
        memberships = await self._get_memberships(client)
        self._membership_cache = memberships
        self._membership_cache_at = time.monotonic()
        return memberships

    async def _get_memberships(self, client: TelegramClient) -> list[dict[str, Any]]:
        dialogs = await client.get_dialogs(limit=5000)
        memberships: list[dict[str, Any]] = []
        for dialog in dialogs:
            if not getattr(dialog, "name", None):
                continue
            is_channel = isinstance(dialog.entity, Channel) and not dialog.entity.megagroup
            is_group = isinstance(dialog.entity, (Chat, Channel))
            if not is_channel and not is_group:
                continue
            status = "unclassified"
            protected = False
            membership = {
                "id": str(dialog.id),
                "name": dialog.name,
                "type": "channel" if is_channel else "group",
                "category": "Other",
                "status": status,
                "protected": protected,
                "description": None,
                "raw_type": type(dialog.entity).__name__,
            }
            memberships.append(membership)
        return memberships

    async def leave_membership(self, membership_id: str) -> tuple[bool, str | None]:
        async with self._operation_lock:
            client = self.get_client()
            await client.connect()
            try:
                dialog = await client.get_dialogs()
                target = next((item for item in dialog if str(item.id) == str(membership_id)), None)
                if target is None:
                    return False, "Membership not found in account dialogs."
                await client.delete_dialog(target.entity, revoke=True)
                return True, None
            except FloodWaitError as exc:
                return False, f"Flood wait: {exc.seconds} seconds"
            except Exception as exc:
                return False, str(exc)
