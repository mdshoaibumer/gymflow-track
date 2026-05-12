"""
Smart CSV column mapper — auto-detects member fields from arbitrary headers.

The Problem:
────────────
Gym owners export data from Excel, Google Sheets, WhatsApp exports, or
billing software. Column names are wildly inconsistent:
  - "Member Name", "नाम", "Naam", "NAME", "member ka naam", "Full Name"
  - "Mobile No", "WhatsApp No", "फोन", "Contact", "Ph No."
  - Or completely unrecognizable headers

The Solution:
─────────────
Three-layer matching with confidence scoring:

  Layer 1 — Exact alias match (highest confidence):
    Header "mobile" → phone (confidence=1.0)

  Layer 2 — Substring/keyword match (medium confidence):
    Header "member_ka_phone_number" contains "phone" → phone (confidence=0.7)

  Layer 3 — Unmatched (returned to frontend for manual mapping):
    Header "xyz123" → unmapped, user must pick from dropdown

Hindi/Hinglish Support:
───────────────────────
Indian gym owners often mix Hindi and English in their spreadsheets.
We handle common transliterations:
  - "naam" (name), "phone/fon" (phone), "taareekh" (date)
  - Devanagari: "नाम", "फोन", "ईमेल", "लिंग"

Why not ML/NLP:
───────────────
- Overkill for ~8 target fields
- Deterministic matching is debuggable and predictable
- Alias dictionary is easy to extend based on real user CSVs
- Zero external dependencies

Usage:
  mapper = ColumnMapper(csv_headers=["Member Name", "WhatsApp No", "Plan"])
  result = mapper.detect()
  # result.mappings = {"name": ("Member Name", 1.0), "phone": ("WhatsApp No", 1.0)}
  # result.unmapped = []
"""

from dataclasses import dataclass
import re


# === Target Fields ===
# These are the member fields we want to map CSV columns into.

TARGET_FIELDS = {
    "name": {"required": True, "label": "Member Name"},
    "phone": {"required": True, "label": "Phone / Mobile"},
    "email": {"required": False, "label": "Email"},
    "gender": {"required": False, "label": "Gender"},
    "date_of_birth": {"required": False, "label": "Date of Birth"},
    "membership_plan": {"required": False, "label": "Membership Plan"},
    "membership_start": {"required": False, "label": "Start Date"},
    "membership_end": {"required": False, "label": "End Date / Expiry"},
    "amount_paid": {"required": False, "label": "Amount Paid"},
    "emergency_contact": {"required": False, "label": "Emergency Contact"},
    "address": {"required": False, "label": "Address"},
}


# === Alias Dictionary ===
# Each target field → list of known aliases (lowercase, underscored).
# Ordered roughly by frequency of occurrence in real Indian gym spreadsheets.

