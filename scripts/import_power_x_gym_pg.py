import psycopg2
import zipfile
import openpyxl
import os
import re
import json
import uuid
from datetime import datetime, date, timezone
import xml.etree.ElementTree as ET

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

excel_path = os.getenv("EXCEL_PATH", os.path.join(PROJECT_ROOT, "POWER X GYM   (Autosaved) (Autosaved).xlsx"))
if not os.path.exists(excel_path):
    excel_path = r"E:\gymflow\gym-management-system\POWER X GYM   (Autosaved) (Autosaved).xlsx"

uploads_paths = [
    os.path.join(PROJECT_ROOT, "backend", "uploads"),
    os.path.join(PROJECT_ROOT, "uploads")
]

dummy_phone_counter = 9900000001

def get_today_ist_date():
    return date.today()

def parse_and_format_date(val):
    if val is None:
        return None
    if isinstance(val, (datetime, date)):
        return val.strftime("%Y-%m-%d")
    
    s_orig = str(val).strip()
    if not s_orig:
        return None
        
    # Try parsing original string with spaces / month names
    for fmt in (
        "%B %d, %Y", "%b %d, %Y", "%d %B %Y", "%d %b %Y", "%B %d %Y", "%b %d %Y", 
        "%d-%b-%y", "%d-%B-%y", "%d-%b-%Y", "%d-%B-%Y",
        "%B%d%Y", "%b%d%Y", "%d%B%Y", "%d%b%Y"
    ):
        try:
            dt = datetime.strptime(s_orig, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
            
    s = s_orig.replace("--", "-").replace("//", "/").replace("..", ".").replace(" ", "")
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%d.%m.%Y", "%Y.%m.%d"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
            
    try:
        float_val = float(s)
        if 10000 < float_val < 100000:
            dt = datetime.fromordinal(datetime(1899, 12, 30).toordinal() + int(float_val))
            return dt.strftime("%Y-%m-%d")
    except ValueError:
        pass
        
    print(f"Warning: Could not parse date value '{val}', setting to None.")
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

def load_image_mappings():
    print("Parsing drawings relationships...")
    with zipfile.ZipFile(excel_path, 'r') as z:
        try:
            rels_xml = z.read("xl/drawings/_rels/drawing1.xml.rels")
            rels_root = ET.fromstring(rels_xml)
        except KeyError:
            print("No drawings relationships found.")
            return {}
            
        ns_rels = {"rel": "http://schemas.openxmlformats.org/package/2006/relationships"}
        rid_to_target = {}
        for rel in rels_root.findall(".//rel:Relationship", ns_rels):
            rid = rel.get("Id")
            target = rel.get("Target")
            if target:
                filename = target.split("/")[-1]
                rid_to_target[rid] = filename
                
        try:
            drawings_xml = z.read("xl/drawings/drawing1.xml")
            root = ET.fromstring(drawings_xml)
        except KeyError:
            print("No drawings XML found.")
            return {}
            
        namespaces = {
            'xdr': 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
            'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
            'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
        }
        
        row_to_images = {}
        
        for anchor_type in ['twoCellAnchor', 'oneCellAnchor']:
            for anchor in root.findall(f".//xdr:{anchor_type}", namespaces):
                from_elem = anchor.find("xdr:from", namespaces)
                if from_elem is not None:
                    col_elem = from_elem.find("xdr:col", namespaces)
                    row_elem = from_elem.find("xdr:row", namespaces)
                    
                    if col_elem is not None and row_elem is not None:
                        col = int(col_elem.text)
                        row = int(row_elem.text)
                        
                        blip = anchor.find(".//a:blip", namespaces)
                        if blip is not None:
                            embed_id = blip.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed")
                            if embed_id in rid_to_target:
                                image_name = rid_to_target[embed_id]
                                if row not in row_to_images:
                                    row_to_images[row] = image_name
                                    
        print(f"Loaded mappings for {len(row_to_images)} rows.")
        return row_to_images


def find_image_for_block(start_row, end_row, row_to_images):
    for r in range(start_row, end_row):
        if r in row_to_images:
            return row_to_images[r]
    return None

def parse_excel_members():
    print("Loading workbook...")
    wb = openpyxl.load_workbook(excel_path, read_only=True, data_only=True)
    sheet = wb['Sheet1']
    
    rows = list(sheet.iter_rows(values_only=True))
    total_rows = len(rows)
    print(f"Loaded {total_rows} rows from Excel.")
    
    row_to_images = load_image_mappings()
    
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
                details_row = rows[i+1]
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
                        "image_filename": image_file
                    })
                i = j
                continue
        i += 1

    print(f"Extracted {len(members)} active members with image mapping references.")
    return members

