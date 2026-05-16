"""
Integration tests for Custom Fields feature.

Tests:
- Create custom field (text, dropdown, number, date)
- List custom fields (active only)
- Update custom field
- Delete (soft-delete) custom field
- Custom field values stored on member
- Custom field values returned in member response
"""

from httpx import AsyncClient


class TestCreateCustomField:
    """Test custom field creation."""

    async def test_create_text_field(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Owner can create a text custom field."""
        payload = {"label": "Blood Group", "field_type": "text"}
        response = await client.post(
            "/api/v1/custom-fields", json=payload, headers=auth_headers
        )
        assert response.status_code == 201
        data = response.json()
        assert data["label"] == "Blood Group"
        assert data["field_key"] == "blood_group"
        assert data["field_type"] == "text"
        assert data["is_required"] is False
        assert data["is_active"] is True

    async def test_create_dropdown_field(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Owner can create a dropdown field with options."""
        payload = {
            "label": "Batch Timing",
            "field_type": "dropdown",
            "options": ["5 AM", "6 AM", "7 AM", "Evening"],
        }
        response = await client.post(
            "/api/v1/custom-fields", json=payload, headers=auth_headers
        )
        assert response.status_code == 201
        data = response.json()
        assert data["field_type"] == "dropdown"
        assert data["options"] == ["5 AM", "6 AM", "7 AM", "Evening"]

    async def test_create_number_field(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Owner can create a number field."""
        payload = {"label": "Height (cm)", "field_type": "number", "is_required": True}
        response = await client.post(
            "/api/v1/custom-fields", json=payload, headers=auth_headers
        )
        assert response.status_code == 201
        data = response.json()
        assert data["field_type"] == "number"
        assert data["is_required"] is True

    async def test_create_date_field(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Owner can create a date field."""
        payload = {"label": "Joining Date", "field_type": "date"}
        response = await client.post(
            "/api/v1/custom-fields", json=payload, headers=auth_headers
        )
        assert response.status_code == 201
        assert response.json()["field_type"] == "date"

    async def test_duplicate_label_gets_unique_key(
        self, client: AsyncClient, auth_headers: dict
    ):
        """If same label is used twice, field_key gets incremented."""
        payload = {"label": "Address", "field_type": "text"}
        resp1 = await client.post(
            "/api/v1/custom-fields", json=payload, headers=auth_headers
        )
        resp2 = await client.post(
            "/api/v1/custom-fields", json=payload, headers=auth_headers
        )
        assert resp1.status_code == 201
        assert resp2.status_code == 201
        assert resp1.json()["field_key"] == "address"
        assert resp2.json()["field_key"] == "address_1"

    async def test_invalid_field_type_rejected(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Invalid field type returns 422."""
        payload = {"label": "Test", "field_type": "invalid"}
        response = await client.post(
            "/api/v1/custom-fields", json=payload, headers=auth_headers
        )
        assert response.status_code == 422

    async def test_staff_cannot_create_field(
        self, client: AsyncClient, staff_headers: dict
    ):
        """Staff role cannot create custom fields (owner only)."""
        payload = {"label": "Test Field", "field_type": "text"}
        response = await client.post(
            "/api/v1/custom-fields", json=payload, headers=staff_headers
        )
        assert response.status_code == 403


class TestListCustomFields:
    """Test custom field listing."""

    async def test_list_fields(
        self, client: AsyncClient, auth_headers: dict
    ):
        """List returns only active fields."""
        # Create two fields
        await client.post(
            "/api/v1/custom-fields",
            json={"label": "Field A", "field_type": "text"},
            headers=auth_headers,
        )
        await client.post(
            "/api/v1/custom-fields",
            json={"label": "Field B", "field_type": "number"},
            headers=auth_headers,
        )

        response = await client.get("/api/v1/custom-fields", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data["fields"]) >= 2


class TestUpdateCustomField:
    """Test custom field updates."""

    async def test_update_label(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Owner can update field label."""
        create_resp = await client.post(
            "/api/v1/custom-fields",
            json={"label": "Old Label", "field_type": "text"},
            headers=auth_headers,
        )
        field_id = create_resp.json()["id"]

        response = await client.patch(
            f"/api/v1/custom-fields/{field_id}",
            json={"label": "New Label"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["label"] == "New Label"

    async def test_update_options(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Owner can update dropdown options."""
        create_resp = await client.post(
            "/api/v1/custom-fields",
            json={"label": "Size", "field_type": "dropdown", "options": ["S", "M", "L"]},
            headers=auth_headers,
        )
        field_id = create_resp.json()["id"]

        response = await client.patch(
            f"/api/v1/custom-fields/{field_id}",
            json={"options": ["XS", "S", "M", "L", "XL"]},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["options"] == ["XS", "S", "M", "L", "XL"]


class TestDeleteCustomField:
    """Test custom field deletion."""

    async def test_delete_field(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Delete soft-deactivates the field."""
        create_resp = await client.post(
            "/api/v1/custom-fields",
            json={"label": "To Delete", "field_type": "text"},
            headers=auth_headers,
        )
        field_id = create_resp.json()["id"]

        response = await client.delete(
            f"/api/v1/custom-fields/{field_id}", headers=auth_headers
        )
        assert response.status_code == 204

    async def test_delete_nonexistent_returns_404(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Deleting non-existent field returns 404."""
        response = await client.delete(
            "/api/v1/custom-fields/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
        )
        assert response.status_code == 404


class TestCustomFieldValues:
    """Test that custom field values are stored and returned on members."""

    async def test_create_member_with_custom_fields(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Member can be created with custom field values."""
        # First create a custom field
        await client.post(
            "/api/v1/custom-fields",
            json={"label": "Aadhar Number", "field_type": "text"},
            headers=auth_headers,
        )

        # Create member with custom_fields
        payload = {
            "name": "Custom Field Member",
            "phone": "9876500200",
            "custom_fields": {"aadhar_number": "1234-5678-9012"},
        }
        response = await client.post(
            "/api/v1/members", json=payload, headers=auth_headers
        )
        assert response.status_code == 201
        data = response.json()
        assert data["custom_fields"]["aadhar_number"] == "1234-5678-9012"

    async def test_update_member_custom_fields(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Custom fields can be updated via PATCH."""
        create_resp = await client.post(
            "/api/v1/members",
            json={
                "name": "CF Update Test",
                "phone": "9876500201",
                "custom_fields": {"weight_kg": 70},
            },
            headers=auth_headers,
        )
        member_id = create_resp.json()["id"]

        response = await client.patch(
            f"/api/v1/members/{member_id}",
            json={"custom_fields": {"weight_kg": 72, "height_cm": 175}},
            headers=auth_headers,
        )
        assert response.status_code == 200
        cf = response.json()["custom_fields"]
        assert cf["weight_kg"] == 72
        assert cf["height_cm"] == 175

    async def test_member_without_custom_fields(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Member without custom_fields returns null or empty."""
        response = await client.post(
            "/api/v1/members",
            json={"name": "No CF", "phone": "9876500202"},
            headers=auth_headers,
        )
        assert response.status_code == 201
        # custom_fields should be None or empty dict
        cf = response.json().get("custom_fields")
        assert cf is None or cf == {}
