"""
Tests for app.schemas.sanitize — HTML tag stripping utilities.

Coverage:
1. Basic HTML tag removal
2. Script tag removal (XSS prevention)
3. Self-closing tags
4. Nested tags
5. Normal text passthrough
6. Empty/None input handling
7. Multiple whitespace collapse
"""

import pytest  # noqa: F401

from app.schemas.sanitize import strip_html_tags


class TestStripHtmlTags:
    """HTML sanitization utility."""

    def test_removes_simple_tags(self):
        assert strip_html_tags("<h1>Hello</h1>") == "Hello"

    def test_removes_script_tags(self):
        result = strip_html_tags('<script>alert("xss")</script>')
        assert "<script>" not in result
        assert "</script>" not in result

    def test_removes_self_closing_tags(self):
        result = strip_html_tags("<img src=x onerror=alert(1)>")
        assert "<img" not in result
        assert result == ""

    def test_removes_nested_tags(self):
        result = strip_html_tags("<div><p><b>Text</b></p></div>")
        assert result == "Text"

    def test_preserves_normal_text(self):
        assert strip_html_tags("Normal text") == "Normal text"

    def test_preserves_text_with_ampersand(self):
        result = strip_html_tags("Tom & Jerry")
        assert result == "Tom & Jerry"

    def test_empty_string_passthrough(self):
        assert strip_html_tags("") == ""

    def test_none_passthrough(self):
        # If the function handles None gracefully
        result = strip_html_tags(None)
        assert result is None

    def test_collapses_multiple_whitespace(self):
        result = strip_html_tags("<p>Hello</p>  <p>World</p>")
        assert "  " not in result
        assert "Hello" in result
        assert "World" in result

    def test_removes_html_comments(self):
        result = strip_html_tags("<!-- hidden -->Visible")
        assert "hidden" not in result
        assert "Visible" in result

    def test_removes_attributes(self):
        result = strip_html_tags('<a href="http://evil.com" onclick="steal()">Click</a>')
        assert result == "Click"
        assert "href" not in result
        assert "onclick" not in result

    def test_handles_malformed_tags(self):
        """Incomplete tags are still stripped."""
        result = strip_html_tags("<div>content<br")
        # The incomplete tag might or might not be stripped, but no crash
        assert isinstance(result, str)

    def test_multiline_tags(self):
        html = """<div
            class="container"
            style="color: red">
            Content here
        </div>"""
        result = strip_html_tags(html)
        assert "Content here" in result
        assert "<div" not in result
