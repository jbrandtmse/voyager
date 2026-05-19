"""Story 1.14 CI workflow defense tests.

The CI workflow at ``.github/workflows/ci.yml`` carries several load-bearing
constraints that aren't enforced by GitHub Actions itself — they're project
invariants that drift would silently break:

- **NFR-R4 byte-identical bake** depends on the ``ubuntu-22.04`` runner pin
  (architecture line 486: the CSPICE wheel is the platform-pinned input that
  makes the bake reproducible). A bump to ``ubuntu-latest`` or
  ``ubuntu-24.04`` would silently change CSPICE's wheel hash and tank the
  determinism re-bake.
- **LFS-tracked kernels** must be pulled on checkout. Without ``lfs: true``
  on at least the bake + test-web + validate-l1 + build jobs, the kernels
  and ``voyager.glb`` are absent and the jobs fail with cryptic
  "file not found" errors.
- **Deploy gating** must be ``main + push`` only — never PRs (PRs get
  preview deploys via Cloudflare's GitHub integration; a workflow-driven
  deploy from a PR would publish unreviewed code).
- **All eight gating jobs** must exist and the deploy job must depend on
  all of them.

This test reads ``.github/workflows/ci.yml`` and asserts those invariants
textually. It deliberately does not import a YAML parser — the YAML file's
shape is stable and small enough that substring matching is robust and
keeps the test free of an extra dependency.

Pytest-only; no Playwright / browser dependency.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CI_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "ci.yml"

EXPECTED_JOBS = (
    "lint-bake",
    "lint-web",
    "typecheck-web",
    "bake",
    "validate-l1",
    "test-bake",
    "test-web",
    "build",
    "deploy-cloudflare",
)

# Jobs that must check out LFS-tracked content (kernels, models, fixtures).
# lint-bake / lint-web / typecheck-web don't need kernels — they only read
# source, so `lfs: false` (or absent + default) is fine for those.
LFS_REQUIRED_JOBS = (
    "bake",
    "validate-l1",
    "test-bake",
    "test-web",
    "build",
)


def _ci_text() -> str:
    assert CI_WORKFLOW.is_file(), f"CI workflow missing at {CI_WORKFLOW}"
    return CI_WORKFLOW.read_text(encoding="utf-8")


def _job_blocks(text: str) -> dict[str, str]:
    """Slice the file into per-job text blocks keyed by job id.

    A "job block" starts at the ``  <job-id>:`` line (two-space indent) under
    ``jobs:`` and extends until the next sibling job header or EOF. The
    function is intentionally a hand-rolled text scan rather than a YAML
    parse — the workflow file's shape is stable and the substring-based
    assertions in this module don't benefit from a real parse tree.
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
        # A top-level key at column 0 would end the jobs block, but our
        # workflow has nothing after `jobs:` so this branch is defensive.
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


def test_ci_workflow_exists() -> None:
    """AC2: `.github/workflows/ci.yml` is present."""
    assert CI_WORKFLOW.is_file(), f"CI workflow missing at {CI_WORKFLOW}"


def test_ci_workflow_triggers_on_main_push_and_pr() -> None:
    """AC2: workflow runs on push to main + PRs targeting main."""
    text = _ci_text()
    assert re.search(r"on:\s*\n\s*push:\s*\n\s*branches:\s*\[\s*main\s*\]", text), (
        "CI workflow must trigger on push to main"
    )
    assert re.search(
        r"pull_request:\s*\n\s*branches:\s*\[\s*main\s*\]",
        text,
    ), "CI workflow must trigger on pull_request to main"


def test_ci_workflow_has_all_expected_jobs() -> None:
    """AC2: all eight gating jobs plus the deploy job are defined."""
    blocks = _job_blocks(_ci_text())
    missing = [j for j in EXPECTED_JOBS if j not in blocks]
    assert not missing, f"CI workflow missing jobs: {missing}. Present: {sorted(blocks)}"


def test_every_job_runs_on_ubuntu_22_04() -> None:
    """NFR-R4: every job pins ``runs-on: ubuntu-22.04``.

    Architecture line 486 — the CSPICE wheel is platform-pinned, and the
    byte-identical re-bake gate depends on the runner OS image being stable.
    A drift to ``ubuntu-latest`` would silently re-roll the wheel hash.
    """
    blocks = _job_blocks(_ci_text())
    for jid in EXPECTED_JOBS:
        body = blocks.get(jid, "")
        assert "runs-on: ubuntu-22.04" in body, (
            f"job '{jid}' does not pin runs-on: ubuntu-22.04 (NFR-R4). "
            f"Body excerpt: {body[:200]!r}"
        )


def test_lfs_required_jobs_check_out_with_lfs_true() -> None:
    """Kernels, models, and L2 fixtures are LFS-tracked; checkout needs lfs: true."""
    blocks = _job_blocks(_ci_text())
    for jid in LFS_REQUIRED_JOBS:
        body = blocks.get(jid, "")
        # The checkout step pattern: `uses: actions/checkout@v4` followed
        # within the same step by `with:` → `lfs: true`. We assert the
        # `lfs: true` token appears in the job body, which is sufficient
        # given each job has exactly one checkout step.
        assert "uses: actions/checkout@v4" in body, (
            f"job '{jid}' is missing `uses: actions/checkout@v4`"
        )
        assert "lfs: true" in body, (
            f"job '{jid}' must check out with `lfs: true` (kernels/models/fixtures "
            f"are LFS-tracked). Body excerpt: {body[:300]!r}"
        )


