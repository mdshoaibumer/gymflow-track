"""
Onboarding service — setup wizard, demo data, CSV member import.

Design philosophy:
- Gym owners are non-technical. Every step must be obvious.
- The "aha moment" is seeing THEIR gym with THEIR members listed.
- Demo data lets them explore without risk. Import lets them migrate fast.
- Onboarding status is computed (not stored) — no extra table needed.

CSV Import strategy:
- Two-phase: preview → commit
- Preview: Parse CSV, validate each row, detect duplicates, return preview
- Commit: Only import valid rows, skip duplicates, return result
- Rollback: If commit fails mid-way, the DB transaction rolls back everything
- Phone normalization: Strip +91, spaces, dashes (Indian mobile numbers)

Demo data strategy:
- Realistic Indian names, phone numbers, gym plans
- Members with varied statuses (active, expired, pending)
- Payments spread across recent weeks
- Equipment from common gym categories
- All seeded with the gym's ID (tenant-safe)
"""

import csv
import io
import logging
import random
import re
from datetime import date, timedelta
from uuid import UUID, uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.models.asset import Asset, AssetCategory, AssetStatus
from app.models.feedback import Feedback, FeedbackCategory
from app.models.member import Gender, Member, MembershipStatus
from app.repositories.member_repository import MemberRepository

logger = logging.getLogger("gymflow.onboarding")


# === Onboarding Status ===

async def get_onboarding_status(db: AsyncSession, gym_id: UUID, gym_name: str) -> dict:
    """
    Compute onboarding progress from existing data.
    No stored state needed — derived from actual usage.
    """
    member_count = (await db.execute(
        select(func.count()).select_from(Member).where(Member.gym_id == gym_id)
    )).scalar_one()

    # Import these lazily to avoid circular imports at module level
    from app.models.payment import Payment
    from app.models.attendance import Attendance

    has_payments = (await db.execute(
        select(func.count()).select_from(Payment).where(Payment.gym_id == gym_id)
    )).scalar_one() > 0

    has_attendance = (await db.execute(
        select(func.count()).select_from(Attendance).where(Attendance.gym_id == gym_id)
    )).scalar_one() > 0

    has_equipment = (await db.execute(
        select(func.count()).select_from(Asset).where(Asset.gym_id == gym_id)
    )).scalar_one() > 0

    has_members = member_count > 0

    return {
        "gym_name": gym_name,
        "has_members": has_members,
        "member_count": member_count,
        "has_attendance": has_attendance,
        "has_payments": has_payments,
        "has_equipment": has_equipment,
        "onboarding_complete": has_members,  # Minimum: at least some members added
    }


# === Demo Data Seeding ===

_DEMO_NAMES = [
    ("Rahul Sharma", "male"), ("Priya Patel", "female"), ("Amit Kumar", "male"),
    ("Sneha Reddy", "female"), ("Vikram Singh", "male"), ("Anjali Gupta", "female"),
    ("Rohit Verma", "male"), ("Neha Joshi", "female"), ("Arjun Nair", "male"),
    ("Pooja Mehta", "female"), ("Suresh Yadav", "male"), ("Kavitha Rao", "female"),
    ("Deepak Jain", "male"), ("Swati Mishra", "female"), ("Manoj Tiwari", "male"),
    ("Ritu Agarwal", "female"), ("Sanjay Dubey", "male"), ("Divya Chauhan", "female"),
    ("Kiran Patil", "male"), ("Meera Iyer", "female"), ("Rajesh Khanna", "male"),
    ("Sunita Devi", "female"), ("Aakash Thakur", "male"), ("Nandini Shetty", "female"),
    ("Prakash Hegde", "male"),
]

_DEMO_PLANS = [
    ("Monthly", 30, 150000),    # ₹1,500
    ("Quarterly", 90, 400000),  # ₹4,000
    ("Half-Yearly", 180, 700000),  # ₹7,000
    ("Annual", 365, 1200000),   # ₹12,000
]

