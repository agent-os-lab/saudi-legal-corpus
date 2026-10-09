import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { auditArticle, auditDataset } from "./article-audit.mjs";

test("placeholder is not current law even when copied from raw source", () => {
  const record = auditArticle({
    system_id:"personnel-service-law",
    article_number:"16",
    current_text:"تعديلات المادة",
    sources:["raw snapshot"],
    effective_date:null,
    verification:{status:"needs_review"}
  });
  assert.equal(record.authoritative_current_law_established,false);
  assert.ok(record.blocker_codes.includes("placeholder_is_not_law"));
  assert.ok(record.gap_codes.includes("not_verified_current_law"));
  assert.ok(record.gap_codes.includes("effective_date_unknown"));
});

test("unverified article 19 remains unverified regardless of source snapshot", () => {
  const record = auditArticle({
    system_id:"personnel-service-law",
    article_number:"19",
    current_text:"نص مبدئي",
    sources:["raw snapshot"],
    verification:{status:"needs_review"}
  });
  assert.equal(record.eligible_for_verified_promotion,false);
  assert.ok(record.gap_codes.includes("no_official_source_url"));
});

test("metadata falsely marked verified with wrong SHA is blocked", () => {
  const item = auditArticle({
    system_id:"personnel-service-law",
    article_number:"17",
    current_text:"نص قانوني",
    source_urls:["https://laws.boe.gov.sa/"],
    effective_date:"1447-01-01",
    verification:{status:"verified",verified_at:"2026-10-09",content_sha256:"0".repeat(64)}
  });
  assert.ok(item.blocker_codes.includes("text_hash_mismatch"));
  assert.ok(item.blocker_codes.includes("verified_claim_lacks_evidence"));
});

test("even consistent metadata never self-certifies legal validity", () => {
  const text = "نص تجريبي";
  const item = auditArticle({
    system_id:"personnel-service-law",
    article_number:"1",
    current_text:text,
    source_urls:["https://laws.boe.gov.sa/"],
    effective_date:"1447-01-01",
    verification:{
      status:"verified",verified_at:"2026-10-09",
      content_sha256:createHash("sha256").update(text).digest("hex")
    }
  });
  assert.equal(item.blocker_codes.length,0);
  assert.equal(item.authoritative_current_law_established,false);
  assert.equal(item.eligible_for_verified_promotion,false);
});

test("duplicate article numbers are reported", () => {
  const record = {system_id:"x", article_number:"16", current_text:"نص", sources:["raw"], verification:{status:"needs_review"}};
  const report = auditDataset({article_count:2,articles:[record,{...record}]});
  assert.equal(report.audited_articles,2);
  assert.equal(report.article_count_matches,true);
  assert.equal(report.blocker_counts.duplicate_article_number,1);
  assert.equal(report.automatically_promoted,0);
});
