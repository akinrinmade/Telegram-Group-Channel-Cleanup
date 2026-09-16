from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.classifier import classify_memberships
from app.models import CleanupRequest, HealthResponse, MembershipRecord, StatusResponse
from app.telegram_service import TelegramService

telegram_service = TelegramService()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="Telegram Cleanup", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/status", response_model=StatusResponse)
async def status() -> dict[str, Any]:
    try:
        connected, account_name, count = await telegram_service.ensure_connected()
        return {
            "connected": connected,
            "account_name": account_name,
            "membership_count": count,
        }
    except Exception:
        return {"connected": False, "account_name": None, "membership_count": 0}


@app.get("/api/memberships")
async def get_memberships() -> list[dict[str, Any]]:
    try:
        memberships = await telegram_service.get_memberships()
        return classify_memberships(memberships)
    except Exception as exc:  # pragma: no cover - should be handled at runtime
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/memberships/refresh")
async def refresh_memberships() -> list[dict[str, Any]]:
    return await get_memberships()


@app.post("/api/memberships/classify")
async def classify_membership_list(payload: dict[str, Any]) -> list[dict[str, Any]]:
    memberships = payload.get("memberships", [])
    return classify_memberships(memberships)


@app.post("/api/memberships/protect")
async def protect_memberships(payload: dict[str, Any]) -> dict[str, Any]:
    ids = payload.get("membership_ids", [])
    protected = payload.get("protected", True)
    return {"protected": protected, "membership_ids": ids, "message": "Protection preference stored locally in the browser."}


@app.post("/api/cleanup")
async def cleanup(payload: CleanupRequest) -> dict[str, Any]:
    if payload.confirmation != "LEAVE_CONFIRMED":
        raise HTTPException(status_code=400, detail="Explicit cleanup confirmation is required.")
    membership_ids = payload.membership_ids
    protected_ids = set(payload.protected_ids)
    if not membership_ids:
        raise HTTPException(status_code=400, detail="No membership IDs provided.")

    blocked = []
    results = []
    for membership_id in membership_ids:
        if membership_id in protected_ids:
            blocked.append(membership_id)
            results.append({"id": membership_id, "name": membership_id, "status": "blocked", "error": "Protected membership cannot be left."})
            continue

        success, error = await telegram_service.leave_membership(membership_id)
        results.append({
            "id": membership_id,
            "name": membership_id,
            "status": "success" if success else "failed",
            "error": error,
        })

    return {
        "success": True,
        "processed": len(results),
        "total": len(membership_ids),
        "results": results,
        "protected_blocked": blocked,
    }


@app.get("/api/cleanup/{job_id}")
async def get_cleanup_status(job_id: str) -> dict[str, Any]:
    return {"job_id": job_id, "status": "queued"}


@app.get("/api/cleanup/{job_id}/results")
async def get_cleanup_results(job_id: str) -> dict[str, Any]:
    return {"job_id": job_id, "results": []}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
