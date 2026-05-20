#!/usr/bin/env python3
"""
GymFlow Track — Generic Gym Member Import Script
=================================================
Imports members from an Excel file into the GymFlow database.
Supports both PostgreSQL (production) and SQLite (local dev).

Usage:
    # PostgreSQL (production/staging)
    python scripts/import_gym_members.py \
        --gym-name "Power X Gym" \
        --owner-email "owner@example.com" \
        --excel-file "/path/to/members.xlsx"

    # SQLite (local dev)
    python scripts/import_gym_members.py \
        --gym-name "Power X Gym" \
        --owner-email "owner@example.com" \
        --excel-file "/path/to/members.xlsx" \
        --db sqlite \
        --sqlite-path backend/gymflow_dev.db

    # Dry run (parse only, don't write to DB)
    python scripts/import_gym_members.py \
        --gym-name "My Gym" \
        --owner-email "me@gym.com" \
        --excel-file "data.xlsx" \
        --dry-run
"""

import argparse
import json
import os
import re
import sqlite3
import uuid
import xml.etree.ElementTree as ET
import zipfile
from datetime import date, datetime, timezone

try:
    import openpyxl
except ImportError:
    print("ERROR: openpyxl not installed. Run: pip install openpyxl")
    exit(1)

try:
    import psycopg2
except ImportError:
    psycopg2 = None

# ── Constants ────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

UPLOADS_PATHS = [
    os.path.join(PROJECT_ROOT, "backend", "uploads"),
    os.path.join(PROJECT_ROOT, "uploads"),
]

dummy_phone_counter = 9900000001


# ── Utility Functions ────────────────────────────────────────

def get_today_date():
    return date.today()