_DEMO_EQUIPMENT = [
    ("Treadmill #1", "TM-001", AssetCategory.CARDIO, "Life Fitness", 18000000),
    ("Treadmill #2", "TM-002", AssetCategory.CARDIO, "Life Fitness", 18000000),
    ("Elliptical", "EL-001", AssetCategory.CARDIO, "Technogym", 15000000),
    ("Bench Press", "BP-001", AssetCategory.STRENGTH, "Hammer Strength", 8000000),
    ("Smith Machine", "SM-001", AssetCategory.STRENGTH, "Body-Solid", 12000000),
    ("Leg Press", "LP-001", AssetCategory.STRENGTH, "Precor", 10000000),
    ("Dumbbell Set (5-30kg)", "DB-001", AssetCategory.FREE_WEIGHTS, "Generic", 6000000),
    ("Kettlebell Set", "KB-001", AssetCategory.FUNCTIONAL, "Rogue", 3000000),
    ("Battle Ropes", "BR-001", AssetCategory.FUNCTIONAL, "Generic", 500000),
    ("Yoga Mats (10)", "YM-001", AssetCategory.ACCESSORIES, "Generic", 300000),
]


async def seed_demo_data(
    db: AsyncSession,
    gym_id: UUID,
    include_members: bool = True,
    include_payments: bool = True,
    include_equipment: bool = True,
    member_count: int = 15,
) -> dict:
    """
    Seed realistic demo data for exploration.

    All data is tagged with the gym_id — no cross-tenant leakage.
    Idempotent-ish: checks if demo data already exists (by member count).
    """
    result = {"members_created": 0, "payments_created": 0, "equipment_created": 0}
    today = date.today()

    if include_members:
        # Check if gym already has members (don't double-seed)
        existing = (await db.execute(
            select(func.count()).select_from(Member).where(Member.gym_id == gym_id)
        )).scalar_one()

        if existing > 0:
            logger.info(f"Gym {gym_id} already has {existing} members, skipping demo members")
        else:
            names = random.sample(_DEMO_NAMES, min(member_count, len(_DEMO_NAMES)))
            for i, (name, gender) in enumerate(names):
                plan_name, plan_days, plan_cost = random.choice(_DEMO_PLANS)
                # Vary start dates — some recent, some older
                days_ago = random.randint(5, 200)
                start = today - timedelta(days=days_ago)
                end = start + timedelta(days=plan_days)

                # Determine status based on dates
                if end < today:
                    status = MembershipStatus.EXPIRED
                elif random.random() < 0.1:
                    status = MembershipStatus.FROZEN
                else:
                    status = MembershipStatus.ACTIVE

                phone = f"{random.choice([6,7,8,9])}{random.randint(100000000, 999999999)}"

                member = Member(
                    id=uuid4(),
                    gym_id=gym_id,
                    name=name,
                    phone=phone,
                    gender=Gender(gender),
                    membership_plan=plan_name,
                    membership_start=start,
                    membership_end=end,
                    membership_status=status,
                    amount_paid=plan_cost,
                )
                db.add(member)
                result["members_created"] += 1

            await db.flush()

    if include_payments and result["members_created"] > 0:
        from app.models.payment import Payment, PaymentMethod, PaymentStatus

        # Create payments for the members we just created
        members_result = await db.execute(
            select(Member).where(Member.gym_id == gym_id).limit(member_count)
        )
        members = list(members_result.scalars().all())

        for member in members:
            if member.amount_paid > 0:
                payment = Payment(
                    id=uuid4(),
                    gym_id=gym_id,
                    member_id=member.id,
                    amount_in_paise=member.amount_paid,
                    payment_method=random.choice([PaymentMethod.CASH, PaymentMethod.UPI, PaymentMethod.BANK_TRANSFER]),
                    payment_status=PaymentStatus.COMPLETED,
                    notes=f"{member.membership_plan} membership",
                    payment_date=member.membership_start or today,
                )
                db.add(payment)
                result["payments_created"] += 1

        await db.flush()

    if include_equipment:
        existing_equip = (await db.execute(
            select(func.count()).select_from(Asset).where(Asset.gym_id == gym_id)
        )).scalar_one()

        if existing_equip > 0:
            logger.info(f"Gym {gym_id} already has equipment, skipping demo equipment")
        else:
            for name, code, category, manufacturer, cost in _DEMO_EQUIPMENT:
                asset = Asset(
                    id=uuid4(),
                    gym_id=gym_id,
                    name=name,
                    asset_code=code,
                    category=category,
                    manufacturer=manufacturer,
                    purchase_cost_in_paise=cost,
                    purchase_date=today - timedelta(days=random.randint(30, 365)),
                    warranty_expiry=today + timedelta(days=random.randint(180, 730)),
                    status=AssetStatus.ACTIVE,
                )
                db.add(asset)
                result["equipment_created"] += 1

            await db.flush()

    logger.info(f"Demo data seeded for gym {gym_id}: {result}")
    return result


