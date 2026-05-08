from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class GymResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    phone: str
    email: str | None
    address: str | None
    city: str | None
    is_active: bool

    model_config = {"from_attributes": True}


class GymUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=200)
    phone: str | None = Field(None, pattern=r"^[6-9]\d{9}$")
    email: EmailStr | None = None
    address: str | None = None
    city: str | None = None
