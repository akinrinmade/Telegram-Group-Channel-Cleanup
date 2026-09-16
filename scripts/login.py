from __future__ import annotations

import asyncio
from pathlib import Path

from dotenv import dotenv_values
from telethon import TelegramClient


async def main() -> None:
    config = dotenv_values(Path(__file__).resolve().parents[1] / "backend" / ".env")
    api_id = int(config.get("TELEGRAM_API_ID") or "0")
    api_hash = config.get("TELEGRAM_API_HASH") or ""
    session_name = config.get("TELEGRAM_SESSION") or "telegram_cleanup"

    if not api_id or not api_hash:
        raise SystemExit("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in backend/.env first.")

    client = TelegramClient(session_name, api_id, api_hash)
    try:
        await client.start()
        account = await client.get_me()
        print(f"Authenticated as {account.first_name or account.username or 'Telegram account'}.")
        print(f"Session saved locally as: {session_name}")
    finally:
        await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