# === CSV Member Import ===

def _normalize_phone(raw: str) -> str:
    """
    Normalize Indian phone numbers.
    Handles: +91XXXXXXXXXX, 91XXXXXXXXXX, 0XXXXXXXXXX, XXXXXXXXXX
    Strips spaces, dashes, dots.
    """
    digits = re.sub(r"[^\d]", "", raw)
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    if digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    return digits


def _validate_phone(phone: str) -> list[str]:
    """Validate Indian mobile number format."""
    if not re.match(r"^[6-9]\d{9}$", phone):
        return ["Invalid Indian mobile number"]
    return []


def _normalize_gender(raw: str) -> str | None:
    """Normalize gender values to our enum."""
    val = raw.strip().lower()
    if val in ("male", "m", "पुरुष"):
        return "male"
    if val in ("female", "f", "महिला"):
        return "female"
    if val in ("other", "o", "अन्य"):
        return "other"
    return None


def _parse_amount(raw: str) -> int | None:
    """
    Parse an amount string to paise (integer).
    "1500" → 150000, "1,500.00" → 150000, "₹1500" → 150000
    """
    if not raw:
        return None
    cleaned = re.sub(r"[₹$,\s]", "", raw.strip())
    try:
        amount = float(cleaned)
        return int(amount * 100)  # Convert rupees to paise
    except (ValueError, TypeError):
        return None


def detect_csv_columns(csv_content: str) -> dict:
    """
    Step 1: Parse CSV headers and auto-detect column mappings.

    Returns detection result with:
    - mappings: auto-detected field → column assignments with confidence
    - unmapped_columns: columns we couldn't figure out
    - missing_required: required fields not found
    - sample_data: first few rows for user preview
    - all_csv_columns: full list of headers
    - target_fields: all available target fields with labels
    """
    from app.services.column_mapper import ColumnMapper, TARGET_FIELDS

    reader = csv.DictReader(io.StringIO(csv_content))

    if not reader.fieldnames:
        raise ValidationError("CSV file is empty or has no headers")

    headers = [h.strip() for h in reader.fieldnames if h.strip()]
    if not headers:
        raise ValidationError("CSV file has no valid column headers")

    # Read sample rows for content-based detection
    sample_rows: list[dict[str, str]] = []
    for i, row in enumerate(reader):
        if i >= 5:  # 5 sample rows is enough for content inference
            break
        sample_rows.append(dict(row))

    # Run detection
    mapper = ColumnMapper(headers)
    result = mapper.detect(sample_rows=sample_rows)

    return {
        "mappings": [
            {
                "csv_column": m.csv_column,
                "target_field": m.target_field,
                "confidence": m.confidence,
                "match_method": m.match_method,
            }
            for m in result.mappings.values()
        ],
        "unmapped_columns": result.unmapped_columns,
        "missing_required": result.missing_required,
        "all_csv_columns": headers,
        "sample_data": result.sample_data[:3],
        "target_fields": [
            {"field": f, "label": info["label"], "required": info["required"]}
            for f, info in TARGET_FIELDS.items()
        ],
    }


