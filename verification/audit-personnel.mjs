import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { auditDataset } from "./article-audit.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const corpusRoot = path.resolve(here, "..");
const systemRoot = path.join(corpusRoot, "systems", "نظام-خدمة-الأفراد");
const datasetFile = path.join(systemRoot, "normalized", "articles.needs-review.json");
const systemFile = path.join(systemRoot, "system.json");

const dataset = JSON.parse(fs.readFileSync(datasetFile, "utf8").replace(/^\uFEFF/, ""));
const system = JSON.parse(fs.readFileSync(systemFile, "utf8").replace(/^\uFEFF/, ""));
const report = auditDataset(dataset);

const snapshot = path.resolve(systemRoot, system.source_snapshot ?? "");
if (!snapshot.startsWith(systemRoot + path.sep) || !fs.existsSync(snapshot)) {
  report.raw_snapshot = { present:false, source_path:system.source_snapshot ?? null };
} else {
  const bytes = fs.readFileSync(snapshot);
  report.raw_snapshot = {
    present:true,
    source_path:system.source_snapshot,
    sha256:createHash("sha256").update(bytes).digest("hex"),
    size_bytes:bytes.length
  };
}
report.system_id = system.id;
report.system_status = system.verification?.status ?? "unknown";
report.meta_issue_count = (system.issuing_instruments ?? []).filter(item =>
  typeof item.verification_note === "string" && item.verification_note.length
).length;
report.legal_validity_confirmed = false;
report.safe_to_use_as_current_law = false;

const compact = process.argv.includes("--summary");
process.stdout.write(JSON.stringify(
  compact ? {
    system_id:report.system_id,
    audited_articles:report.audited_articles,
    article_count_matches:report.article_count_matches,
    verified_article_count:report.verified_article_count,
    blocker_counts:report.blocker_counts,
    gap_counts:report.gap_counts,
    priority_articles:report.priority_articles,
    raw_snapshot:report.raw_snapshot,
    meta_issue_count:report.meta_issue_count,
    legal_validity_confirmed:false,
    safe_to_use_as_current_law:false
  } : report, null, 2) + "\n");

if (!report.article_count_matches ||
    report.records.some(item => item.blocker_codes.includes("duplicate_article_number"))) {
  process.exitCode = 2;
}
