"""Story 1.14 CI workflow + CDN deploy defense-in-depth tests.

Companion to ``bake/tests/test_ci_workflow.py``. The dev-authored module
locks the headline invariants (job set present, ``ubuntu-22.04`` pin,
``lfs: true`` on the heavy-checkout jobs, deploy gate keywords present,
determinism re-bake, Cloudflare action + secrets, ``_headers`` content,
``package.json`` script wiring).

This module adds tighter, orthogonal assertions that catch failure modes
the dev's text-substring checks do not — drift to ``ubuntu-latest``,
deprecated ``actions/checkout@v3``, partial deploy gates, accidental
``${{ secrets.* }}`` value leaks, third-party analytics fields creeping
into the deploy step, accidental ``/*`` over-cache rules, and the
``deploy-cloudflare`` ``needs:`` list silently dropping a gating job
when a future story rearranges the graph.

All tests are pytest-only and read files from disk; no network, no
container, no Playwright. The single YAML-parse test uses
``pytest.importorskip('yaml')`` so the module remains hermetic if
PyYAML isn't installed in the bake dev env.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
CI_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "ci.yml"
HEADERS_FILE = REPO_ROOT / "web" / "public" / "_headers"
ADR_0016 = REPO_ROOT / "docs" / "adr" / "0016-cdn-provider-selection-deferred.md"
ADR_README = REPO_ROOT / "docs" / "adr" / "README.md"
WEB_PKG = REPO_ROOT / "web" / "package.json"
README = REPO_ROOT / "README.md"
DEFERRED_WORK = REPO_ROOT / "_bmad-output" / "implementation-artifacts" / "deferred-work.md"

EXPECTED_JOBS = (
    "lint-bake",
    "lint-web",
    "typecheck-web",
    "bake",
    "validate-l1",
    "test-bake",
    "test-web",
    "build-glb",  # Story 3.3 (added by AC2 Voyager GLB LOD chain bake job);
                  # Story 4.0 AC9 closed the stale-test-expectation tripwire
                  # surfaced in Story 3.7's cycle log.
    "build",
    "l4-visual-regression",  # Story 4.9 — Playwright L4 visual regression
                              # suite. Runs after `build`; uploads diff
                              # artifacts on failure; required before
                              # `deploy-cloudflare`.
    "deploy-cloudflare",
)

# Gating jobs that the deploy job MUST list in `needs:` (everything that
# protects the deploy from a silent-skip is required here).
DEPLOY_NEEDS_REQUIRED = (
    "build",
    "validate-l1",
    "lint-bake",
    "lint-web",
    "typecheck-web",
    "test-web",
)


def _ci_text() -> str:
    assert CI_WORKFLOW.is_file(), f"CI workflow missing at {CI_WORKFLOW}"
    return CI_WORKFLOW.read_text(encoding="utf-8")


def _job_blocks(text: str) -> dict[str, str]:
    """Slice the workflow text into per-job blocks keyed by job id.

    Mirrors ``test_ci_workflow._job_blocks`` so this module stays
    independent of the dev's helper. Hand-rolled to avoid pulling in a
    YAML parser at module-import time.
    """
    lines = text.splitlines()
    in_jobs_block = False
    current_id: str | None = None
    blocks: dict[str, list[str]] = {}
    job_header_re = re.compile(r"^  ([a-z][a-z0-9-]*):\s*$")
    for line in lines:
        if line.rstrip() == "jobs:":
            in_jobs_block = True
            continue
        if not in_jobs_block:
            continue
        if line and not line.startswith(" ") and not line.startswith("#"):
            in_jobs_block = False
            current_id = None
            continue
        m = job_header_re.match(line)
        if m:
            current_id = m.group(1)
            blocks[current_id] = []
            continue
        if current_id is not None:
            blocks[current_id].append(line)
    return {jid: "\n".join(body) for jid, body in blocks.items()}


def _deploy_step_block(deploy_body: str) -> str:
    """Return the text of the ``cloudflare/pages-action`` step alone.

    The deploy job has multiple steps; for the analytics-leak check we
    only want the Cloudflare action's ``with:`` block, not the whole
    job. Slice from the ``uses: cloudflare/pages-action`` line through
    the next step delimiter (a line starting with ``      - `` or the
    end of the body).
    """
    lines = deploy_body.splitlines()
    start: int | None = None
    for i, line in enumerate(lines):
        if "cloudflare/pages-action" in line:
            start = i
            break
    if start is None:
        return ""
    end = len(lines)
    # Step delimiter inside a job body: a line starting with `      - ` (six
    # spaces then a dash). Anything less indented closes the step.
    step_re = re.compile(r"^      - ")
    for j in range(start + 1, len(lines)):
        if step_re.match(lines[j]):
            end = j
            break
    return "\n".join(lines[start:end])


# ---------------------------------------------------------------------------
# 1. YAML parse validity
# ---------------------------------------------------------------------------


def test_ci_workflow_parses_as_valid_yaml() -> None:
    """`.github/workflows/ci.yml` must be parseable YAML.

    The dev's existing tests are all substring/regex based and would
    happily pass against a syntactically broken YAML file (mismatched
    indentation, dangling colons). This test locks the parse-cleanly
    invariant. Skipped if PyYAML isn't installed in the bake dev env
    (it isn't a runtime dep — see ``bake/pyproject.toml``).
    """
    yaml = pytest.importorskip("yaml", reason="PyYAML not installed in bake dev env")
    text = _ci_text()
    doc = yaml.safe_load(text)
    assert isinstance(doc, dict), f"top-level YAML must be a mapping, got {type(doc)}"
    assert "jobs" in doc, "workflow missing top-level `jobs:` key"
    jobs = doc["jobs"]
    assert isinstance(jobs, dict), f"`jobs:` must be a mapping, got {type(jobs)}"
    missing = [j for j in EXPECTED_JOBS if j not in jobs]
    assert not missing, f"YAML-parsed jobs missing: {missing}. Present: {sorted(jobs)}"


# ---------------------------------------------------------------------------
# 2. Every job pins ubuntu-22.04 (no ubuntu-latest drift)
# ---------------------------------------------------------------------------


def test_no_job_uses_ubuntu_latest_or_other_runner() -> None:
    """Every job's ``runs-on:`` is exactly ``ubuntu-22.04``.

    Tighter than the dev's "contains ubuntu-22.04" check — asserts no
    job has any other ``runs-on`` value (e.g. ``ubuntu-latest``, which
    would silently drift to whatever Ubuntu image GitHub Actions
    defaults to and break NFR-R4's byte-identical bake).
    """
    text = _ci_text()
    # Every `runs-on:` line in the file must be `runs-on: ubuntu-22.04`.
    runs_on_lines = re.findall(r"^\s*runs-on:\s*(\S.*?)\s*$", text, flags=re.MULTILINE)
    assert runs_on_lines, "workflow has no `runs-on:` lines — file likely malformed"
    bad = [v for v in runs_on_lines if v != "ubuntu-22.04"]
    assert not bad, (
        f"Found `runs-on:` values other than `ubuntu-22.04` (NFR-R4 platform pin): {bad}. "
        f"All values: {runs_on_lines}"
    )
    # And we should have one runs-on per expected job (the file may add
    # comments but each job declares exactly one).
    assert len(runs_on_lines) == len(EXPECTED_JOBS), (
        f"Expected {len(EXPECTED_JOBS)} `runs-on:` declarations (one per job); "
        f"got {len(runs_on_lines)}: {runs_on_lines}"
    )


# ---------------------------------------------------------------------------
# 3. actions/checkout pinned to @v4 everywhere
# ---------------------------------------------------------------------------


def test_actions_checkout_is_v4_everywhere() -> None:
    """No deprecated ``actions/checkout@v3`` references.

    GitHub deprecated ``checkout@v3`` (Node 16 EOL); ``@v4`` is the
    current Node-20-based revision. A silent regression to ``@v3`` would
    eventually fail with a deprecation warning + node-version error.
    """
    text = _ci_text()
    v3_uses = re.findall(r"actions/checkout@v[123](?:\b|[^0-9])", text)
    assert not v3_uses, (
        f"Found deprecated actions/checkout pin(s): {v3_uses}. "
        f"All checkouts must use @v4."
    )
    # Sanity: we still have checkout@v4 references (one per job is
    # expected; the deploy job also checks out for the artifact download).
    v4_uses = re.findall(r"actions/checkout@v4", text)
    assert len(v4_uses) >= len(EXPECTED_JOBS), (
        f"Expected ≥{len(EXPECTED_JOBS)} actions/checkout@v4 references; "
        f"got {len(v4_uses)}"
    )


# ---------------------------------------------------------------------------
# 4. Deploy gate is BOTH `refs/heads/main` AND `event_name == 'push'`
# ---------------------------------------------------------------------------


def test_deploy_gate_requires_main_branch_and_push_event() -> None:
    """The deploy job's ``if:`` must contain BOTH the branch check and
    the event-name check (AND-joined).

    A partial gate (only branch, or only event) would let a workflow_dispatch
    or schedule trigger deploy bypass the PR-preview boundary. The dev's
    existing test asserts each token appears somewhere in the if-expression;
    this test additionally asserts they are joined with ``&&``.
    """
    blocks = _job_blocks(_ci_text())
    deploy_body = blocks.get("deploy-cloudflare", "")
    assert deploy_body, "deploy-cloudflare job missing"
    if_match = re.search(r"^\s*if:\s*(.+)$", deploy_body, flags=re.MULTILINE)
    assert if_match, "deploy-cloudflare job has no `if:` gate"
    expr = if_match.group(1).strip()
    has_branch = "github.ref == 'refs/heads/main'" in expr
    has_event = "github.event_name == 'push'" in expr
    has_and = "&&" in expr
    assert has_branch and has_event and has_and, (
        f"deploy gate must be `github.ref == 'refs/heads/main' && "
        f"github.event_name == 'push'` (both conditions, AND-joined). "
        f"Got: {expr!r}"
    )


# ---------------------------------------------------------------------------
# 5. Cloudflare secrets referenced symbolically (not hardcoded)
# ---------------------------------------------------------------------------


def test_cloudflare_secrets_referenced_via_secrets_context() -> None:
    """Both Cloudflare secrets are referenced via ``${{ secrets.* }}``,
    never as literal values.

    A hardcoded API token would be a critical leak; this test trips on
    the symbolic reference for both, locking the contract that secrets
    flow through GitHub's secrets context.
    """
    text = _ci_text()
    assert "${{ secrets.CLOUDFLARE_API_TOKEN }}" in text, (
        "CLOUDFLARE_API_TOKEN must be referenced via the `${{ secrets.* }}` context"
    )
    assert "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}" in text, (
        "CLOUDFLARE_ACCOUNT_ID must be referenced via the `${{ secrets.* }}` context"
    )
    # Defense against accidental literal-value commits: a real Cloudflare
    # API token is a 40-char alphanumeric string; a real account ID is a
    # 32-char hex string. Heuristic check — look for an `apiToken:` or
    # `accountId:` line whose value is NOT a `${{ ... }}` expression.
    leaky_api = re.search(
        r"^\s*apiToken:\s*([^$\s].*?)\s*$",
        text,
        flags=re.MULTILINE,
    )
    assert leaky_api is None, (
        f"`apiToken:` line has a non-secrets-context value (possible leak): "
        f"{leaky_api.group(1)!r}"
    )
    leaky_account = re.search(
        r"^\s*accountId:\s*([^$\s].*?)\s*$",
        text,
        flags=re.MULTILINE,
    )
    assert leaky_account is None, (
        f"`accountId:` line has a non-secrets-context value (possible leak): "
        f"{leaky_account.group(1)!r}"
    )


# ---------------------------------------------------------------------------
# 6. No analytics fields in the Cloudflare pages-action invocation
# ---------------------------------------------------------------------------


def test_cloudflare_deploy_step_has_no_analytics_fields() -> None:
    """The deploy step must not enable Cloudflare Analytics.

    ADR 0019 — zero third-party analytics. The
    ``cloudflare/pages-action`` step's ``with:`` block must not contain
    any analytics opt-in field. Common drift names listed below; this
    test trips on any occurrence within the deploy step block only
    (matches against the whole file would be too noisy).
    """
    blocks = _job_blocks(_ci_text())
    deploy_body = blocks.get("deploy-cloudflare", "")
    step = _deploy_step_block(deploy_body)
    assert step, "could not locate cloudflare/pages-action step inside deploy job"
    forbidden = (
        "analyticsToken",
        "analytics_token",
        "webAnalytics",
        "web_analytics",
        "rumToken",
        "rum_token",
        "beaconToken",
        "beacon_token",
    )
    hits = [name for name in forbidden if name in step]
    assert not hits, (
        f"deploy step contains forbidden analytics field(s) per ADR 0019: {hits}. "
        f"Step block: {step!r}"
    )


# ---------------------------------------------------------------------------
# 7. _headers: /assets/* is immutable
# ---------------------------------------------------------------------------


def test_headers_assets_rule_is_immutable_one_year() -> None:
    """``web/public/_headers`` pins ``/assets/*`` to immutable 1-year cache.

    Tighter than the dev's check — asserts the ``Cache-Control:`` line
    appears immediately under the ``/assets/*`` rule (adjacency), not
    merely somewhere else in the file.
    """
    assert HEADERS_FILE.is_file(), f"missing {HEADERS_FILE}"
    text = HEADERS_FILE.read_text(encoding="utf-8")
    # Find a `/assets/*` rule line followed (after optional whitespace
    # lines) by a line containing the immutable Cache-Control header.
    m = re.search(
        r"^/assets/\*\s*\n(?:[ \t]*\n)*[ \t]+Cache-Control:\s*public,\s*max-age=31536000,\s*immutable\s*$",
        text,
        flags=re.MULTILINE,
    )
    assert m, (
        "`/assets/*` rule must be followed by "
        "`Cache-Control: public, max-age=31536000, immutable`. "
        f"File excerpt: {text[:500]!r}"
    )


# ---------------------------------------------------------------------------
# 8. _headers: HTML has a 1-hour max-age (not immutable, not forever)
# ---------------------------------------------------------------------------


def test_headers_html_rule_has_one_hour_max_age() -> None:
    """HTML must be cached for 1 hour, not indefinitely.

    HTML pages contain references to content-hashed asset URLs; caching
    them forever would freeze old asset references in CDN caches even
    after a new deploy.
    """
    text = HEADERS_FILE.read_text(encoding="utf-8")
    # Match either `/*.html` or `/` as the HTML-bearing rule.
    m = re.search(
        r"^/(?:\*\.html|)\s*\n(?:[ \t]*\n)*[ \t]+Cache-Control:\s*public,\s*max-age=3600\s*$",
        text,
        flags=re.MULTILINE,
    )
    assert m, (
        "HTML rule (`/*.html` or `/`) must be followed by "
        "`Cache-Control: public, max-age=3600`. "
        f"File excerpt: {text[:500]!r}"
    )
    # And the HTML rule must NOT carry `immutable` — that would forever-cache HTML.
    html_rule_match = re.search(
        r"^(/\*\.html|/)\s*\n((?:[ \t]+.*\n)+)",
        text,
        flags=re.MULTILINE,
    )
    if html_rule_match:
        body = html_rule_match.group(2)
        assert "immutable" not in body, (
            f"HTML rule must NOT have `immutable`; got: {body!r}"
        )


# ---------------------------------------------------------------------------
# 9. _headers: no bare /* pattern that would over-cache HTML
# ---------------------------------------------------------------------------


def test_headers_has_no_bare_wildcard_over_caching_html() -> None:
    """No bare ``/*`` rule with a long max-age that would catch HTML.

    A rule like ``/*`` (without a file-extension qualifier) would match
    every URL including HTML, and a sibling ``Cache-Control: ...
    max-age=31536000, immutable`` line would freeze HTML in caches. This
    test asserts no such pattern exists. The acceptable rule shape is
    explicit path prefixes (``/assets/*``, ``/data/*``, ``/fonts/*``,
    ``/models/*``, ``/textures/*``, ``/*.html``, ``/``).
    """
    text = HEADERS_FILE.read_text(encoding="utf-8")
    # Line that is exactly `/*` (slash-star) and nothing else.
    bare_wildcard = re.search(r"^/\*\s*$", text, flags=re.MULTILINE)
    assert bare_wildcard is None, (
        "Found bare `/*` rule in `_headers` — this would match every URL "
        "including HTML and (if followed by an immutable Cache-Control) freeze "
        "HTML in caches indefinitely. Use explicit path prefixes instead."
    )


# ---------------------------------------------------------------------------
# 10. ADR 0016 status is Accepted (not Proposed)
# ---------------------------------------------------------------------------


def test_adr_0016_status_is_accepted() -> None:
    """ADR 0016 must show ``Status: Accepted``.

    Tripwire for accidental revert to ``Proposed`` (the dev's existing
    `test_adr_0016_status_is_accepted` in test_adr_catalogue.py covers
    the same thing; this is a defense-in-depth pin within the CI
    defense module).
    """
    assert ADR_0016.is_file(), f"missing {ADR_0016}"
    text = ADR_0016.read_text(encoding="utf-8")
    # Match `Status: Accepted` near the top of the document (header
    # block), case-sensitive — the ADR template uses title case.
    m = re.search(r"^Status:\s*Accepted\s*$", text, flags=re.MULTILINE)
    assert m, "ADR 0016 must declare `Status: Accepted` at the top"
    # And the legacy `Status: Proposed` declaration must be gone.
    proposed = re.search(r"^Status:\s*Proposed\s*$", text, flags=re.MULTILINE)
    assert proposed is None, (
        "ADR 0016 still has a top-level `Status: Proposed` declaration; "
        "Story 1.14 should have flipped it to `Accepted`."
    )


# ---------------------------------------------------------------------------
# 11. docs/adr/README.md (regenerated index) shows 0016 as Accepted
# ---------------------------------------------------------------------------


def test_adr_index_lists_0016_as_accepted() -> None:
    """The regenerated index must show ADR 0016's row as ``Accepted``.

    If `scripts/adr-index.py` wasn't re-run after the ADR flip, this
    catches the staleness.
    """
    assert ADR_README.is_file(), f"missing {ADR_README}"
    text = ADR_README.read_text(encoding="utf-8")
    # The index is a markdown table; ADR 0016's row contains the digits
    # 0016 in the first column. We grep for a single line that has both
    # `0016` (with table-cell delimiter context) and `Accepted`.
    row_match = re.search(r"^\|\s*0016\s*\|.+\|\s*Accepted\s*\|.+$", text, flags=re.MULTILINE)
    assert row_match, (
        "ADR catalogue (`docs/adr/README.md`) does not show ADR 0016 as `Accepted`. "
        "Re-run `python scripts/adr-index.py` to regenerate."
    )


# ---------------------------------------------------------------------------
# 12. NFR-M4 interpretation documented somewhere maintainer-visible
# ---------------------------------------------------------------------------


def test_nfr_m4_five_minute_interpretation_documented_in_repo() -> None:
    """The NFR-M4 ≤ 5-minute interpretation note lives somewhere a future
    maintainer can find it: CI YAML comments, README's Deployment
    section, or the deferred-work log.

    Story 1.14's dev surfaced this as an open architectural question —
    the literal ≤5 min total wall-clock from NFR-M4 isn't achievable on a
    single GitHub-hosted runner that also runs the determinism re-bake.
    The dev's interpretation ("≤5 min applies to L1+L3 test execution,
    not the full bake pipeline") must be locked in maintainer-visible
    docs so the interpretation doesn't drift over time.
    """
    candidates = [CI_WORKFLOW, README, DEFERRED_WORK]
    needles = ("NFR-M4",)
    where_found: list[str] = []
    for path in candidates:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        if any(n in text for n in needles):
            where_found.append(str(path.relative_to(REPO_ROOT)))
    assert where_found, (
        "NFR-M4 / 5-minute interpretation note is not documented in any of: "
        f"{[str(p.relative_to(REPO_ROOT)) for p in candidates]}. "
        "Add a comment to `.github/workflows/ci.yml`, a note to README's "
        "Deployment section, or an entry to "
        "`_bmad-output/implementation-artifacts/deferred-work.md` "
        "explaining the dev's interpretation."
    )


# ---------------------------------------------------------------------------
# 13. web/package.json has non-empty lint + typecheck scripts
# ---------------------------------------------------------------------------


def test_web_package_json_has_lint_and_typecheck_scripts() -> None:
    """`web/package.json` parses cleanly and has non-empty `scripts.lint`
    and `scripts.typecheck`.

    Stricter than the dev's substring check — parses as JSON and asserts
    both script values are non-empty strings.
    """
    assert WEB_PKG.is_file(), f"missing {WEB_PKG}"
    doc = json.loads(WEB_PKG.read_text(encoding="utf-8"))
    scripts = doc.get("scripts", {})
    assert isinstance(scripts, dict), f"`scripts` must be a mapping, got {type(scripts)}"
    lint = scripts.get("lint")
    typecheck = scripts.get("typecheck")
    assert isinstance(lint, str) and lint.strip(), (
        f"`scripts.lint` must be a non-empty string; got {lint!r}"
    )
    assert isinstance(typecheck, str) and typecheck.strip(), (
        f"`scripts.typecheck` must be a non-empty string; got {typecheck!r}"
    )


# ---------------------------------------------------------------------------
# 14. _headers lives at web/public/_headers (the Cloudflare-expected path)
# ---------------------------------------------------------------------------


def test_headers_file_lives_at_web_public_path() -> None:
    """The ``_headers`` file must live at ``web/public/_headers``.

    Vite copies files from ``web/public/`` verbatim into the deploy
    root (``web/dist/``). Cloudflare Pages reads ``_headers`` from the
    deploy root. If the file ended up at ``web/_headers`` or
    ``web/src/_headers``, Vite would NOT copy it and the cache rules
    would silently disappear. Lock the path.
    """
    assert HEADERS_FILE.is_file(), (
        f"`_headers` must be at `web/public/_headers`; not found at {HEADERS_FILE}"
    )
    # Negative: assert no `_headers` file at sibling locations that
    # would mask the canonical one.
    misplaced = [
        REPO_ROOT / "web" / "_headers",
        REPO_ROOT / "web" / "src" / "_headers",
        REPO_ROOT / "_headers",
    ]
    bad = [p for p in misplaced if p.is_file()]
    assert not bad, (
        f"Found `_headers` at non-canonical location(s) {bad}; "
        f"Cloudflare Pages reads from `web/public/_headers` only (via Vite's "
        f"public-dir passthrough)."
    )


# ---------------------------------------------------------------------------
# 15. deploy job `needs:` lists all required gating jobs
# ---------------------------------------------------------------------------


def test_deploy_needs_includes_all_gating_jobs() -> None:
    """``deploy-cloudflare.needs:`` must list every gating job.

    A missing entry here (say someone refactors the graph and drops
    ``lint-web`` from the deploy's ``needs:``) would let a lint failure
    propagate while the deploy job fires in parallel. This test asserts
    the union: every gating job named in DEPLOY_NEEDS_REQUIRED is
    present in the deploy's ``needs:`` list.
    """
    blocks = _job_blocks(_ci_text())
    deploy_body = blocks.get("deploy-cloudflare", "")
    assert deploy_body, "deploy-cloudflare job missing"
    needs_match = re.search(r"needs:\s*\[([^\]]+)\]", deploy_body)
    assert needs_match, "deploy-cloudflare job missing `needs:` array"
    needs_list = {tok.strip() for tok in needs_match.group(1).split(",")}
    missing = [j for j in DEPLOY_NEEDS_REQUIRED if j not in needs_list]
    assert not missing, (
        f"deploy-cloudflare `needs:` is missing required gating job(s): {missing}. "
        f"Got: {sorted(needs_list)}"
    )
