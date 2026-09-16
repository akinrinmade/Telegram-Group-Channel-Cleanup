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
        session_name = self._normalize_session_path(os.getenv("TELEGRAM_SESSION") or "telegram_cleanup")
        return int(api_id), api_hash, session_name

    @staticmethod
    def _normalize_session_path(session_name: str) -> str:
        lowered = session_name.lower()
        rootfs_marker = "\\localstate\\rootfs\\"
        if rootfs_marker in lowered:
            suffix_start = lowered.index(rootfs_marker) + len(rootfs_marker)
            return "/" + session_name[suffix_start:].replace("\\", "/")
        return session_name

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
        self.client = TelegramClient(
            session_name,
            self.api_id,
            self.api_hash,
            connection_retries=1,
            retry_delay=1,
            timeout=15,
        )
        return self.client

    async def _connect(self) -> TelegramClient:
        client = self.get_client()
        try:
            if not client.is_connected():
                await asyncio.wait_for(client.connect(), timeout=20)
            if not await asyncio.wait_for(client.is_user_authorized(), timeout=20):
                raise RuntimeError("Telegram session is not authorized.")
            return client
        except Exception:
            try:
                await client.disconnect()
            except Exception:
                pass
            self.client = None
            raise

    async def ensure_connected(self) -> tuple[bool, str | None, int]:
        async with self._operation_lock:
            try:
                client = await self._connect()
                me = await asyncio.wait_for(client.get_me(), timeout=30)
                memberships = await self._read_memberships(client)
            except Exception:
                return False, None, 0
            return True, me.first_name or me.username or "Telegram account", len(memberships)

    async def get_memberships(self) -> list[dict[str, Any]]:
        async with self._operation_lock:
            client = await self._connect()
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
        results = await self.leave_memberships([membership_id])
        result = results[0]
        return result["status"] == "success", result.get("error")

    async def leave_memberships(self, membership_ids: list[str]) -> list[dict[str, str | None]]:
        async with self._operation_lock:
            try:
                client = await self._connect()
                dialogs = await asyncio.wait_for(client.get_dialogs(limit=5000), timeout=90)
                targets = {str(item.id): item for item in dialogs}
                results: list[dict[str, str | None]] = []
                for membership_id in membership_ids:
                    target = targets.get(str(membership_id))
                    if target is None:
                        results.append({"id": str(membership_id), "status": "failed", "error": "Membership not found in account dialogs."})
                        continue
                    try:
                        await client.delete_dialog(target.entity, revoke=True)
                        results.append({"id": str(membership_id), "status": "success", "error": None})
                    except FloodWaitError as exc:
                        results.append({"id": str(membership_id), "status": "failed", "error": f"Flood wait: {exc.seconds} seconds"})
                    except Exception as exc:
                        results.append({"id": str(membership_id), "status": "failed", "error": str(exc)})
                self._membership_cache = None
                return results
            except Exception as exc:
                self.client = None
                return [{"id": str(membership_id), "status": "failed", "error": str(exc)} for membership_id in membership_ids]
