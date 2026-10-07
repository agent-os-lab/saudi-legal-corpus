#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "api" / "manifest.v1.json"

def fail(message: str) -> None:
    raise SystemExit(f"CORPUS_VERIFY_FAILED: {message}")

def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"cannot read {path.relative_to(ROOT)}: {exc}")

manifest = load_json(MANIFEST)

if manifest.get("version") != 1:
    fail("manifest version must be 1")
if manifest.get("jurisdiction") != "Saudi Arabia":
    fail("jurisdiction must be Saudi Arabia")
if manifest.get("repository") != "agent-os-lab/saudi-legal-corpus":
    fail("repository identity mismatch")

policy = manifest.get("consumption_policy") or {}
expected_policy = {
    "qada_minimum_verification_status": "verified",
    "allow_needs_review_in_argument_generation": False,
    "allow_partial_in_argument_generation": False,
    "fail_closed_on_unknown_status": True,
}
for key, expected in expected_policy.items():
    if policy.get(key) != expected:
        fail(f"unsafe consumption policy: {key}")

systems = manifest.get("systems")
if not isinstance(systems, list):
    fail("systems must be a list")

eligible_count = 0
for system in systems:
    if not isinstance(system, dict):
        fail("system entry must be an object")
    system_id = str(system.get("id") or "")
    status = system.get("verification_status")
    eligible = system.get("qada_eligible")
    if status not in {"verified", "partial", "unverified", "needs_review"}:
        fail(f"{system_id}: unknown verification status {status!r}")
    if not isinstance(eligible, bool):
        fail(f"{system_id}: qada_eligible must be boolean")

    for key in ("system_meta_path", "article_dataset_path"):
        rel = system.get(key)
        if not isinstance(rel, str) or not rel:
            fail(f"{system_id}: missing {key}")
        path = ROOT / rel
        if not path.is_file():
            fail(f"{system_id}: {key} does not exist: {rel}")

    if eligible:
        eligible_count += 1
        if status != "verified":
            fail(f"{system_id}: qada_eligible requires verification_status=verified")

        dataset_path = ROOT / system["article_dataset_path"]
        dataset = load_json(dataset_path)
        articles = dataset.get("articles")
        if not isinstance(articles, list) or not articles:
            fail(f"{system_id}: eligible article dataset must contain articles")
        for article in articles:
            article_number = str(article.get("article_number") or "?") if isinstance(article, dict) else "?"
            verification = article.get("verification") if isinstance(article, dict) else None
            if not isinstance(verification, dict) or verification.get("status") != "verified":
                fail(f"{system_id} article {article_number}: eligible dataset contains non-verified record")
            if not verification.get("content_sha256"):
                fail(f"{system_id} article {article_number}: verified record missing content_sha256")
            if not article.get("sources"):
                fail(f"{system_id} article {article_number}: verified record missing sources")

print(json.dumps({
    "ok": True,
    "systems": len(systems),
    "qada_eligible_systems": eligible_count,
    "policy": "fail-closed",
}, ensure_ascii=False, indent=2))
