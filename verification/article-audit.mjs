import { createHash } from "node:crypto";

const VALID_STATES = new Set(["verified", "partial", "unverified", "needs_review"]);
const PLACEHOLDERS = /^(?:تعديلات?\s+الماد[هة]|نص\s+مؤقت|قيد\s+التحقق|pending|placeholder|to\s*do|tbd)[\s.:،]*$/iu;

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validHttpsUrl(value) {
  if (!clean(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function auditArticle(record = {}) {
  const articleNumber = clean(record.article_number);
  const status = clean(record?.verification?.status) || "unverified";
  const text = clean(record.current_text);
  const officialUrls = Array.isArray(record.source_urls) ?
    record.source_urls.filter(validHttpsUrl) : [];
  const sourceReferences = Array.isArray(record.sources) ? record.sources : [];
  const previous = Array.isArray(record.previous_texts) ? record.previous_texts : [];
  const instrumentRefs = Array.isArray(record.amending_instruments) ?
    record.amending_instruments.filter(Boolean) : [];
  const blockerCodes = [];
  const gapCodes = [];

  if (!articleNumber) blockerCodes.push("article_number_missing");
  if (!clean(record.system_id)) blockerCodes.push("system_id_missing");
  if (!text) blockerCodes.push("current_text_missing");
  if (PLACEHOLDERS.test(text)) blockerCodes.push("placeholder_is_not_law");
  if (!VALID_STATES.has(status)) blockerCodes.push("invalid_verification_status");
  if (!sourceReferences.length && !officialUrls.length) blockerCodes.push("no_source_trace");

  if (!officialUrls.length) gapCodes.push("no_official_source_url");
  if (!clean(record.effective_date)) gapCodes.push("effective_date_unknown");
  if (!clean(record?.verification?.verified_at)) gapCodes.push("last_official_verification_unknown");
  if (!clean(record?.verification?.content_sha256)) gapCodes.push("verified_text_hash_missing");
  if (status !== "verified") gapCodes.push("not_verified_current_law");

  const amendments = Array.isArray(record.amendments) ? record.amendments : [];
  if (amendments.length && !instrumentRefs.length) {
    gapCodes.push("amending_instrument_not_identified");
  }
  for (const prior of previous) {
    if (!clean(prior?.effective_from) || !clean(prior?.effective_to)) {
      gapCodes.push("previous_version_period_incomplete");
      break;
    }
  }

  const expectedHash = clean(record?.verification?.content_sha256).toLowerCase();
  const computedHash = text ?
    createHash("sha256").update(text, "utf8").digest("hex") : null;
  if (expectedHash && computedHash && expectedHash !== computedHash) {
    blockerCodes.push("text_hash_mismatch");
  }

  // Verified is a metadata assertion, never proof of official legal validity.
  if (status === "verified" &&
      (blockerCodes.length || gapCodes.some(code => code !== "not_verified_current_law"))) {
    blockerCodes.push("verified_claim_lacks_evidence");
  }

  return {
    article_number: articleNumber || null,
    declared_status: status,
    authoritative_current_law_established: false,
    eligible_for_verified_promotion: false,
    snapshot_trace_present: sourceReferences.length > 0,
    official_source_links: officialUrls.length,
    blocker_codes: [...new Set(blockerCodes)],
    gap_codes: [...new Set(gapCodes)],
    computed_text_sha256: computedHash
  };
}

export function auditDataset(dataset = {}) {
  const articles = Array.isArray(dataset.articles) ? dataset.articles : [];
  const seen = new Set();
  const records = articles.map(article => {
    const outcome = auditArticle(article);
    const number = outcome.article_number;
    if (number && seen.has(number)) outcome.blocker_codes.push("duplicate_article_number");
    if (number) seen.add(number);
    return outcome;
  });
  const countBy = key => records.reduce((counts, record) => {
    for (const code of record[key]) counts[code] = (counts[code] || 0) + 1;
    return counts;
  }, {});
  return {
    audit_version: "1.0.0",
    corpus: "saudi-legal-corpus",
    generated_from: dataset.generated_from || null,
    expected_article_count: Number.isInteger(dataset.article_count) ? dataset.article_count : null,
    audited_articles: records.length,
    article_count_matches: Number.isInteger(dataset.article_count) ?
      dataset.article_count === records.length : null,
    verified_article_count: records.filter(r => r.declared_status === "verified").length,
    automatically_promoted: 0,
    blocker_counts: countBy("blocker_codes"),
    gap_counts: countBy("gap_codes"),
    priority_articles: records.filter(r => ["16", "17", "19"].includes(r.article_number)),
    records,
    summary: "This is a metadata/snapshot audit, not an independent official-source verification."
  };
}
