export function auditTimeline(timeline = {}) {
  const events = Array.isArray(timeline.event_candidates) ? timeline.event_candidates : [];
  const sources = Array.isArray(timeline.source_records) ? timeline.source_records : [];
  const sourceIds = new Set(sources.map(item => item.id));
  const ids = new Set();
  const issues = [];

  if (timeline.status === "verified" || timeline.policy?.official_effective_law_certified !== false) {
    issues.push("candidate_timeline_must_remain_unverified");
  }

  for (const event of events) {
    if (!event.event_id || ids.has(event.event_id)) issues.push("duplicate_or_missing_event_id");
    ids.add(event.event_id);
    if (!event.article_number || !event.instrument_number) issues.push("incomplete_instrument_reference");
    if (!event.instrument_date?.value || !["hijri", "gregorian"].includes(event.instrument_date.calendar)) {
      issues.push("missing_instrument_date_or_calendar");
    }
    if (event.effective_date !== null) issues.push("effective_date_not_verified");
    if (event.verification_status === "verified") issues.push("unsupported_verified_claim");
    if (!Array.isArray(event.source_refs) || !event.source_refs.length ||
        event.source_refs.some(ref => !sourceIds.has(ref))) {
      issues.push("unresolved_source_reference");
    }
  }

  return {
    system_id:timeline.system_id || null,
    events:events.length,
    source_candidates:sources.length,
    unresolved_questions:(timeline.open_questions || []).filter(q => !q.resolved).length,
    valid:issues.length === 0,
    issues:[...new Set(issues)],
    current_law_certified:false,
    audit_scope:"candidate-metadata-only"
  };
}

export function candidateEventsForArticle(timeline, number, asOf = null) {
  return (timeline?.event_candidates || [])
    .filter(event => String(event.article_number) === String(number))
    .map(event => {
      let relation = "not_requested";
      if (asOf) {
        if (asOf.calendar !== event.instrument_date?.calendar) relation = "calendar_conversion_not_available";
        else if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(asOf.date || "")) relation = "invalid_as_of_date";
        else relation = event.instrument_date.value <= asOf.date
          ? "instrument_date_on_or_before_request"
          : "instrument_date_after_request";
      }
      return { ...event, instrument_date_relation:relation,
        legal_effect_as_of_request:"not_determined", current_text_verified:false };
    });
}
