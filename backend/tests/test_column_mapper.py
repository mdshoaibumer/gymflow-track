"""
Tests for Smart CSV Column Mapping.

Coverage:
1. Exact alias matching — standard English headers
2. Hindi/Devanagari headers — नाम, फोन, etc.
3. Hinglish headers — "member ka naam", "whatsapp no"
4. Content-based inference — detect phone from data patterns
5. Conflict resolution — two fields match same column
6. User overrides — manual mapping corrections
7. Missing required fields — clear error messages
8. Real-world CSV formats — messy data from Excel exports
9. Gender/amount parsing — new field support
10. End-to-end: detect → preview → import with mapping
"""

from uuid import uuid4

import pytest

from app.services.column_mapper import (
    ColumnMapper,
    apply_mapping,
    build_mapping_from_overrides,
    _normalize_header,
)


# === Header Normalization ===


class TestHeaderNormalization:
    def test_basic(self):
        assert _normalize_header("  Member Name  ") == "member_name"

    def test_dots_and_dashes(self):
        assert _normalize_header("Ph. No.") == "ph_no"
        assert _normalize_header("phone-number") == "phone_number"

    def test_mixed_case(self):
        assert _normalize_header("MEMBER NAME") == "member_name"

    def test_devanagari_preserved(self):
        assert _normalize_header("नाम") == "नाम"

    def test_empty(self):
        assert _normalize_header("   ") == ""


# === Exact Alias Matching ===


class TestExactAliasMatching:
    """Standard English headers that should match perfectly."""

    def test_standard_headers(self):
        mapper = ColumnMapper(["Name", "Phone", "Email", "Plan"])
        result = mapper.detect()

        assert "name" in result.mappings
        assert result.mappings["name"].confidence == 1.0
        assert result.mappings["name"].csv_column == "Name"

        assert "phone" in result.mappings
        assert result.mappings["phone"].confidence == 1.0

        assert "email" in result.mappings
        assert result.mappings["email"].confidence == 1.0

    def test_underscore_variations(self):
        mapper = ColumnMapper(["member_name", "phone_number", "email_address"])
        result = mapper.detect()

        assert "name" in result.mappings
        assert result.mappings["name"].csv_column == "member_name"

        assert "phone" in result.mappings
        assert result.mappings["phone"].csv_column == "phone_number"

    def test_whatsapp_maps_to_phone(self):
        mapper = ColumnMapper(["Name", "WhatsApp", "Email"])
        result = mapper.detect()

        assert "phone" in result.mappings
        assert result.mappings["phone"].csv_column == "WhatsApp"

    def test_mobile_maps_to_phone(self):
        mapper = ColumnMapper(["Name", "Mobile No", "Email"])
        result = mapper.detect()

        assert "phone" in result.mappings
        assert result.mappings["phone"].csv_column == "Mobile No"

    def test_plan_variations(self):
        mapper = ColumnMapper(["Name", "Phone", "Package"])
        result = mapper.detect()
        assert "membership_plan" in result.mappings
        assert result.mappings["membership_plan"].csv_column == "Package"

    def test_date_variations(self):
        mapper = ColumnMapper(["Name", "Phone", "Join Date", "Expiry Date"])
        result = mapper.detect()
        assert "membership_start" in result.mappings
        assert "membership_end" in result.mappings

    def test_amount_variations(self):
        mapper = ColumnMapper(["Name", "Phone", "Fees"])
        result = mapper.detect()
        assert "amount_paid" in result.mappings
        assert result.mappings["amount_paid"].csv_column == "Fees"

    def test_dob(self):
        mapper = ColumnMapper(["Name", "Phone", "DOB"])
        result = mapper.detect()
        assert "date_of_birth" in result.mappings

    def test_gender(self):
        mapper = ColumnMapper(["Name", "Phone", "Gender"])
        result = mapper.detect()
        assert "gender" in result.mappings


# === Hindi / Devanagari Headers ===


