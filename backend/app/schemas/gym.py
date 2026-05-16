from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.sanitize import strip_html_tags


class GymResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    phone: str
    email: str | None
    address: str | None
    city: str | None
    logo_url: str | None = None
    is_active: bool

    model_config = {"from_attributes": True}


class GymUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=200)
    phone: str | None = Field(None, pattern=r"^[6-9]\d{9}$")
    email: EmailStr | None = None
    address: str | None = None
    city: str | None = None

    @field_validator("name", "address", "city")
    @classmethod
    def sanitize_text_fields(cls, v: str | None) -> str | None:
        return strip_html_tags(v) if v else v
