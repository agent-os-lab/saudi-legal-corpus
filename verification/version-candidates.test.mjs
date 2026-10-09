import test from "node:test";
import assert from "node:assert/strict";
import { auditCandidateCollection, runCandidateAudit } from "./version-candidates.audit.mjs";

test("focus articles are indexed without verification promotion",()=>{
 const report=runCandidateAudit();
 assert.equal(report.articles_reviewed,3);
 assert.equal(report.articles_with_verified_current_law,0);
 assert.equal(report.auto_promoted,0);
 assert.equal(report.articles_missing_candidates,0);
 assert.ok(report.results.find(x=>x.article_number==="17").open_conflicts>0);
});
test("manual official-source comparison and dates are required",()=>{
 const report=auditCandidateCollection({
  system_id:"personnel-service-law",article_number:"16",calendar:"hijri",
  current_law_verified:false,versions:[{version_id:"test",verification_status:"needs_review",
    source:{url:"https://laws.boe.gov.sa/",independently_document_compared:false},
    effective_from:null,text_sha256:null,reviewer_approval:null}]
 });
 assert.ok(report.gaps.includes("official_source_document_not_compared"));
 assert.ok(report.gaps.includes("effective_from_not_verified"));
 assert.equal(report.current_law_verified,false);
});
test("candidate collection cannot falsely declare verified",()=>{
 const report=auditCandidateCollection({
  system_id:"personnel-service-law",article_number:"16",calendar:"hijri",
  current_law_verified:true,versions:[{version_id:"test",verification_status:"verified",
    source:{url:"https://laws.boe.gov.sa/",independently_document_compared:false}}]
 });
 assert.ok(report.blockers.includes("candidate_file_cannot_assert_current_law"));
 assert.ok(report.blockers.includes("unexpected_verified_candidate_requires_manual_review"));
});