class TestHindiHeaders:
    """Headers in Devanagari script (common in Indian spreadsheets)."""

    def test_devanagari_name_and_phone(self):
        mapper = ColumnMapper(["नाम", "फोन"])
        result = mapper.detect()

        assert "name" in result.mappings
        assert result.mappings["name"].csv_column == "नाम"
        assert result.mappings["name"].confidence == 1.0

        assert "phone" in result.mappings
        assert result.mappings["phone"].csv_column == "फोन"

    def test_devanagari_all_fields(self):
        mapper = ColumnMapper(["नाम", "मोबाइल", "ईमेल", "लिंग", "फीस"])
        result = mapper.detect()

        assert "name" in result.mappings
        assert "phone" in result.mappings
        assert "email" in result.mappings
        assert "gender" in result.mappings
        assert "amount_paid" in result.mappings

    def test_hinglish_transliteration(self):
        mapper = ColumnMapper(["Naam", "Mobile", "Plan"])
        result = mapper.detect()

        assert "name" in result.mappings
        assert result.mappings["name"].csv_column == "Naam"


# === Keyword / Substring Matching ===


class TestKeywordMatching:
    """Headers with keywords embedded in longer strings."""

    def test_compound_header(self):
        mapper = ColumnMapper(["Member Full Name", "WhatsApp Phone Number"])
        result = mapper.detect()

        assert "name" in result.mappings
        assert result.mappings["name"].match_method == "keyword"
        assert result.mappings["name"].confidence < 1.0

        assert "phone" in result.mappings

    def test_custom_prefix(self):
        mapper = ColumnMapper(["student_name", "contact_mobile"])
        result = mapper.detect()

        assert "name" in result.mappings
        assert "phone" in result.mappings


# === Content-Based Inference ===


class TestContentInference:
    """Detect field types from actual cell values."""

    def test_phone_from_content(self):
        """Column with 10-digit numbers starting with 6-9 → phone."""
        mapper = ColumnMapper(["Person", "Number"])
        sample = [
            {"Person": "Rahul", "Number": "9876543210"},
            {"Person": "Priya", "Number": "8765432109"},
            {"Person": "Amit", "Number": "7654321098"},
        ]
        result = mapper.detect(sample_rows=sample)

        # "Person" should match name via keyword, "Number" should infer phone
        assert "name" in result.mappings
        assert "phone" in result.mappings
        assert result.mappings["phone"].csv_column == "Number"

    def test_email_from_content(self):
        """Column with @ symbols → email."""
        mapper = ColumnMapper(["Name", "Phone", "Info"])
        sample = [
            {"Name": "Rahul", "Phone": "9876543210", "Info": "rahul@gmail.com"},
            {"Name": "Priya", "Phone": "8765432109", "Info": "priya@yahoo.com"},
            {"Name": "Amit", "Phone": "7654321098", "Info": "amit@hotmail.com"},
        ]
        result = mapper.detect(sample_rows=sample)

        assert "email" in result.mappings
        assert result.mappings["email"].csv_column == "Info"

    def test_gender_from_content(self):
        """Column with male/female values → gender."""
        mapper = ColumnMapper(["Name", "Phone", "Type"])
        sample = [
            {"Name": "Rahul", "Phone": "9876543210", "Type": "Male"},
            {"Name": "Priya", "Phone": "8765432109", "Type": "Female"},
            {"Name": "Amit", "Phone": "7654321098", "Type": "Male"},
        ]
        result = mapper.detect(sample_rows=sample)

        assert "gender" in result.mappings
        assert result.mappings["gender"].csv_column == "Type"


# === Conflict Resolution ===


class TestConflictResolution:
    """When multiple fields could match the same column."""

    def test_exact_beats_keyword(self):
        """Exact alias match should win over keyword match."""
        mapper = ColumnMapper(["name", "phone", "contact_number"])
        result = mapper.detect()

        # "phone" is exact match for phone field
        # "contact_number" contains "contact" (keyword for phone) but "phone" is already taken
        assert result.mappings["phone"].csv_column == "phone"

    def test_each_column_mapped_once(self):
        """A CSV column should not be mapped to two fields."""
        mapper = ColumnMapper(["Name", "Phone", "Email"])
        result = mapper.detect()

        mapped_columns = [m.csv_column for m in result.mappings.values()]
        assert len(mapped_columns) == len(set(mapped_columns))  # No duplicates

    def test_emergency_contact_vs_contact(self):
        """'emergency_contact' should not be confused with 'phone'."""
        mapper = ColumnMapper(["Name", "Phone", "Emergency Contact"])
        result = mapper.detect()

        assert result.mappings["phone"].csv_column == "Phone"
        assert result.mappings["emergency_contact"].csv_column == "Emergency Contact"


