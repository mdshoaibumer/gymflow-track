from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class CheckInByQRRequest(BaseModel):
    qr_token: str


class ManualCheckInRequest(BaseModel):
    member_id: UUID


class AttendanceResponse(BaseModel):
    id: UUID
    gym_id: UUID
    member_id: UUID
    check_in_at: datetime
    check_out_at: datetime | None
    check_in_date: date
    status: str
    source: str
    recorded_by: UUID | None
    member_name: str | None = None
    member_phone: str | None = None

    model_config = {"from_attributes": True}


class AttendanceListResponse(BaseModel):
    attendance: list[AttendanceResponse]
    total: int


class AttendanceStatsResponse(BaseModel):
    checked_in_today: int
    currently_in_gym: int
    total_this_week: int


class QRTokenResponse(BaseModel):
    qr_token: str
    member_id: UUID
    member_name: str


class DailyCount(BaseModel):
    date: date
    count: int


class AttendanceTrendResponse(BaseModel):
    trend: list[DailyCount]