def parse_csv_with_mapping(
    csv_content: str,
    gym_id: UUID,
    existing_phones: set[str],
    column_overrides: dict[str, str | None] | None = None,
) -> dict:
    """
    Step 2: Parse CSV content using auto-detected + user-overridden column mappings.

    Flow:
    1. Auto-detect columns (same as detect_csv_columns)
    2. Apply user overrides (if any)
    3. Parse each row using the final mapping
    4. Validate and return preview

    column_overrides: {target_field: csv_column_name_or_None}
    """
    from app.services.column_mapper import (
        ColumnMapper,
        apply_mapping,
        build_mapping_from_overrides,
    )

    reader = csv.DictReader(io.StringIO(csv_content))
    if not reader.fieldnames:
        raise ValidationError("CSV file is empty or has no headers")

    headers = [h.strip() for h in reader.fieldnames if h.strip()]

    # Re-read for sample detection
    all_rows: list[dict[str, str]] = []
    csv_reader = csv.DictReader(io.StringIO(csv_content))
    for row in csv_reader:
        all_rows.append(dict(row))
        if len(all_rows) > 502:  # Max 500 data rows + buffer
            break

    # Auto-detect
    mapper = ColumnMapper(headers)
    detection = mapper.detect(sample_rows=all_rows[:5])

    # Apply user overrides
    final_mappings = detection.mappings
    if column_overrides:
        final_mappings = build_mapping_from_overrides(
            detection.mappings, column_overrides
        )

    # Check required fields after overrides
    if "name" not in final_mappings:
        raise ValidationError(
            "No 'name' column detected. Please map a column to 'Member Name'."
        )
    if "phone" not in final_mappings:
        raise ValidationError(
            "No 'phone' column detected. Please map a column to 'Phone / Mobile'."
        )

    # Parse rows with the final mapping
    rows = []
    valid = 0
    duplicates = 0
    invalid = 0

    for i, raw_row in enumerate(all_rows, start=2):  # Row 1 is header
        if i > 502:
            break

        mapped = apply_mapping(raw_row, final_mappings)

        name = (mapped.get("name", "") or "").strip()
        phone_raw = (mapped.get("phone", "") or "").strip()
        email = mapped.get("email")
        gender_raw = mapped.get("gender", "")
        plan = mapped.get("membership_plan")
        start = mapped.get("membership_start")
        end = mapped.get("membership_end")
        amount_raw = mapped.get("amount_paid", "")

        phone = _normalize_phone(phone_raw)
        gender = _normalize_gender(gender_raw) if gender_raw else None
        amount_paise = _parse_amount(amount_raw) if amount_raw else None
        errors: list[str] = []

        # Validate required fields
        if not name or len(name) < 2:
            errors.append("Name is required (min 2 characters)")
        if not phone_raw:
            errors.append("Phone is required")
        else:
            errors.extend(_validate_phone(phone))

        # Determine row status
        if errors:
            status = "invalid"
            invalid += 1
        elif phone in existing_phones:
            status = "duplicate"
            duplicates += 1
        else:
            status = "valid"
            valid += 1
            existing_phones.add(phone)

        rows.append({
            "row_number": i,
            "name": name,
            "phone": phone,
            "email": email or None,
            "gender": gender,
            "membership_plan": plan or None,
            "membership_start": start or None,
            "membership_end": end or None,
            "amount_paid": amount_paise,
            "status": status,
            "errors": errors,
        })

    return {
        "total_rows": len(rows),
        "valid": valid,
        "duplicates": duplicates,
        "invalid": invalid,
        "column_mappings": [
            {
                "csv_column": m.csv_column,
                "target_field": m.target_field,
                "confidence": m.confidence,
                "match_method": m.match_method,
            }
            for m in final_mappings.values()
        ],
        "rows": rows,
    }


