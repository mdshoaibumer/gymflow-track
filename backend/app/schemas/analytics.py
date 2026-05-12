from pydantic import BaseModel


class RevenueTrendPoint(BaseModel):
    period: str
    revenue_paise: int
    payment_count: int


class RevenueSummary(BaseModel):
    total_revenue_paise: int
    previous_period_revenue_paise: int
    growth_percent: float | None
    average_revenue_paise: int
    pending_dues_paise: int
    best_collection_day: str | None
    collection_rate_percent: float


class RevenueTrendResponse(BaseModel):
    granularity: str
    data: list[RevenueTrendPoint]
    summary: RevenueSummary


class PlanDistribution(BaseModel):
    plan: str
    member_count: int
    percentage: float
    revenue_contribution_paise: int


class MembershipDistributionResponse(BaseModel):
    distributions: list[PlanDistribution]
    total_members: int
    most_popular_plan: str | None


class KPICard(BaseModel):
    key: str
    label: str
    value: int | float | str
    previous_value: int | float | str | None
    growth_percent: float | None
    unit: str


class DashboardKPIsResponse(BaseModel):
    kpis: list[KPICard]
    period_label: str
