#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "api" / "manifest.v1.json"


def fail(message: str) -> None:
    print(f"[corpus-verify] ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"missing file: {path.relative_to(ROOT)}")
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON {path.relative_to(ROOT)}: {exc}")


def safe_repo_path(value: str) -> Path:
    if not isinstance(value, str) or not value.strip():
        fail("manifest path must be a non-empty string")
    candidate = (ROOT / value).resolve()
    try:
        candidate.relative_to(ROOT.resolve())
    except ValueError:
        fail(f"path escapes repository: {value}")
    return candidate


def canonical_article_payload(article: dict) -> str:
    payload = {
        "system_id": article.get("system_id"),
        "article_number": article.get("article_number"),
        "current_text": article.get("current_text"),
        "previous_texts": article.get("previous_texts", []),
        "effective_date": article.get("effective_date"),
        "amendments": article.get("amendments", []),
        "amending_instruments": article.get("amending_instruments", []),
        "sources": article.get("sources", []),
        "source_urls": article.get("source_urls", []),
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


manifest = load_json(MANIFEST)

if manifest.get("version") != 1:
    fail("manifest version must be 1")
if manifest.get("jurisdiction") != "Saudi Arabia":
    fail("manifest jurisdiction must be Saudi Arabia")
if manifest.get("repository") != "agent-os-lab/saudi-legal-corpus":
    fail("manifest repository identity mismatch")

policy = manifest.get("consumption_policy") or {}
expected_policy = {
    "qada_minimum_verification_status": "verified",
    "allow_needs_review_in_argument_generation": False,
    "allow_partial_in_argument_generation": False,
    "fail_closed_on_unknown_status": True,
}
for key, expected in expected_policy.items():
    if policy.get(key) != expected:
        fail(f"unsafe consumption policy: {key}={policy.get(key)!r}, expected {expected!r}")

systems = manifest.get("systems")
if not isinstance(systems, list):
    fail("manifest systems must be an array")

checked_verified_articles = 0
for system in systems:
    if not isinstance(system, dict):
        fail("system manifest entry must be an object")

    system_id = str(system.get("id") or "")
    status = system.get("verification_status")
    eligible = system.get("qada_eligible")

    if status not in {"verified", "partial", "unverified", "needs_review"}:
        fail(f"{system_id}: unknown verification_status {status!r}")
    if not isinstance(eligible, bool):
        fail(f"{system_id}: qada_eligible must be boolean")
    if eligible and status != "verified":
        fail(f"{system_id}: qada_eligible=true requires verification_status=verified")

    meta_path = safe_repo_path(system.get("system_meta_path", ""))
    dataset_path = safe_repo_path(system.get("article_dataset_path", ""))
    load_json(meta_path)
    dataset = load_json(dataset_path)

    articles = dataset.get("articles")
    if not isinstance(articles, list):
        fail(f"{system_id}: article dataset must contain articles[]")

    if eligible:
        if not articles:
            fail(f"{system_id}: eligible system has no articles")

        for article in articles:
            if not isinstance(article, dict):
                fail(f"{system_id}: article record must be an object")
            number = str(article.get("article_number") or "?")
            verification = article.get("verification") or {}
            if verification.get("status") != "verified":
                fail(f"{system_id} article {number}: eligible dataset contains non-verified record")
            if not article.get("current_text"):
                fail(f"{system_id} article {number}: verified article lacks current_text")
            if not isinstance(article.get("sources"), list) or not article.get("sources"):
                fail(f"{system_id} article {number}: verified article lacks sources")
            if not isinstance(article.get("source_urls"), list) or not article.get("source_urls"):
                fail(f"{system_id} article {number}: verified article lacks source_urls")
            digest = verification.get("content_sha256")
            if not isinstance(digest, str) or len(digest) != 64:
                fail(f"{system_id} article {number}: verified article lacks 64-char content_sha256")
            computed = hashlib.sha256(canonical_article_payload(article).encode("utf-8")).hexdigest()
            if digest != computed:
                fail(f"{system_id} article {number}: content_sha256 mismatch")
            checked_verified_articles += 1

judgments = manifest.get("judgments_principles")
if not isinstance(judgments, list):
    fail("manifest judgments_principles must be an array")
for corpus in judgments:
    if not isinstance(corpus, dict):
        fail("judgment corpus entry must be an object")
    status = corpus.get("verification_status")
    eligible = corpus.get("qada_eligible")
    if status not in {"verified", "partial", "unverified", "needs_review"}:
        fail(f"judgment corpus {corpus.get('id')}: unknown verification status")
    if eligible and status != "verified":
        fail(f"judgment corpus {corpus.get('id')}: qada_eligible requires verified")
    safe_repo_path(str(corpus.get("path") or ""))

print(json.dumps({
    "ok": True,
    "systems": len(systems),
    "eligible_systems": sum(1 for item in systems if item.get("qada_eligible") is True),
    "verified_articles_checked": checked_verified_articles,
    "judgment_corpora": len(judgments),
}, ensure_ascii=False, indent=2))
