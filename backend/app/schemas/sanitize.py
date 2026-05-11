"""
Input sanitization utilities for user-facing text fields.

Defense-in-depth: Even though React auto-escapes JSX text output,
stripping HTML tags at the input layer prevents stored XSS if
data is ever rendered in a non-React context (emails, PDFs, exports,
third-party integrations, or future dangerouslySetInnerHTML usage).

This does NOT replace output encoding — it supplements it.
"""

import re

# Matches HTML tags including self-closing, comments, and CDATA
_HTML_TAG_RE = re.compile(r"<[^>]+>", re.DOTALL)

# Matches HTML entities like &amp; &lt; &#123; &#x1F;
_HTML_ENTITY_RE = re.compile(r"&(?:#\d+|#x[\da-fA-F]+|\w+);")


def strip_html_tags(value: str) -> str:
    """Remove HTML tags from a string, preserving plain text content.

    Examples:
        >>> strip_html_tags("<h1>Hello</h1>")
        'Hello'
        >>> strip_html_tags('<script>alert("xss")</script>')
        'alert("xss")'
        >>> strip_html_tags("Normal text")
        'Normal text'
        >>> strip_html_tags("<img src=x onerror=alert(1)>")
        ''
    """
    if not value:
        return value
    cleaned = _HTML_TAG_RE.sub("", value)
    # Collapse multiple whitespace from tag removal
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
    return cleaned
