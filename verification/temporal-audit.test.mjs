import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { auditTimeline, candidateEventsForArticle } from "./temporal-audit.mjs";

const timeline=JSON.parse(fs.readFileSync(
 new URL("../amendments/personnel-service-law.timeline.needs-review.json", import.meta.url),
 "utf8"
));

test("amendment candidate metadata is consistent but never law",()=>{
 const result=auditTimeline(timeline);
 assert.equal(result.valid,true);
 assert.equal(result.events,4);
 assert.equal(result.source_candidates,3);
 assert.equal(result.current_law_certified,false);
 assert.ok(result.unresolved_questions >= 4);
});

test("Article 16 has review-only candidate, no effective date",()=>{
 const candidates=candidateEventsForArticle(timeline,"16");
 assert.equal(candidates.length,1);
 assert.equal(candidates[0].effective_date,null);
 assert.equal(candidates[0].current_text_verified,false);
});

test("Article 17 instruments are leads not certified amendments",()=>{
 const candidates=candidateEventsForArticle(timeline,"17",{calendar:"hijri",date:"1420-01-01"});
 assert.equal(candidates.length,3);
 assert.ok(candidates.some(item=>item.instrument_date_relation==="instrument_date_after_request"));
 assert.ok(candidates.every(item=>item.legal_effect_as_of_request==="not_determined"));
});

test("Gregorian as-of cannot silently compare to Hijri instrument dates",()=>{
 const candidates=candidateEventsForArticle(timeline,"17",{calendar:"gregorian",date:"2026-10-09"});
 assert.ok(candidates.every(item=>item.instrument_date_relation==="calendar_conversion_not_available"));
});

test("no article 19 amendment claim is invented",()=>{
 assert.equal(candidateEventsForArticle(timeline,"19").length,0);
});