FIELD_ALIASES: dict[str, list[str]] = {
    "name": [
        # English
        "name", "member_name", "full_name", "member", "student_name",
        "first_name", "customer_name", "client_name", "person_name",
        "members_name", "member's_name", "participant",
        # Hindi transliteration
        "naam", "member_ka_naam", "naam_pura",
        # Devanagari
        "नाम", "सदस्य_का_नाम", "पूरा_नाम",
        # Common abbreviations
        "nm", "mbr_name",
    ],
    "phone": [
        # English
        "phone", "mobile", "phone_number", "mobile_number", "contact",
        "contact_number", "whatsapp", "whatsapp_number", "whatsapp_no",
        "cell", "cell_number", "telephone", "mobile_no", "phone_no",
        "mob", "mob_no", "mob_number", "contact_no", "ph_no", "ph",
        "primary_phone", "member_phone", "mobile_num",
        # Hindi transliteration
        "fon", "fone", "phone_no", "mobile_nambar",
        # Devanagari
        "फोन", "मोबाइल", "फोन_नंबर", "मोबाइल_नंबर", "संपर्क",
        "व्हाट्सएप",
    ],
    "email": [
        # English
        "email", "email_address", "e-mail", "e_mail", "mail",
        "email_id", "emailid", "member_email",
        # Hindi
        "ईमेल",
    ],
    "gender": [
        # English
        "gender", "sex", "m/f", "male/female",
        # Hindi transliteration
        "ling",
        # Devanagari
        "लिंग",
    ],
    "date_of_birth": [
        # English
        "date_of_birth", "dob", "birth_date", "birthday", "birthdate",
        "d.o.b", "d.o.b.", "date_of_birth_(dob)",
        # Hindi transliteration
        "janam_tithi", "janam_din",
        # Devanagari
        "जन्म_तिथि", "जन्मदिन",
    ],
    "membership_plan": [
        # English
        "membership_plan", "plan", "package", "subscription", "plan_name",
        "membership_type", "membership", "plan_type", "scheme", "batch",
        "program", "programme",
        # Hindi transliteration
        "yojna", "plan_naam",
        # Devanagari
        "योजना", "प्लान",
    ],
    "membership_start": [
        # English
        "membership_start", "start_date", "join_date", "joining_date",
        "start", "admission_date", "registration_date", "enrolled_on",
        "date_joined", "from_date", "from", "valid_from",
        # Hindi transliteration
        "shuru_date", "shamil_hone_ki_tarikh",
        # Devanagari
        "शुरू_तारीख", "शामिल_होने_की_तारीख",
    ],
    "membership_end": [
        # English
        "membership_end", "end_date", "expiry_date", "expiry", "expires",
        "valid_until", "valid_till", "expire_date", "renewal_date",
        "due_date", "to_date", "to", "valid_to", "end",
        # Hindi transliteration
        "khatam_date", "samapt_date",
        # Devanagari
        "समाप्ति_तारीख", "अंतिम_तारीख",
    ],
    "amount_paid": [
        # English
        "amount_paid", "amount", "fees", "fee", "payment", "paid",
        "total_amount", "fee_paid", "charges", "cost", "price",
        "membership_fee", "fees_paid", "amt", "amt_paid", "rupees",
        "inr", "total_fees", "subscription_amount",
        # Hindi transliteration
        "rashi", "paisa", "rakam", "bhugtan",
        # Devanagari
        "राशि", "पैसा", "रकम", "भुगतान", "फीस",
    ],
    "emergency_contact": [
        # English
        "emergency_contact", "emergency_phone", "emergency_number",
        "emergency_no", "guardian_phone", "parent_phone",
        "alternate_phone", "alt_phone", "secondary_phone",
        "alternate_contact", "alt_contact",
        # Devanagari
        "आपातकालीन_संपर्क",
    ],
    "address": [
        # English
        "address", "addr", "location", "residence", "home_address",
        "full_address", "member_address",
        # Hindi transliteration
        "pata",
        # Devanagari
        "पता", "पूरा_पता",
    ],
}

# Keywords that indicate a field (used for substring matching).
# Shorter/more specific keywords are better — avoids false positives.
FIELD_KEYWORDS: dict[str, list[str]] = {
    "name": ["name", "naam", "नाम"],
    "phone": ["phone", "mobile", "whatsapp", "contact", "mob", "फोन", "मोबाइल"],
    "email": ["email", "mail", "ईमेल"],
    "gender": ["gender", "sex", "लिंग"],
    "date_of_birth": ["birth", "dob", "जन्म"],
    "membership_plan": ["plan", "package", "membership", "scheme", "प्लान"],
    "membership_start": ["start", "join", "admission", "शुरू"],
    "membership_end": ["expiry", "expire", "end_date", "renewal", "valid_till", "समाप्ति"],
    "amount_paid": ["amount", "fee", "paid", "charges", "cost", "price", "राशि", "फीस"],
    "emergency_contact": ["emergency", "guardian", "alternate", "आपातकालीन"],
    "address": ["address", "addr", "location", "पता"],
}

# Disambiguation priorities: when multiple fields match the same column,
# prefer more specific fields. Lower number = higher priority.
_FIELD_PRIORITY: dict[str, int] = {
    "emergency_contact": 1,  # "emergency contact" should NOT match "contact" → phone
    "date_of_birth": 2,
    "membership_start": 3,
    "membership_end": 3,
    "membership_plan": 4,
    "amount_paid": 5,
    "gender": 6,
    "email": 7,
    "phone": 8,
    "name": 9,
    "address": 10,
}


@dataclass
class ColumnMapping:
    """A detected mapping from a CSV column to a target field."""
    csv_column: str        # Original header from the CSV
    target_field: str      # Our internal field name (e.g., "phone")
    confidence: float      # 0.0–1.0: how confident we are
    match_method: str      # "exact" | "keyword" | "fuzzy"


@dataclass
class MappingResult:
    """Complete result of column detection."""
    mappings: dict[str, ColumnMapping]   # target_field → mapping
    unmapped_columns: list[str]          # CSV columns we couldn't map
    missing_required: list[str]          # Required fields that weren't found
    sample_data: list[dict[str, str]]    # First 3 rows for preview