# === Unmapped & Missing Fields ===


class TestEdgeCases:
    """Edge cases: unmapped columns, missing required, weird headers."""

    def test_unmapped_columns_reported(self):
        """Columns we can't identify are listed in unmapped_columns."""
        mapper = ColumnMapper(["Name", "Phone", "XYZ123", "Random Col"])
        result = mapper.detect()

        assert "XYZ123" in result.unmapped_columns
        assert "Random Col" in result.unmapped_columns

    def test_missing_required_reported(self):
        """Missing name/phone is flagged in missing_required."""
        mapper = ColumnMapper(["Email", "Plan"])
        result = mapper.detect()

        assert "name" in result.missing_required
        assert "phone" in result.missing_required

    def test_empty_headers_skipped(self):
        """Empty/whitespace-only headers are ignored."""
        mapper = ColumnMapper(["Name", "", "  ", "Phone"])
        result = mapper.detect()

        assert "name" in result.mappings
        assert "phone" in result.mappings

    def test_single_column_csv(self):
        """CSV with only one column shouldn't crash."""
        mapper = ColumnMapper(["Name"])
        result = mapper.detect()

        assert "name" in result.mappings
        assert "phone" in result.missing_required

    def test_all_unrecognized(self):
        """All columns unrecognized — both required fields missing."""
        mapper = ColumnMapper(["Col A", "Col B", "Col C"])
        result = mapper.detect()

        assert len(result.unmapped_columns) == 3
        assert "name" in result.missing_required
        assert "phone" in result.missing_required


# === User Overrides ===


class TestUserOverrides:
    """User manually corrects auto-detected mappings."""

    def test_override_replaces_mapping(self):
        mapper = ColumnMapper(["Name", "Phone", "Unknown Col"])
        result = mapper.detect()

        overrides = {"email": "Unknown Col"}  # User says "Unknown Col" is email
        final = build_mapping_from_overrides(result.mappings, overrides)

        assert "email" in final
        assert final["email"].csv_column == "Unknown Col"
        assert final["email"].match_method == "manual"
        assert final["email"].confidence == 1.0

    def test_override_removes_mapping(self):
        mapper = ColumnMapper(["Name", "Phone", "Email"])
        result = mapper.detect()

        overrides = {"email": None}  # User says "skip email"
        final = build_mapping_from_overrides(result.mappings, overrides)

        assert "email" not in final
        assert "name" in final
        assert "phone" in final

    def test_override_corrects_wrong_detection(self):
        """User fixes a column that was incorrectly auto-mapped."""
        mapper = ColumnMapper(["Name", "Contact", "Emergency Number"])
        result = mapper.detect()

        # Auto-detect might map "Contact" to phone and "Emergency Number" to emergency
        # User corrects: "Emergency Number" is actually the primary phone
        overrides = {
            "phone": "Emergency Number",
            "emergency_contact": "Contact",
        }
        final = build_mapping_from_overrides(result.mappings, overrides)

        assert final["phone"].csv_column == "Emergency Number"
        assert final["emergency_contact"].csv_column == "Contact"


# === apply_mapping ===


class TestApplyMapping:
    """Test row transformation using mappings."""

    def test_basic_mapping(self):
        from app.services.column_mapper import ColumnMapping

        mappings = {
            "name": ColumnMapping("Member Name", "name", 1.0, "exact"),
            "phone": ColumnMapping("WhatsApp No", "phone", 1.0, "exact"),
        }
        row = {"Member Name": "Rahul Sharma", "WhatsApp No": "9876543210", "Extra": "ignored"}

        result = apply_mapping(row, mappings)

        assert result == {"name": "Rahul Sharma", "phone": "9876543210"}

    def test_missing_values_skipped(self):
        from app.services.column_mapper import ColumnMapping

        mappings = {
            "name": ColumnMapping("Name", "name", 1.0, "exact"),
            "email": ColumnMapping("Email", "email", 1.0, "exact"),
        }
        row = {"Name": "Rahul", "Email": ""}

        result = apply_mapping(row, mappings)

        assert result == {"name": "Rahul"}  # Empty email not included


# === Real-World Scenarios ===