def import_into_db(members):
    db_url = os.getenv("DATABASE_URL_SYNC", "postgresql://gymflowtrack:gymflowtrack@localhost:5432/gymflowtrack")
    conn = psycopg2.connect(db_url)
    cursor = conn.cursor()
    
    # 1. Fetch user and their gym_id
    email_target = "enr.mdshoaib@gmail.com"
    cursor.execute("SELECT gym_id FROM users WHERE email = %s", (email_target,))
    res = cursor.fetchone()
    if not res:
        print(f"User {email_target} not found in PostgreSQL. Creating it automatically...")
        gym_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        
        # Insert Gym
        slug = f"power-x-gym-{gym_id[:6]}"
        cursor.execute(
            "INSERT INTO gyms (id, name, slug, phone, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, %s)",
            (gym_id, "Power X Gym", slug, "9900000000", datetime.now(timezone.utc), datetime.now(timezone.utc))
        )
        # Insert User
        cursor.execute(
            "INSERT INTO users (id, email, name, phone, password_hash, role, is_active, gym_id, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (user_id, email_target, "Admin", "9900000000", "dummy_hash", "owner", True, gym_id, datetime.now(timezone.utc), datetime.now(timezone.utc))
        )
        conn.commit()
    else:
        gym_id = res[0]
        if not gym_id:
            print(f"User {email_target} is not associated with any gym_id.")
            conn.close()
            return
        
    print(f"Found gym_id {gym_id} for user {email_target}")
    
    # Rename gym to "Power X Gym"
    cursor.execute("""
        UPDATE gyms 
        SET name = 'Power X Gym'
        WHERE id = %s
    """, (gym_id,))
    print(f"Updated gym {gym_id} name to 'Power X Gym'")
    
    # 2. Get existing phone numbers for this gym in PostgreSQL
    cursor.execute("SELECT phone FROM members WHERE gym_id = %s AND is_deleted = false", (gym_id,))
    existing_phones = {r[0] for r in cursor.fetchall()}
    print(f"Found {len(existing_phones)} existing member phone numbers in PostgreSQL for gym {gym_id}.")
    
    imported_count = 0
    skipped_count = 0
    photo_count = 0
    
    now_dt = datetime.now(timezone.utc)
    
    with zipfile.ZipFile(excel_path, 'r') as z:
        for m in members:
            phone = m["phone"]
            if not phone:
                phone = get_next_dummy_phone()
                
            if phone in existing_phones:
                skipped_count += 1
                continue
                
            member_id = str(uuid.uuid4())
            photo_url = None
            
            # Extract and save photo if present
            if m["image_filename"]:
                _, ext = os.path.splitext(m["image_filename"])
                ext = ext.lower()
                if ext not in (".png", ".jpeg", ".jpg", ".webp"):
                    ext = ".png"
                    
                image_zip_path = f"xl/media/{m['image_filename']}"
                try:
                    image_bytes = z.read(image_zip_path)
                    
                    for uploads_dir in uploads_paths:
                        target_dir = os.path.join(uploads_dir, "members", str(gym_id))
                        os.makedirs(target_dir, exist_ok=True)
                        target_file = os.path.join(target_dir, f"{member_id}{ext}")
                        with open(target_file, "wb") as img_file:
                            img_file.write(image_bytes)
                            
                    photo_url = f"/uploads/members/{gym_id}/{member_id}{ext}"
                    photo_count += 1
                except KeyError:
                    pass
            
            today = get_today_ist_date()
            status = "active"
            start_date = m["adms_date"]
            end_date = m["renewal_date"]
            
            if end_date:
                try:
                    dt_end = datetime.strptime(end_date, "%Y-%m-%d").date()
                    if dt_end < today:
                        status = "expired"
                except ValueError:
                    pass
            elif not start_date and not end_date:
                status = "pending"
                
            custom_fields = {}
            if m["payment_pending"]:
                custom_fields["payment_pending"] = m["payment_pending"]
                
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
                json.dumps(custom_fields), 0, False, now_dt, now_dt
            ))
            
            existing_phones.add(phone)
            imported_count += 1
            
    conn.commit()
    conn.close()
    print(f"PostgreSQL import complete: {imported_count} imported, {skipped_count} skipped, {photo_count} photos linked.")

def main():
    print("Starting PostgreSQL import script...")
    members = parse_excel_members()
    import_into_db(members)
    print("\nAll imports completed!")

if __name__ == "__main__":
    main()
