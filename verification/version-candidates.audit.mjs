import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const VERSION_ROOT=path.resolve(here,"..","systems","نظام-خدمة-الأفراد","versions");
const FOCUS=["16","17","19"];

export function auditCandidateCollection(collection) {
  const blockers=[];
  const gaps=[];
  const versions=Array.isArray(collection?.versions) ? collection.versions : [];
  const ids=new Set();
  if(!collection?.system_id || !collection?.article_number) blockers.push("missing_system_or_article");
  if(!["hijri","gregorian"].includes(collection?.calendar))blockers.push("unknown_calendar");
  if(!versions.length)blockers.push("candidate_versions_missing");
  for(const item of versions){
    if(!item?.version_id || ids.has(item.version_id))blockers.push("duplicate_or_missing_version_id");
    ids.add(item?.version_id);
    if(item?.verification_status==="verified")blockers.push("unexpected_verified_candidate_requires_manual_review");
    if(item?.verification_status!=="needs_review")gaps.push("nonstandard_pending_status");
    if(!item?.source?.url?.startsWith("https://"))gaps.push("official_source_url_missing");
    if(item?.source?.independently_document_compared!==true)gaps.push("official_source_document_not_compared");
    if(!item?.effective_from)gaps.push("effective_from_not_verified");
    if(!item?.text_sha256)gaps.push("source_text_hash_not_attested");
    if(!item?.reviewer_approval)gaps.push("reviewer_approval_missing");
  }
  const conflicts=Array.isArray(collection?.conflicts) ?
    collection.conflicts.filter(x=>x?.status==="open"):[];
  if(conflicts.length)gaps.push("material_source_conflict");
  if(collection?.current_law_verified===true)blockers.push("candidate_file_cannot_assert_current_law");
  return {
    article_number:collection?.article_number??null,
    candidate_versions:versions.length,
    open_conflicts:conflicts.length,
    current_law_verified:false,
    blockers:[...new Set(blockers)],
    gaps:[...new Set(gaps)]
  };
}

export function runCandidateAudit(root=VERSION_ROOT) {
  const entries=FOCUS.map(article=>{
    const filepath=path.join(root,article+".candidates.json");
    try{
      const obj=JSON.parse(fs.readFileSync(filepath,"utf8").replace(/^\uFEFF/,""));
      if(String(obj.article_number)!==article)throw Error("article mismatch");
      return auditCandidateCollection(obj);
    }catch(error){
      return {article_number:article,candidate_versions:0,open_conflicts:0,
        blockers:["candidate_file_unavailable_or_invalid"],gaps:[],error:String(error.message||error)};
    }
  });
  return {
    audit:"personnel-priority-article-version-candidates",
    articles_reviewed:FOCUS.length,
    candidates_total:entries.reduce((sum,x)=>sum+x.candidate_versions,0),
    articles_with_verified_current_law:0,
    articles_with_open_conflicts:entries.filter(x=>x.open_conflicts).length,
    articles_missing_candidates:entries.filter(x=>x.blockers.includes("candidate_file_unavailable_or_invalid")).length,
    auto_promoted:0,
    results:entries,
    note:"Candidate index is research evidence, not official effective version reconstruction."
  };
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const report=runCandidateAudit();
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
  if(report.articles_missing_candidates)process.exitCode=2;
}