def _normalize_header(raw: str) -> str:
    """
    Normalize a CSV header for matching.

    "  Member Name  " → "member_name"
    "Phone No." → "phone_no"
    "M/F" → "m/f"
    """
    h = raw.strip().lower()
    # Replace common separators with underscore
    h = re.sub(r"[\s\-\.]+", "_", h)
    # Remove trailing underscores
    h = h.strip("_")
    return h


class ColumnMapper:
    """
    Detects which CSV columns map to which member fields.

    Usage:
        mapper = ColumnMapper(["Member Name", "WhatsApp No", "Plan", "Unknown Col"])
        result = mapper.detect(sample_rows=[...])
    """

    def __init__(self, csv_headers: list[str]):
        self.raw_headers = csv_headers
        self.normalized: dict[str, str] = {}  # normalized → original
        for h in csv_headers:
            norm = _normalize_header(h)
            if norm:  # Skip empty headers
                self.normalized[norm] = h

    def detect(self, sample_rows: list[dict[str, str]] | None = None) -> MappingResult:
        """
        Run all detection layers and return the best mapping.

        Layers (in priority order):
        1. Exact alias match
        2. Keyword/substring match
        3. Content-based inference (looks at actual data values)

        Conflict resolution:
        - If two fields want the same column, the higher-priority field wins
        - If one field has exact match and another has keyword match, exact wins
        """
        # Track: csv_normalized_header → list of (target_field, confidence, method)
        candidates: dict[str, list[tuple[str, float, str]]] = {
            norm: [] for norm in self.normalized
        }

        # Layer 1: Exact alias matching
        self._match_exact(candidates)

        # Layer 2: Keyword/substring matching
        self._match_keywords(candidates)

        # Layer 3: Content-based inference (if sample data provided)
        if sample_rows:
            self._match_by_content(candidates, sample_rows)

        # Resolve conflicts and build final mapping
        return self._resolve(candidates, sample_rows)

    def _match_exact(self, candidates: dict[str, list[tuple[str, float, str]]]) -> None:
        """Layer 1: Check each header against the full alias list."""
        for norm_header in candidates:
            for target_field, aliases in FIELD_ALIASES.items():
                if norm_header in aliases:
                    candidates[norm_header].append((target_field, 1.0, "exact"))

    def _match_keywords(self, candidates: dict[str, list[tuple[str, float, str]]]) -> None:
        """Layer 2: Check if header CONTAINS a known keyword."""
        for norm_header in candidates:
            # Skip headers that already have an exact match
            if any(conf == 1.0 for _, conf, _ in candidates[norm_header]):
                continue

            for target_field, keywords in FIELD_KEYWORDS.items():
                for kw in keywords:
                    if kw in norm_header:
                        # Confidence based on how much of the header is the keyword
                        ratio = len(kw) / max(len(norm_header), 1)
                        confidence = 0.5 + (ratio * 0.3)  # 0.5–0.8 range
                        candidates[norm_header].append(
                            (target_field, round(confidence, 2), "keyword")
                        )
                        break  # One keyword match per field is enough

    def _match_by_content(
        self,
        candidates: dict[str, list[tuple[str, float, str]]],
        sample_rows: list[dict[str, str]],
    ) -> None:
        """
        Layer 3: Infer field type from actual cell values.

        Heuristics:
        - Column where most values are 10-digit numbers starting with 6-9 → phone
        - Column where most values contain '@' → email
        - Column where values are mostly "male"/"female"/"m"/"f" → gender
        - Column where values look like dates → date field
        - Column with mostly numeric values → amount
        """
        for norm_header in candidates:
            # Skip if already high-confidence match
            if any(conf >= 0.8 for _, conf, _ in candidates[norm_header]):
                continue

            original = self.normalized[norm_header]
            values = [
                (row.get(original, "") or "").strip()
                for row in sample_rows
                if (row.get(original, "") or "").strip()
            ]
            if not values:
                continue

            # Phone detection: 10-digit Indian mobile numbers
            phone_pattern = re.compile(r"^[+]?[0-9\s\-]{10,13}$")
            phone_matches = sum(1 for v in values if phone_pattern.match(re.sub(r"[^\d+]", "", v)))
            if phone_matches / len(values) >= 0.6:
                candidates[norm_header].append(("phone", 0.6, "content"))

            # Email detection
            email_matches = sum(1 for v in values if "@" in v and "." in v)
            if email_matches / len(values) >= 0.6:
                candidates[norm_header].append(("email", 0.7, "content"))

            # Gender detection
            gender_values = {"male", "female", "m", "f", "other", "पुरुष", "महिला"}
            gender_matches = sum(1 for v in values if v.lower() in gender_values)
            if gender_matches / len(values) >= 0.6:
                candidates[norm_header].append(("gender", 0.7, "content"))

            # Pure number detection (amount)
            number_pattern = re.compile(r"^[₹$]?\s*[\d,]+\.?\d*$")
            num_matches = sum(1 for v in values if number_pattern.match(v.strip()))
            if num_matches / len(values) >= 0.7:
                candidates[norm_header].append(("amount_paid", 0.4, "content"))

            # Date detection
            date_pattern = re.compile(
                r"^\d{1,4}[-/\.]\d{1,2}[-/\.]\d{1,4}$"
            )
            date_matches = sum(1 for v in values if date_pattern.match(v.strip()))
            if date_matches / len(values) >= 0.6:
                # Could be start or end date — low confidence, user will pick
                candidates[norm_header].append(("membership_start", 0.3, "content"))

    def _resolve(
        self,
        candidates: dict[str, list[tuple[str, float, str]]],
        sample_rows: list[dict[str, str]] | None,
    ) -> MappingResult:
        """
        Resolve conflicts and produce the final mapping.

        Rules:
        1. Each target field can only be mapped once (highest confidence wins)
        2. Each CSV column can only be mapped to one target field
        3. Higher-confidence match always wins over lower
        4. On tie, field priority breaks the tie
        """
        # Build all candidate pairs: (confidence, priority, csv_header, target_field, method)
        all_pairs: list[tuple[float, int, str, str, str]] = []
        for norm_header, matches in candidates.items():
            for target_field, confidence, method in matches:
                priority = _FIELD_PRIORITY.get(target_field, 99)
                all_pairs.append((confidence, -priority, norm_header, target_field, method))

        # Sort by confidence DESC, then priority (negated so lower number = higher priority)
        all_pairs.sort(key=lambda x: (x[0], x[1]), reverse=True)

        used_columns: set[str] = set()
        used_fields: set[str] = set()
        mappings: dict[str, ColumnMapping] = {}

        for confidence, _, norm_header, target_field, method in all_pairs:
            if norm_header in used_columns or target_field in used_fields:
                continue
            mappings[target_field] = ColumnMapping(
                csv_column=self.normalized[norm_header],
                target_field=target_field,
                confidence=confidence,
                match_method=method,
            )
            used_columns.add(norm_header)
            used_fields.add(target_field)

        # Unmapped columns
        unmapped = [
            self.normalized[norm]
            for norm in self.normalized
            if norm not in used_columns
        ]

        # Missing required fields
        missing_required = [
            f for f, info in TARGET_FIELDS.items()
            if info["required"] and f not in mappings
        ]

        # Sample data
        sample = []
        if sample_rows:
            sample = sample_rows[:3]

        return MappingResult(
            mappings=mappings,
            unmapped_columns=unmapped,
            missing_required=missing_required,
            sample_data=sample,
        )


