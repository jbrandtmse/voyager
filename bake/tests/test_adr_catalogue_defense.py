"""Story 1.2 ADR catalogue defense-in-depth tests.

These tests are complementary to ``test_adr_catalogue.py`` (the baseline
structural-completeness suite written by the developer). They lock in
properties that are *implied* by the architecture and ADR 0020/0026/0027
decisions but not directly asserted by the baseline:

1. ``scripts/adr-index.py`` is deterministic — two consecutive runs produce
   byte-identical ``docs/adr/README.md`` content. (Property implied by ADR
   0020's "regenerable from sources" claim and the script's module docstring.)
2. ADR ``[Source: ...]`` citations point at files that actually exist on
   disk. Detects rot in cross-document links when a planning artifact is
   renamed or removed.
3. ADR 0019 still codifies the Story 1.1 OTEL exception language —
   specifically the literal phrases ``@opentelemetry/api`` and
   ``no-pii-grep.test.ts``. If anyone edits ADR 0019 to drop the OTEL
   exception, this test fails until they either restore it or write an
   explanatory superseding ADR.
4. ``README.md`` mentions ``TypeScript 6`` somewhere (ADR 0026 update).
5. ``.gitattributes`` contains the literal ``* text=auto eol=lf`` line
   (ADR 0027 enactment).
6. Every ADR file's H1 title is consistent with its filename — the words
   from the filename's title portion appear (case-insensitively) in the H1.
   Catches half-applied renames in either direction.

Pytest-only; no Playwright / browser dependency (Story 1.2 ships zero UI).
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
ADR_DIR = REPO_ROOT / "docs" / "adr"
INDEX_FILE = ADR_DIR / "README.md"
ADR_INDEX_SCRIPT = REPO_ROOT / "scripts" / "adr-index.py"
GITATTRIBUTES = REPO_ROOT / ".gitattributes"
ROOT_README = REPO_ROOT / "README.md"

ADR_FILENAME_PATTERN = re.compile(r"^(\d{4})-([a-z0-9][a-z0-9-]*)\.md$")
H1_PATTERN = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)
SOURCE_CITATION_PATTERN = re.compile(r"\[Source:\s*([^\]#\s]+?)(?:#[^\]]*)?\s*\]")


def _adr_files() -> list[Path]:
    """Return numbered-pattern ADR files sorted by number."""
    return sorted(ADR_DIR.glob("[0-9][0-9][0-9][0-9]-*.md"))


def test_adr_index_script_is_deterministic(tmp_path: Path) -> None:
    """ADR 0020: regenerating the index twice produces byte-identical output.

    The dev manually verified this; this test locks it as a regression guard.
    We run the script twice in sequence, snapshotting the README bytes after
    each run, and assert they are byte-identical. Any nondeterminism
    (e.g. dict iteration order, timestamp injection, file-system order
    sensitivity) would break this property.
    """
    assert ADR_INDEX_SCRIPT.is_file(), f"missing regenerator at {ADR_INDEX_SCRIPT}"

    original_bytes = INDEX_FILE.read_bytes() if INDEX_FILE.exists() else None
    try:
        first_run = subprocess.run(
            [sys.executable, str(ADR_INDEX_SCRIPT)],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            check=False,
        )
        assert first_run.returncode == 0, (
            f"first regenerator run failed: stdout={first_run.stdout!r} stderr={first_run.stderr!r}"
        )
        first_bytes = INDEX_FILE.read_bytes()

        second_run = subprocess.run(
            [sys.executable, str(ADR_INDEX_SCRIPT)],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            check=False,
        )
        assert second_run.returncode == 0, (
            f"second regenerator run failed: stdout={second_run.stdout!r} stderr={second_run.stderr!r}"
        )
        second_bytes = INDEX_FILE.read_bytes()

        assert first_bytes == second_bytes, (
            "adr-index.py is not deterministic: two consecutive runs produced "
            f"different README.md bytes (first len={len(first_bytes)}, "
            f"second len={len(second_bytes)})"
        )
    finally:
        if original_bytes is not None:
            INDEX_FILE.write_bytes(original_bytes)


@pytest.mark.parametrize("adr_path", _adr_files(), ids=lambda p: p.name)
def test_adr_source_citations_reference_existing_files(adr_path: Path) -> None:
    """Every ``[Source: <path>]`` citation in an ADR points at an existing file.

    Anchor existence inside the file is NOT validated — that requires
    parsing each target's markdown heading structure and is deferred as
    LOW-priority work. File existence catches the most common rot:
    renamed or removed planning artifacts.
    """
    content = adr_path.read_text(encoding="utf-8")
    citations = SOURCE_CITATION_PATTERN.findall(content)
    if not citations:
        pytest.skip(f"{adr_path.name} has no [Source: ...] citations")

    missing: list[str] = []
    for raw_path in citations:
        candidate = (REPO_ROOT / raw_path.strip()).resolve()
        if not candidate.is_file():
            missing.append(raw_path)
    assert not missing, (
        f"{adr_path.name} references nonexistent source file(s): {missing}"
    )


def test_adr_0019_retains_otel_exception_language() -> None:
    """ADR 0019 codifies the Story 1.1 OTEL exception via two literal phrases.

    Both ``@opentelemetry/api`` and ``no-pii-grep.test.ts`` must appear in
    ADR 0019's body. If either disappears, either the OTEL exception was
    dropped (must be restored or a superseding ADR written) or the no-PII
    grep gate was renamed (must be reflected here).
    """
    adr_0019 = ADR_DIR / "0019-zero-analytics-localstorage-only-error-capture.md"
    assert adr_0019.is_file(), "ADR 0019 file missing"
    content = adr_0019.read_text(encoding="utf-8")
    assert "@opentelemetry/api" in content, (
        "ADR 0019 must contain the literal phrase '@opentelemetry/api' "
        "(the codified OTEL exception from Story 1.1). If the exception "
        "was intentionally dropped, write a superseding ADR."
    )
    assert "no-pii-grep.test.ts" in content, (
        "ADR 0019 must contain the literal phrase 'no-pii-grep.test.ts' "
        "(the no-PII grep gate codification reference). If the gate was "
        "renamed, update ADR 0019 to match."
    )


def test_root_readme_mentions_typescript_6() -> None:
    """ADR 0026 ratifies TypeScript 6.x; README's tech-stack reference must reflect that.

    Narrow form per the QA brief: at least one occurrence of the literal
    substring ``TypeScript 6`` in the root README.md. Prose that mentions
    the 5.x → 6.x ratification history (e.g. an ADR-link description)
    is allowed and does not violate this test.
    """
    assert ROOT_README.is_file(), f"missing root README at {ROOT_README}"
    content = ROOT_README.read_text(encoding="utf-8")
    assert "TypeScript 6" in content, (
        "README.md must mention 'TypeScript 6' in at least one place "
        "(ADR 0026 ratified TypeScript 6.x over 5.x)."
    )


def test_gitattributes_enforces_lf_normalization() -> None:
    """ADR 0027: .gitattributes contains the literal '* text=auto eol=lf' line.

    Case-sensitive literal check on the exact policy enacted by ADR 0027.
    """
    assert GITATTRIBUTES.is_file(), f"missing .gitattributes at {GITATTRIBUTES}"
    content = GITATTRIBUTES.read_text(encoding="utf-8")
    lines = [line.rstrip("\r\n") for line in content.splitlines()]
    assert "* text=auto eol=lf" in lines, (
        "ADR 0027 mandates the literal line '* text=auto eol=lf' in .gitattributes; "
        f"present lines: {lines!r}"
    )


# Known-acceptable acronym/spelling differences between filename tokens and H1
# titles. These are intentional editorial choices, not drift. If a filename
# *introduces* a new acronym not on this list, that token must appear (case-
# insensitively, alphanumerics-only) somewhere in the H1.
#
# Format: (filename_token, title_substring_when_lowered_and_alnum_only)
KNOWN_FILENAME_TITLE_DIVERGENCES: dict[str, dict[str, str]] = {
    "0005-build-time-spiceypy-bake-over-jsspice-wasm.md": {
        # "wasm" in filename → "webassembly" in title
        "wasm": "webassembly",
    },
    "0008-threejs-webglrenderer-over-webgpurenderer-v1.md": {
        # "threejs" in filename → "three.js" in title (alnum-collapsed: "threejs")
        # No actual divergence after alnum collapse; listed for documentation.
    },
    "0013-lit3-web-components-over-react-preact-svelte.md": {
        # "lit3" in filename → "lit 3+" in title; alnum-collapsed title contains "lit3"
        # No actual divergence after alnum collapse; listed for documentation.
    },
    "0026-typescript-6-ratification-over-5x.md": {
        # "5x" in filename → "5.x" in title; alnum-collapsed title contains "5x"
        # No actual divergence after alnum collapse; listed for documentation.
    },
    "0016-cdn-provider-selection-deferred.md": {
        # Story 1.14 promoted ADR 0016 from Proposed to Accepted with the
        # Cloudflare Pages selection. The filename retains the historical
        # "-deferred" suffix per the ADR-immutability rule (ADR 0020), but
        # the H1 was updated to drop the now-inaccurate "(Deferred)"
        # qualifier. The "deferred" token in the filename is intentional
        # historical residue; the divergence is documented in the ADR's
        # own header note.
        "deferred": "",
    },
}

# Stopwords ignored in the filename→title comparison. These are common
# connective words that may legitimately not appear in a compact H1.
FILENAME_STOPWORDS = frozenset({
    "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "is",
    "no", "not", "of", "on", "or", "over", "the", "then", "to", "via", "with",
})


def _title_alnum(title: str) -> str:
    """Lowercase the title and keep only [a-z0-9] characters."""
    return re.sub(r"[^a-z0-9]+", "", title.lower())


def _h1_of(path: Path) -> str | None:
    """Return the first H1 line content (after the '# ') or None if missing."""
    content = path.read_text(encoding="utf-8")
    match = H1_PATTERN.search(content)
    return match.group(1) if match else None


@pytest.mark.parametrize("adr_path", _adr_files(), ids=lambda p: p.name)
def test_adr_filename_and_h1_title_are_in_sync(adr_path: Path) -> None:
    """Filename's title-portion tokens appear in the H1 title.

    Catches half-applied renames: someone changes the filename's slug but
    forgets to update the H1 (or vice versa). The check is forgiving by
    design — it operates on alphanumeric tokens lowercased, ignores common
    connective stopwords, and consults a small allow-list of known acronym
    swaps (e.g. "wasm" → "webassembly").

    The 0000-template.md is exempt because its H1 is intentionally a
    placeholder (``# ADR NNNN — <Title>``).
    """
    match = ADR_FILENAME_PATTERN.match(adr_path.name)
    assert match is not None, f"unexpected ADR filename: {adr_path.name}"
    number_str, slug = match.group(1), match.group(2)

    if number_str == "0000":
        pytest.skip("template ADR has a placeholder H1 title by design")

    h1 = _h1_of(adr_path)
    assert h1, f"{adr_path.name} has no H1 title line"

    title_alnum = _title_alnum(h1)
    allow_map = KNOWN_FILENAME_TITLE_DIVERGENCES.get(adr_path.name, {})

    missing_tokens: list[str] = []
    for token in slug.split("-"):
        if not token or token in FILENAME_STOPWORDS:
            continue
        if token in allow_map:
            replacement = allow_map[token]
            if not replacement:
                # Empty/None replacement means "fully exempt — documented
                # intentional divergence (e.g., historical filename residue
                # that no longer appears in the H1)".
                continue
            if replacement.lower() in title_alnum:
                continue
            missing_tokens.append(f"{token!r} (expected mapped substring {replacement!r})")
            continue
        if token not in title_alnum:
            missing_tokens.append(token)

    assert not missing_tokens, (
        f"{adr_path.name}: filename slug tokens {missing_tokens} are absent from "
        f"the H1 title {h1!r} (alnum-collapsed: {title_alnum!r}). "
        f"Either the filename or the H1 was renamed without updating the other; "
        f"if the divergence is intentional, add an entry to "
        f"KNOWN_FILENAME_TITLE_DIVERGENCES in this test file."
    )
