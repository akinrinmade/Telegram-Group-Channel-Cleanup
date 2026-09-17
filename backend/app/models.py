from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


MembershipType = Literal["group", "channel"]
MembershipStatus = Literal["keep", "remove", "review", "unclassified"]


class MembershipRecord(BaseModel):
    id: str
    name: str
    type: MembershipType
    category: str = "Other"
    status: MembershipStatus = "unclassified"
    protected: bool = False
    description: str | None = None
    raw_type: str | None = None


class StatusResponse(BaseModel):
    connected: bool
    account_name: str | None = None
    membership_count: int = 0
    message: str | None = None


class HealthResponse(BaseModel):
    status: str = "ok"


class CleanupRequest(BaseModel):
    confirmation: Literal["LEAVE_CONFIRMED"]
    membership_ids: list[str] = Field(default_factory=list)
    protected_ids: list[str] = Field(default_factory=list)


class CleanupProgressItem(BaseModel):
    id: str
    name: str
    status: str
    error: str | None = None


class CleanupResult(BaseModel):
    success: bool
    processed: int = 0
    total: int = 0
    results: list[CleanupProgressItem] = Field(default_factory=list)
    protected_blocked: list[str] = Field(default_factory=list)


class ClassificationRequest(BaseModel):
    membership_ids: list[str] = Field(default_factory=list)


class ProtectionRequest(BaseModel):
    membership_ids: list[str] = Field(default_factory=list)
    protected: bool = True
