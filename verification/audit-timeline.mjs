import fs from "node:fs";
import { auditTimeline } from "./temporal-audit.mjs";

const file=new URL("../amendments/personnel-service-law.timeline.needs-review.json",import.meta.url);
const timeline=JSON.parse(fs.readFileSync(file,"utf8"));
const report=auditTimeline(timeline);
process.stdout.write(JSON.stringify(report,null,2)+"\n");
if(!report.valid) process.exitCode=2;