class TestRealWorldCSVs:
    """Simulate actual CSV files from Indian gym owners."""

    def test_google_sheets_export(self):
        """Typical Google Sheets format with readable headers."""
        mapper = ColumnMapper([
            "Member Name", "Phone Number", "Email", "Plan",
            "Start Date", "End Date", "Amount Paid"
        ])
        result = mapper.detect()

        assert "name" in result.mappings
        assert "phone" in result.mappings
        assert "email" in result.mappings
        assert "membership_plan" in result.mappings
        assert "membership_start" in result.mappings
        assert "membership_end" in result.mappings
        assert "amount_paid" in result.mappings
        assert len(result.missing_required) == 0

    def test_excel_hindi_export(self):
        """Hindi headers from Excel."""
        mapper = ColumnMapper(["सदस्य का नाम", "मोबाइल नंबर", "प्लान", "फीस"])
        result = mapper.detect()

        assert "name" in result.mappings
        assert "phone" in result.mappings
        assert "membership_plan" in result.mappings
        assert "amount_paid" in result.mappings

    def test_messy_notebook_export(self):
        """Minimal columns — just name and phone, messy formatting."""
        mapper = ColumnMapper(["  NAME  ", "MOB NO"])
        result = mapper.detect()

        assert "name" in result.mappings
        assert "phone" in result.mappings

    def test_billing_software_export(self):
        """Export from generic billing software with verbose column names."""
        mapper = ColumnMapper([
            "Customer Name", "Contact Number", "Email Address",
            "Membership Type", "Registration Date", "Expiry Date",
            "Total Amount", "Gender (M/F)"
        ])
        result = mapper.detect()

        assert "name" in result.mappings
        assert "phone" in result.mappings
        assert "email" in result.mappings
        assert "membership_plan" in result.mappings
        assert "membership_start" in result.mappings
        assert "membership_end" in result.mappings
        assert "amount_paid" in result.mappings

    def test_whatsapp_group_export(self):
        """Minimal data extracted from WhatsApp — just names and numbers."""
        mapper = ColumnMapper(["Name", "WhatsApp Number"])
        result = mapper.detect()

        assert "name" in result.mappings
        assert "phone" in result.mappings
        assert result.mappings["phone"].csv_column == "WhatsApp Number"


# === Gender & Amount Parsing (Onboarding Service) ===


class TestGenderNormalization:
    def test_male_variations(self):
        from app.services.onboarding_service import _normalize_gender

        assert _normalize_gender("Male") == "male"
        assert _normalize_gender("M") == "male"
        assert _normalize_gender("male") == "male"
        assert _normalize_gender("पुरुष") == "male"

    def test_female_variations(self):
        from app.services.onboarding_service import _normalize_gender

        assert _normalize_gender("Female") == "female"
        assert _normalize_gender("F") == "female"
        assert _normalize_gender("महिला") == "female"

    def test_other(self):
        from app.services.onboarding_service import _normalize_gender

        assert _normalize_gender("Other") == "other"
        assert _normalize_gender("O") == "other"

    def test_invalid_returns_none(self):
        from app.services.onboarding_service import _normalize_gender

        assert _normalize_gender("XYZ") is None
        assert _normalize_gender("") is None


class TestAmountParsing:
    def test_basic_number(self):
        from app.services.onboarding_service import _parse_amount

        assert _parse_amount("1500") == 150000  # ₹1500 = 150000 paise

    def test_with_comma(self):
        from app.services.onboarding_service import _parse_amount

        assert _parse_amount("1,500") == 150000

    def test_with_rupee_symbol(self):
        from app.services.onboarding_service import _parse_amount

        assert _parse_amount("₹1500") == 150000
        assert _parse_amount("₹ 1,500.00") == 150000

    def test_with_decimal(self):
        from app.services.onboarding_service import _parse_amount

        assert _parse_amount("1500.50") == 150050

    def test_invalid_returns_none(self):
        from app.services.onboarding_service import _parse_amount

        assert _parse_amount("") is None
        assert _parse_amount("abc") is None

    def test_zero(self):
        from app.services.onboarding_service import _parse_amount

        assert _parse_amount("0") == 0


# === End-to-End: detect_csv_columns ===


