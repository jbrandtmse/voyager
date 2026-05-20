"""Story 1.2 ADR catalogue completeness tests.

These tests assert the structural integrity of the Phase 0 ADR catalogue per
Story 1.2 AC1-AC6 and architecture Decisions 10a-10e:

- The MADR template at ``docs/adr/0000-template.md`` exists.
- All 27 numbered ADRs (0001-0027) plus the template plus the auto-generated
  README form a self-consistent catalogue (28 files matching the numbered
  pattern, plus README.md).
- Every ADR contains the five required MADR section headers in the correct
  order.
- Every ADR's ``Status:`` line is one of the four allowed values.
- ADR 0016's body contains the deferral marker referencing Story 1.14.
- ``docs/adr/README.md`` exists and contains a table row for every numbered
  ADR file plus the template.

The tests have no dependency on spiceypy or any other bake-side runtime
package; they read plain files only and run under the existing pytest suite.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
ADR_DIR = REPO_ROOT / "docs" / "adr"
INDEX_FILE = ADR_DIR / "README.md"

ADR_FILENAME_PATTERN = re.compile(r"^(\d{4})-[a-z0-9][a-z0-9-]*\.md$")
H1_PATTERN = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)
STATUS_PATTERN = re.compile(r"^Status:\s*(.+?)\s*$", re.MULTILINE)

REQUIRED_SECTION_HEADERS = (
    "## Status",
    "## Context",
    "## Decision",
    "## Consequences",
    "## Alternatives Considered",
)

ALLOWED_STATUS_VALUES = ("Proposed", "Accepted", "Deprecated")
SUPERSEDED_PATTERN = re.compile(r"^Superseded-by-\d{4}$")

EXPECTED_NUMBERED_ADRS = set(range(1, 28))  # 0001..0027 inclusive (25 catalogue + 0026 + 0027)


def _adr_files() -> list[Path]:
    """Return numbered-pattern ADR files sorted by number."""
    return sorted(ADR_DIR.glob("[0-9][0-9][0-9][0-9]-*.md"))


def _parse_number(path: Path) -> int:
    match = ADR_FILENAME_PATTERN.match(path.name)
    assert match is not None, f"unexpected ADR filename: {path.name}"
    return int(match.group(1))


def test_madr_template_exists() -> None:
    """AC1: docs/adr/0000-template.md exists and contains all five MADR section headers."""
    template = ADR_DIR / "0000-template.md"
    assert template.is_file(), f"missing MADR template at {template}"
    content = template.read_text(encoding="utf-8")
    for header in REQUIRED_SECTION_HEADERS:
        assert header in content, f"template missing required section header: {header}"


def test_catalogue_has_expected_adr_files() -> None:
    """AC2 / AC5 / AC6: 25 catalogue ADRs + 0026 + 0027 + 0000-template = 28 numbered files."""
    files = _adr_files()
    numbers = {_parse_number(p) for p in files}

    expected = EXPECTED_NUMBERED_ADRS | {0}  # include 0000-template
    missing = expected - numbers
    extra = numbers - expected

    assert not missing, f"missing ADR numbers: {sorted(missing)}"
    assert not extra, f"unexpected ADR numbers: {sorted(extra)}"
    assert len(files) == 28, f"expected 28 ADR files, got {len(files)}"


@pytest.mark.parametrize("path", _adr_files(), ids=lambda p: p.name)
def test_adr_has_all_five_madr_sections(path: Path) -> None:
    """AC2: every ADR contains the five required MADR section headers."""
    content = path.read_text(encoding="utf-8")
    for header in REQUIRED_SECTION_HEADERS:
        assert header in content, f"{path.name} missing section header: {header}"


@pytest.mark.parametrize("path", _adr_files(), ids=lambda p: p.name)
def test_adr_status_line_is_allowed_value(path: Path) -> None:
    """AC2: the front-of-file ``Status:`` line is one of the allowed values.

    Allowed values per ADR 0020:
    - ``Proposed``
    - ``Accepted``
    - ``Deprecated``
    - ``Superseded-by-NNNN`` (4-digit successor reference)
    """
    content = path.read_text(encoding="utf-8")
    match = STATUS_PATTERN.search(content)
    assert match is not None, f"{path.name} missing 'Status:' line"
    status = match.group(1).strip()

    if status in ALLOWED_STATUS_VALUES:
        return
    if SUPERSEDED_PATTERN.match(status):
        return
    pytest.fail(
        f"{path.name} has disallowed Status value '{status}'. "
        f"Expected one of {ALLOWED_STATUS_VALUES} or 'Superseded-by-NNNN'.",
    )


def test_adr_0016_has_story_114_deferral_marker() -> None:
    """AC2 / AC3: ADR 0016 (CDN provider) defers selection to Story 1.14."""
    adr_0016 = ADR_DIR / "0016-cdn-provider-selection-deferred.md"
    assert adr_0016.is_file(), "ADR 0016 file missing"
    content = adr_0016.read_text(encoding="utf-8")
    assert "Story 1.14" in content, (
        "ADR 0016 must contain the literal substring 'Story 1.14' as the deferral marker"
    )


def test_adr_0016_status_is_accepted() -> None:
    """Story 1.14: ADR 0016 was promoted from Proposed to Accepted with the
    Cloudflare Pages selection. The filename retains the historical
    ``-deferred`` suffix per the ADR-immutability compromise documented in
    the ADR's own header note.
    """
    adr_0016 = ADR_DIR / "0016-cdn-provider-selection-deferred.md"
    content = adr_0016.read_text(encoding="utf-8")
    match = STATUS_PATTERN.search(content)
    assert match is not None
    assert match.group(1).strip() == "Accepted", (
        f"ADR 0016 must be 'Accepted' (Story 1.14 selected Cloudflare Pages), got {match.group(1)!r}"
    )


def test_catalogue_accepted_adrs_are_accepted() -> None:
    """AC2: ADRs 0001-0027 are all marked Accepted (post-Story-1.14)."""
    expected_accepted = set(range(1, 28))
    for path in _adr_files():
        number = _parse_number(path)
        if number not in expected_accepted:
            continue
        content = path.read_text(encoding="utf-8")
        match = STATUS_PATTERN.search(content)
        assert match is not None, f"{path.name} missing Status line"
        assert match.group(1).strip() == "Accepted", (
            f"{path.name} (ADR {number:04d}) must be 'Accepted', got {match.group(1)!r}"
        )


def test_adr_index_exists_and_lists_every_adr() -> None:
    """AC4: docs/adr/README.md exists and contains a row for every ADR file."""
    assert INDEX_FILE.is_file(), f"missing ADR index at {INDEX_FILE}"
    index_content = INDEX_FILE.read_text(encoding="utf-8")
    for path in _adr_files():
        assert path.name in index_content, (
            f"ADR index README.md does not reference {path.name}"
        )


def test_adr_index_is_a_markdown_table() -> None:
    """AC4: the index uses a markdown table with the expected columns."""
    index_content = INDEX_FILE.read_text(encoding="utf-8")
    assert "| # | Title | Status | Path |" in index_content, (
        "ADR index missing the canonical markdown table header"
    )