def test_deploy_job_is_gated_on_main_push_only() -> None:
    """AC4: deploy fires only on push to main — never on PRs."""
    blocks = _job_blocks(_ci_text())
    deploy_body = blocks.get("deploy-cloudflare", "")
    assert deploy_body, "deploy-cloudflare job missing"
    # The gate may be written across one or two lines depending on YAML
    # quoting, but both `refs/heads/main` and `github.event_name == 'push'`
    # must appear in the same `if:` expression.
    if_line_match = re.search(
        r"^\s*if:\s*(.+)$",
        deploy_body,
        flags=re.MULTILINE,
    )
    assert if_line_match, "deploy-cloudflare job missing `if:` gate"
    if_expr = if_line_match.group(1)
    assert "refs/heads/main" in if_expr, (
        f"deploy gate must include `refs/heads/main`. Got: {if_expr!r}"
    )
    assert "github.event_name == 'push'" in if_expr, (
        f"deploy gate must include `github.event_name == 'push'`. Got: {if_expr!r}"
    )


def test_deploy_job_needs_all_gating_jobs() -> None:
    """AC4: deploy `needs:` lists every fast-tier gate so PRs cannot bypass."""
    blocks = _job_blocks(_ci_text())
    deploy_body = blocks.get("deploy-cloudflare", "")
    needs_match = re.search(r"needs:\s*\[([^\]]+)\]", deploy_body)
    assert needs_match, "deploy-cloudflare job missing `needs:` edge list"
    needs_list = {token.strip() for token in needs_match.group(1).split(",")}
    required = set(EXPECTED_JOBS) - {"deploy-cloudflare"}
    missing = required - needs_list
    assert not missing, (
        f"deploy-cloudflare needs list is missing dependencies: {sorted(missing)}. "
        f"Got: {sorted(needs_list)}"
    )


def test_deploy_uses_cloudflare_pages_action_with_required_secrets() -> None:
    """ADR 0016: deploy uses the official Cloudflare Pages action with the
    two repo secrets (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID).
    """
    text = _ci_text()
    assert "cloudflare/pages-action" in text, (
        "deploy must use the cloudflare/pages-action GitHub Action"
    )
    assert "${{ secrets.CLOUDFLARE_API_TOKEN }}" in text, (
        "deploy must reference the CLOUDFLARE_API_TOKEN repo secret"
    )
    assert "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}" in text, (
        "deploy must reference the CLOUDFLARE_ACCOUNT_ID repo secret"
    )


def test_bake_job_has_determinism_re_run() -> None:
    """NFR-R4: the bake job must execute the bake twice and assert SHA equality.

    The byte-identical re-bake is the proof that NFR-R4 holds; removing it
    would let any non-deterministic drift in the bake pipeline ship silently.
    """
    blocks = _job_blocks(_ci_text())
    bake_body = blocks.get("bake", "")
    # Two `bake_trajectories` invocations in the same job.
    invocations = re.findall(r"bake_trajectories", bake_body)
    assert len(invocations) >= 2, (
        f"bake job must invoke bake_trajectories at least twice (determinism "
        f"re-bake), found {len(invocations)}"
    )
    # SHA comparison step must appear.
    assert "sha256sum" in bake_body, (
        "bake job must SHA-compare the two bake outputs (NFR-R4 byte-identical proof)"
    )
    assert "diff" in bake_body, (
        "bake job must `diff` the SHA snapshots to fail loudly on drift"
    )


def test_headers_file_exists_and_has_required_cache_rules() -> None:
    """AC5: `web/public/_headers` ships the immutable + HTML Cache-Control rules."""
    headers_file = REPO_ROOT / "web" / "public" / "_headers"
    assert headers_file.is_file(), f"missing {headers_file}"
    text = headers_file.read_text(encoding="utf-8")
    assert "/assets/*" in text, "_headers missing /assets/* rule"
    assert "Cache-Control: public, max-age=31536000, immutable" in text, (
        "_headers missing immutable Cache-Control rule for /assets/*"
    )
    assert "/*.html" in text, "_headers missing /*.html rule"
    assert "Cache-Control: public, max-age=3600" in text, (
        "_headers missing 1-hour Cache-Control rule for HTML"
    )


def test_package_json_has_lint_and_typecheck_scripts() -> None:
    """AC2 Task 3: `npm run lint` + `npm run typecheck` must be defined."""
    pkg = REPO_ROOT / "web" / "package.json"
    assert pkg.is_file(), f"missing {pkg}"
    text = pkg.read_text(encoding="utf-8")
    assert '"lint":' in text, "web/package.json missing `lint` script"
    assert '"typecheck":' in text, "web/package.json missing `typecheck` script"
    assert "eslint" in text, "lint script must reference eslint"
    assert "tsc --noEmit" in text, "typecheck script must use `tsc --noEmit`"