def parse_and_format_date(val):
    if val is None:
        return None
    if isinstance(val, (datetime, date)):
        return val.strftime("%Y-%m-%d")

    s_orig = str(val).strip()
    if not s_orig:
        return None

    # Try month-name formats first
    for fmt in (
        "%B %d, %Y", "%b %d, %Y", "%d %B %Y", "%d %b %Y",
        "%B %d %Y", "%b %d %Y", "%d-%b-%y", "%d-%B-%y",
        "%d-%b-%Y", "%d-%B-%Y",
    ):
        try:
            return datetime.strptime(s_orig, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue

    # Normalize separators
    s = s_orig.replace("--", "-").replace("//", "/").replace("..", ".").replace(" ", "")
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%d.%m.%Y", "%Y.%m.%d"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue

    # Excel serial date number
    try:
        float_val = float(s)
        if 10000 < float_val < 100000:
            dt = datetime.fromordinal(datetime(1899, 12, 30).toordinal() + int(float_val))
            return dt.strftime("%Y-%m-%d")
    except ValueError:
        pass

    print(f"  Warning: Could not parse date '{val}', setting to None.")
    return None


def clean_phone(val):
    if val is None:
        return ""
    s = str(val).strip()
    if not s:
        return ""
    if s.endswith(".0"):
        s = s[:-2]
    digits = re.sub(r"\D", "", s)
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    if digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    return digits


def get_next_dummy_phone():
    global dummy_phone_counter
    p = str(dummy_phone_counter)
    dummy_phone_counter += 1
    return p


def slugify(name):
    """Convert gym name to URL-friendly slug."""
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug


# ── Excel Parsing ────────────────────────────────────────────

def load_image_mappings(excel_path):
    """Parse embedded images from Excel drawings XML."""
    print("  Parsing image drawings from Excel...")
    try:
        with zipfile.ZipFile(excel_path, "r") as z:
            try:
                rels_xml = z.read("xl/drawings/_rels/drawing1.xml.rels")
                rels_root = ET.fromstring(rels_xml)
            except KeyError:
                print("  No drawings relationships found.")
                return {}

            ns_rels = {"rel": "http://schemas.openxmlformats.org/package/2006/relationships"}
            rid_to_target = {}
            for rel in rels_root.findall(".//rel:Relationship", ns_rels):
                rid = rel.get("Id")
                target = rel.get("Target")
                if target:
                    rid_to_target[rid] = target.split("/")[-1]

            try:
                drawings_xml = z.read("xl/drawings/drawing1.xml")
                root = ET.fromstring(drawings_xml)
            except KeyError:
                print("  No drawings XML found.")
                return {}

            namespaces = {
                "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
                "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
                "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
            }

            row_to_images = {}
            for anchor_type in ["twoCellAnchor", "oneCellAnchor"]:
                for anchor in root.findall(f".//xdr:{anchor_type}", namespaces):
                    from_elem = anchor.find("xdr:from", namespaces)
                    if from_elem is not None:
                        col_elem = from_elem.find("xdr:col", namespaces)
                        row_elem = from_elem.find("xdr:row", namespaces)
                        if col_elem is not None and row_elem is not None:
                            row = int(row_elem.text)
                            blip = anchor.find(".//a:blip", namespaces)
                            if blip is not None:
                                embed_id = blip.get(
                                    "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"
                                )
                                if embed_id in rid_to_target:
                                    if row not in row_to_images:
                                        row_to_images[row] = rid_to_target[embed_id]

            print(f"  Found image mappings for {len(row_to_images)} rows.")
            return row_to_images
    except zipfile.BadZipFile:
        print("  ERROR: File is not a valid .xlsx (zip) file.")
        return {}


def find_image_for_block(start_row, end_row, row_to_images):
    for r in range(start_row, end_row):
        if r in row_to_images:
            return row_to_images[r]
    return None


def parse_excel_members(excel_path):
    """Parse member data from the Excel file."""
    print(f"\nParsing Excel: {excel_path}")
    if not os.path.exists(excel_path):
        print(f"ERROR: Excel file not found: {excel_path}")
        return []

    wb = openpyxl.load_workbook(excel_path, read_only=True, data_only=True)
    sheet = wb["Sheet1"]

    rows = list(sheet.iter_rows(values_only=True))
    total_rows = len(rows)
    print(f"  Loaded {total_rows} rows from Excel.")

    row_to_images = load_image_mappings(excel_path)

    members = []
    i = 1
    while i < total_rows:
        row = rows[i]
        sl_no = row[0]

        is_sl = False
        if sl_no is not None:
            try:
                int(str(sl_no).strip())
                is_sl = True
            except ValueError:
                pass

        if is_sl:
            if i + 1 < total_rows:
                details_row = rows[i + 1]
                name = details_row[2]
                phone = details_row[3]
                adms_date = details_row[4]
                renewal_date = details_row[5]
                payment_pending = details_row[6]

                plan_lines = []
                j = i + 2
                while j < total_rows:
                    next_row = rows[j]
                    next_sl = next_row[0]
                    is_next_sl = False
                    if next_sl is not None:
                        try:
                            int(str(next_sl).strip())
                            is_next_sl = True
                        except ValueError:
                            pass
                    if is_next_sl:
                        break
                    non_empty = [v for v in next_row if v is not None and str(v).strip()]
                    if not non_empty:
                        j += 1
                        continue
                    extra_name = next_row[2]
                    if extra_name and str(extra_name).strip():
                        plan_lines.append(str(extra_name).strip())
                    j += 1

                plan = " ".join(plan_lines)
                name_clean = str(name).strip() if name else ""
                phone_clean = clean_phone(phone)

                if name_clean or phone_clean:
                    image_file = find_image_for_block(i, j, row_to_images)
                    members.append({
                        "name": name_clean,
                        "phone": phone_clean,
                        "adms_date": parse_and_format_date(adms_date),
                        "renewal_date": parse_and_format_date(renewal_date),
                        "payment_pending": str(payment_pending).strip() if payment_pending else "",
                        "plan": plan.strip(),
                        "image_filename": image_file,
                    })
                i = j
                continue
        i += 1

    print(f"  Extracted {len(members)} members.")
    return members


# ── Database Import: PostgreSQL ──────────────────────────────

def import_into_postgres(members, gym_name, owner_email, excel_path, dry_run=False):
    """Import members into PostgreSQL database."""
    if psycopg2 is None:
        print("ERROR: psycopg2 not installed. Run: pip install psycopg2-binary")
        return

    db_url = os.getenv("DATABASE_URL_SYNC", "postgresql://gymflowtrack:gymflowtrack@localhost:5432/gymflowtrack")
    print(f"\nConnecting to PostgreSQL...")
    conn = psycopg2.connect(db_url)
    cursor = conn.cursor()

    # 1. Find owner user → get gym_id
    cursor.execute("SELECT id, gym_id FROM users WHERE email = %s", (owner_email,))
    res = cursor.fetchone()

    if not res:
        print(f"  Owner '{owner_email}' not found. Creating gym + placeholder user...")
        gym_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        slug = slugify(gym_name) + f"-{gym_id[:6]}"
        now_dt = datetime.now(timezone.utc)

        if not dry_run:
            cursor.execute(
                "INSERT INTO gyms (id, name, slug, phone, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, %s)",
                (gym_id, gym_name, slug, "0000000000", now_dt, now_dt),
            )
            cursor.execute(
                "INSERT INTO users (id, email, name, phone, password_hash, role, is_active, gym_id, created_at, updated_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (user_id, owner_email, "Admin", "0000000000", "MUST_RESET", "owner", True, gym_id, now_dt, now_dt),
            )
            conn.commit()
        print(f"  Created gym '{gym_name}' (ID: {gym_id})")
    else:
        user_id, gym_id = res
        if not gym_id:
            print(f"  ERROR: User '{owner_email}' has no gym_id assigned. Aborting.")
            conn.close()
            return
        print(f"  Found gym_id: {gym_id} for owner: {owner_email}")

        # Update gym name
        if not dry_run:
            cursor.execute("UPDATE gyms SET name = %s WHERE id = %s", (gym_name, gym_id))

    # 2. Get existing phones to avoid duplicates
    cursor.execute("SELECT phone FROM members WHERE gym_id = %s AND is_deleted = false", (gym_id,))
    existing_phones = {r[0] for r in cursor.fetchall()}
    print(f"  Existing members in DB: {len(existing_phones)}")

    imported_count = 0
    skipped_count = 0
    photo_count = 0
    now_dt = datetime.now(timezone.utc)

    with zipfile.ZipFile(excel_path, "r") as z:
        for m in members:
            phone = m["phone"]
            if not phone:
                phone = get_next_dummy_phone()

            if phone in existing_phones:
                skipped_count += 1
                continue

            member_id = str(uuid.uuid4())
            photo_url = None

            # Extract photo
            if m["image_filename"]:
                _, ext = os.path.splitext(m["image_filename"])
                ext = ext.lower()
                if ext not in (".png", ".jpeg", ".jpg", ".webp"):
                    ext = ".png"

                image_zip_path = f"xl/media/{m['image_filename']}"
                try:
                    image_bytes = z.read(image_zip_path)
                    if not dry_run:
                        for uploads_dir in UPLOADS_PATHS:
                            target_dir = os.path.join(uploads_dir, "members", str(gym_id))
                            os.makedirs(target_dir, exist_ok=True)
                            target_file = os.path.join(target_dir, f"{member_id}{ext}")
                            with open(target_file, "wb") as img_file:
                                img_file.write(image_bytes)
                    photo_url = f"/uploads/members/{gym_id}/{member_id}{ext}"
                    photo_count += 1
                except KeyError:
                    pass

            today = get_today_date()
            status = "active"
            start_date = m["adms_date"]
            end_date = m["renewal_date"]

            if end_date:
                try:
                    if datetime.strptime(end_date, "%Y-%m-%d").date() < today:
                        status = "expired"
                except ValueError:
                    pass
            elif not start_date and not end_date:
                status = "pending"

            custom_fields = {}
            if m["payment_pending"]:
                custom_fields["payment_pending"] = m["payment_pending"]

            if not dry_run:
                cursor.execute("""
                    INSERT INTO members (
                        id, gym_id, name, phone, email, gender, date_of_birth, father_name,
                        batch, emergency_contact, membership_status, membership_start,
                        membership_end, membership_plan, amount_paid, photo_url,
                        custom_fields, version, is_deleted, created_at, updated_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s::jsonb, %s, %s, %s, %s
                    )
                """, (
                    member_id, gym_id, m["name"], phone, None, None, None, None,
                    None, None, status, start_date, end_date, m["plan"], 0, photo_url,
                    json.dumps(custom_fields), 0, False, now_dt, now_dt,
                ))

            existing_phones.add(phone)
            imported_count += 1

    if not dry_run:
        conn.commit()
    conn.close()

    prefix = "[DRY RUN] " if dry_run else ""
    print(f"\n  {prefix}PostgreSQL import complete:")
    print(f"    Imported: {imported_count}")
    print(f"    Skipped (duplicate phone): {skipped_count}")
    print(f"    Photos extracted: {photo_count}")


# ── Database Import: SQLite ──────────────────────────────────

def import_into_sqlite(members, gym_name, owner_email, excel_path, sqlite_path, dry_run=False):
    """Import members into SQLite database."""
    if not os.path.exists(sqlite_path):
        print(f"ERROR: SQLite database not found: {sqlite_path}")
        return

    print(f"\nConnecting to SQLite: {sqlite_path}")
    conn = sqlite3.connect(sqlite_path)
    cursor = conn.cursor()

    # 1. Find or create gym
    cursor.execute("SELECT id, name FROM gyms")
    gyms = cursor.fetchall()

    if not gyms:
        gym_id = str(uuid.uuid4())
        slug = slugify(gym_name)
        now_str = datetime.now(timezone.utc).isoformat()
        print(f"  No gyms found. Creating: {gym_name} (ID: {gym_id})")
        if not dry_run:
            cursor.execute("""
                INSERT INTO gyms (id, name, slug, phone, email, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (gym_id, gym_name, slug, "0000000000", owner_email, 1, now_str, now_str))
            cursor.execute("UPDATE users SET gym_id = ?", (gym_id,))
    else:
        gym_id = gyms[0][0]
        print(f"  Found existing gym: {gyms[0][1]} (ID: {gym_id})")
        if not dry_run:
            cursor.execute("UPDATE gyms SET name = ? WHERE id = ?", (gym_name, gym_id))

    # 2. Get existing phones
    cursor.execute("SELECT phone FROM members WHERE gym_id = ? AND is_deleted = 0", (gym_id,))
    existing_phones = {r[0] for r in cursor.fetchall()}
    print(f"  Existing members in DB: {len(existing_phones)}")

    imported_count = 0
    skipped_count = 0
    photo_count = 0

    with zipfile.ZipFile(excel_path, "r") as z:
        for m in members:
            phone = m["phone"]
            if not phone:
                phone = get_next_dummy_phone()

            if phone in existing_phones:
                skipped_count += 1
                continue

            member_id = str(uuid.uuid4())
            photo_url = None

            if m["image_filename"]:
                _, ext = os.path.splitext(m["image_filename"])
                ext = ext.lower()
                if ext not in (".png", ".jpeg", ".jpg", ".webp"):
                    ext = ".png"

                image_zip_path = f"xl/media/{m['image_filename']}"
                try:
                    image_bytes = z.read(image_zip_path)
                    if not dry_run:
                        for uploads_dir in UPLOADS_PATHS:
                            target_dir = os.path.join(uploads_dir, "members", gym_id)
                            os.makedirs(target_dir, exist_ok=True)
                            target_file = os.path.join(target_dir, f"{member_id}{ext}")
                            with open(target_file, "wb") as img_file:
                                img_file.write(image_bytes)
                    photo_url = f"/uploads/members/{gym_id}/{member_id}{ext}"
                    photo_count += 1
                except KeyError:
                    pass

            now_str = datetime.now(timezone.utc).isoformat()
            today = get_today_date()
            status = "active"
            start_date = m["adms_date"]
            end_date = m["renewal_date"]

            if end_date:
                try:
                    if datetime.strptime(end_date, "%Y-%m-%d").date() < today:
                        status = "expired"
                except ValueError:
                    pass
            elif not start_date and not end_date:
                status = "pending"

            custom_fields = {}
            if m["payment_pending"]:
                custom_fields["payment_pending"] = m["payment_pending"]

            if not dry_run:
                cursor.execute("""
                    INSERT INTO members (
                        id, gym_id, name, phone, email, gender, date_of_birth, father_name,
                        batch, emergency_contact, membership_status, membership_start,
                        membership_end, membership_plan, amount_paid, photo_url,
                        custom_fields, version, is_deleted, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    member_id, gym_id, m["name"], phone, None, None, None, None,
                    None, None, status, start_date, end_date, m["plan"], 0, photo_url,
                    json.dumps(custom_fields), 0, 0, now_str, now_str,
                ))

            existing_phones.add(phone)
            imported_count += 1

    if not dry_run:
        conn.commit()
    conn.close()

    prefix = "[DRY RUN] " if dry_run else ""
    print(f"\n  {prefix}SQLite import complete:")
    print(f"    Imported: {imported_count}")
    print(f"    Skipped (duplicate phone): {skipped_count}")
    print(f"    Photos extracted: {photo_count}")


# ── CLI ──────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Import gym members from Excel into GymFlow Track database.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Production (PostgreSQL)
  python scripts/import_gym_members.py \\
      --gym-name "Power X Gym" \\
      --owner-email "owner@powerxgym.com" \\
      --excel-file "POWER X GYM.xlsx"

  # Local dev (SQLite)
  python scripts/import_gym_members.py \\
      --gym-name "Iron Temple" \\
      --owner-email "admin@irontemple.com" \\
      --excel-file "data/iron_temple_members.xlsx" \\
      --db sqlite --sqlite-path backend/gymflow_dev.db

  # Dry run (preview without writing)
  python scripts/import_gym_members.py \\
      --gym-name "My Gym" \\
      --owner-email "me@mygym.com" \\
      --excel-file "members.xlsx" \\
      --dry-run
        """,
    )
    parser.add_argument("--gym-name", required=True, help="Name of the gym (e.g., 'Power X Gym')")
    parser.add_argument("--owner-email", required=True, help="Email of the gym owner in the system")
    parser.add_argument("--excel-file", required=True, help="Path to the Excel (.xlsx) file with member data")
    parser.add_argument(
        "--db",
        choices=["postgres", "sqlite"],
        default="postgres",
        help="Target database type (default: postgres)",
    )
    parser.add_argument("--sqlite-path", default=None, help="Path to SQLite DB file (required if --db sqlite)")
    parser.add_argument("--dry-run", action="store_true", help="Parse Excel and show stats without writing to DB")

    args = parser.parse_args()

    # Validate
    excel_path = os.path.abspath(args.excel_file)
    if not os.path.exists(excel_path):
        print(f"ERROR: Excel file not found: {excel_path}")
        exit(1)

    if args.db == "sqlite" and not args.sqlite_path:
        # Default SQLite path
        args.sqlite_path = os.path.join(PROJECT_ROOT, "backend", "gymflow_dev.db")

    print("=" * 60)
    print("GymFlow Track — Member Import")
    print("=" * 60)
    print(f"  Gym Name:    {args.gym_name}")
    print(f"  Owner Email: {args.owner_email}")
    print(f"  Excel File:  {excel_path}")
    print(f"  Database:    {args.db}")
    if args.dry_run:
        print(f"  Mode:        DRY RUN (no changes will be written)")
    print("=" * 60)

    # Parse Excel
    members = parse_excel_members(excel_path)
    if not members:
        print("\nNo members found in Excel. Check the file format.")
        exit(1)

    # Import
    if args.db == "postgres":
        import_into_postgres(members, args.gym_name, args.owner_email, excel_path, dry_run=args.dry_run)
    else:
        import_into_sqlite(members, args.gym_name, args.owner_email, excel_path, args.sqlite_path, dry_run=args.dry_run)

    print("\nDone!")


if __name__ == "__main__":
    main()