def parse_csv_preview(
    csv_content: str,
    gym_id: UUID,
    existing_phones: set[str],
) -> dict:
    """
    Legacy preview function — kept for backward compatibility.
    Delegates to parse_csv_with_mapping with no overrides.
    """
    return parse_csv_with_mapping(csv_content, gym_id, existing_phones)


async def commit_csv_import(
    db: AsyncSession,
    gym_id: UUID,
    rows: list[dict],
    skip_duplicates: bool = True,
    skip_invalid: bool = True,
) -> dict:
    """
    Commit previewed CSV import to the database.

    Transaction safety: All-or-nothing. If any row fails to insert,
    the entire transaction rolls back (handled by get_db dependency).
    """
    imported = 0
    skipped_dup = 0
    skipped_inv = 0
    errors = []

    for row in rows:
        if row["status"] == "duplicate":
            if skip_duplicates:
                skipped_dup += 1
                continue
        elif row["status"] == "invalid":
            if skip_invalid:
                skipped_inv += 1
                continue

        if row["status"] != "valid":
            continue

        try:
            # Parse dates if provided
            start_date = _parse_date(row.get("membership_start")) if row.get("membership_start") else None
            end_date = _parse_date(row.get("membership_end")) if row.get("membership_end") else None

            # Parse gender
            gender_val = None
            if row.get("gender"):
                try:
                    gender_val = Gender(row["gender"])
                except ValueError:
                    pass  # Skip invalid gender, don't block import

            # Parse amount (already in paise from parse_csv_with_mapping, or raw string from legacy)
            amount = 0
            if row.get("amount_paid") is not None:
                if isinstance(row["amount_paid"], int):
                    amount = row["amount_paid"]
                elif isinstance(row["amount_paid"], str):
                    amount = _parse_amount(row["amount_paid"]) or 0

            # Determine membership status from dates
            status = MembershipStatus.ACTIVE
            if end_date and end_date < date.today():
                status = MembershipStatus.EXPIRED
            elif not start_date and not end_date:
                status = MembershipStatus.PENDING

            member = Member(
                id=uuid4(),
                gym_id=gym_id,
                name=row["name"],
                phone=row["phone"],
                email=row.get("email"),
                gender=gender_val,
                membership_plan=row.get("membership_plan"),
                membership_start=start_date,
                membership_end=end_date,
                membership_status=status,
                amount_paid=amount,
            )
            db.add(member)
            imported += 1
        except Exception as e:
            errors.append(f"Row {row['row_number']}: {str(e)}")

    if imported > 0:
        await db.flush()

    logger.info(f"CSV import for gym {gym_id}: {imported} imported, {skipped_dup} dup, {skipped_inv} invalid")
    return {
        "imported": imported,
        "skipped_duplicates": skipped_dup,
        "skipped_invalid": skipped_inv,
        "errors": errors,
    }


# === Feedback ===

async def create_feedback(
    db: AsyncSession,
    gym_id: UUID,
    user_id: UUID,
    category: str,
    message: str,
    page: str | None = None,
) -> Feedback:
    """Save user feedback."""
    fb = Feedback(
        id=uuid4(),
        gym_id=gym_id,
        user_id=user_id,
        category=FeedbackCategory(category),
        message=message,
        page=page,
    )
    db.add(fb)
    await db.flush()
    logger.info(f"Feedback received from gym {gym_id}: [{category}] {message[:50]}...")
    return fb


# === Helpers ===


def _parse_date(value: str | None) -> date | None:
    """Parse a date string in various formats."""
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d"):
        try:
            return date.fromisoformat(value) if fmt == "%Y-%m-%d" else date(*__import__("time").strptime(value, fmt)[:3])
        except (ValueError, TypeError):
            continue
    return None