def apply_mapping(
    row: dict[str, str],
    mappings: dict[str, ColumnMapping],
) -> dict[str, str]:
    """
    Apply a column mapping to a CSV row.

    Converts {"Member Name": "Rahul", "WhatsApp No": "9876543210"}
    into    {"name": "Rahul", "phone": "9876543210"}
    """
    result: dict[str, str] = {}
    for target_field, mapping in mappings.items():
        value = (row.get(mapping.csv_column, "") or "").strip()
        if value:
            result[target_field] = value
    return result


def build_mapping_from_overrides(
    auto_mappings: dict[str, ColumnMapping],
    user_overrides: dict[str, str | None],
) -> dict[str, ColumnMapping]:
    """
    Merge auto-detected mappings with user overrides.

    user_overrides: {target_field: csv_column_name_or_None}
    - If csv_column is a string → override the mapping
    - If csv_column is None → remove the mapping (user says "skip this field")
    """
    final = dict(auto_mappings)

    for target_field, csv_column in user_overrides.items():
        if csv_column is None:
            # User explicitly unmapped this field
            final.pop(target_field, None)
        else:
            # User picked a CSV column for this field
            final[target_field] = ColumnMapping(
                csv_column=csv_column,
                target_field=target_field,
                confidence=1.0,
                match_method="manual",
            )

    return final