class TestDetectCSVColumns:
    """Integration test for the full detection pipeline."""

    def test_standard_csv(self):
        from app.services.onboarding_service import detect_csv_columns

        csv = "Name,Phone,Email,Plan\nRahul,9876543210,r@g.com,Monthly\nPriya,8765432109,,Quarterly\n"
        result = detect_csv_columns(csv)

        assert len(result["mappings"]) >= 3
        fields_mapped = {m["target_field"] for m in result["mappings"]}
        assert "name" in fields_mapped
        assert "phone" in fields_mapped
        assert "email" in fields_mapped
        assert len(result["missing_required"]) == 0
        assert len(result["sample_data"]) == 2
        assert len(result["target_fields"]) > 0

    def test_hindi_csv(self):
        from app.services.onboarding_service import detect_csv_columns

        csv = "नाम,फोन,प्लान\nराहुल,9876543210,Monthly\nप्रिया,8765432109,Quarterly\n"
        result = detect_csv_columns(csv)

        fields_mapped = {m["target_field"] for m in result["mappings"]}
        assert "name" in fields_mapped
        assert "phone" in fields_mapped

    def test_completely_unknown_csv(self):
        from app.services.onboarding_service import detect_csv_columns

        csv = "Col1,Col2,Col3\nRahul,9876543210,test\n"
        result = detect_csv_columns(csv)

        # Content-based inference might catch phone, but name won't be detected
        assert len(result["missing_required"]) >= 1  # At least name is missing
        assert len(result["unmapped_columns"]) >= 1


# === End-to-End: parse_csv_with_mapping ===


class TestParseCSVWithMapping:
    """Integration test: parse + validate with the mapper."""

    def test_standard_import(self):
        from app.services.onboarding_service import parse_csv_with_mapping

        csv = "Name,Phone,Email\nRahul Sharma,9876543210,r@g.com\nPriya Patel,8765432109,\n"
        result = parse_csv_with_mapping(csv, uuid4(), set())

        assert result["total_rows"] == 2
        assert result["valid"] == 2
        assert result["rows"][0]["name"] == "Rahul Sharma"
        assert result["rows"][0]["phone"] == "9876543210"
        assert len(result["column_mappings"]) >= 2

    def test_with_user_overrides(self):
        from app.services.onboarding_service import parse_csv_with_mapping

        csv = "Person,Number,Info\nRahul,9876543210,Monthly\n"
        overrides = {"name": "Person", "phone": "Number", "membership_plan": "Info"}
        result = parse_csv_with_mapping(csv, uuid4(), set(), overrides)

        assert result["valid"] == 1
        assert result["rows"][0]["name"] == "Rahul"
        assert result["rows"][0]["phone"] == "9876543210"
        assert result["rows"][0]["membership_plan"] == "Monthly"

    def test_duplicate_detection(self):
        from app.services.onboarding_service import parse_csv_with_mapping

        csv = "Name,Phone\nRahul,9876543210\nPriya,8765432109\n"
        existing = {"9876543210"}  # Rahul already exists
        result = parse_csv_with_mapping(csv, uuid4(), existing)

        assert result["duplicates"] == 1
        assert result["valid"] == 1
        assert result["rows"][0]["status"] == "duplicate"

    def test_invalid_phone_detected(self):
        from app.services.onboarding_service import parse_csv_with_mapping

        csv = "Name,Phone\nRahul,1234567890\n"  # Invalid: doesn't start with 6-9
        result = parse_csv_with_mapping(csv, uuid4(), set())

        assert result["invalid"] == 1
        assert result["rows"][0]["status"] == "invalid"
        assert any("Indian mobile" in e for e in result["rows"][0]["errors"])

    def test_gender_and_amount_parsed(self):
        from app.services.onboarding_service import parse_csv_with_mapping

        csv = "Name,Phone,Gender,Fees\nRahul,9876543210,Male,1500\n"
        result = parse_csv_with_mapping(csv, uuid4(), set())

        assert result["valid"] == 1
        assert result["rows"][0]["gender"] == "male"
        assert result["rows"][0]["amount_paid"] == 150000  # paise

    def test_missing_name_column_raises(self):
        from app.services.onboarding_service import parse_csv_with_mapping
        from app.core.exceptions import ValidationError

        csv = "Col1,Col2\nabc,def\n"
        with pytest.raises(ValidationError, match="name"):
            parse_csv_with_mapping(csv, uuid4(), set())
