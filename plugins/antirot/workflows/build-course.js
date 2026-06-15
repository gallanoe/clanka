export const meta = {
  name: 'antirot-build-course',
  description: 'Fan out lesson-writers against a frozen manifest, then review each lesson adversarially as it lands.',
  whenToUse: 'Invoked by the /antirot command after the design gate and after build-artifacts has written the skeleton. Not run directly.',
  phases: [
    { title: 'Research', detail: 'fetch real sources for grounding-required concepts before any prose is written' },
    { title: 'Write', detail: 'one lesson-writer per note, parallel; model routed by criticality' },
    { title: 'Review', detail: 'claim-level adversarial review of each lesson as soon as it is written' },
    { title: 'Cross-check', detail: 'single pass over named seams: notation, terminology, link legality' },
  ],
}

// args = the approved manifest object (the workflow has no filesystem access,
// so the command reads .antirot/manifest.json and passes it in here).
const m = args
if (!m || !Array.isArray(m.notes)) {
  log('no manifest passed as args — aborting')
  return { error: 'missing-manifest' }
}

const conceptById = new Map(m.concepts.map((c) => [c.id, c]))

const WRITE_RESULT = {
  type: 'object',
  required: ['slug', 'status', 'amendments'],
  additionalProperties: false,
  properties: {
    slug: { type: 'string' },
    status: { enum: ['complete', 'blocked'] },
    amendments: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'detail'],
        additionalProperties: false,
        properties: {
          type: { enum: ['missing-prereq', 'mis-homed', 'needs-split', 'other'] },
          detail: { type: 'string' },
          concept: { type: 'string' },
        },
      },
    },
  },
}

const REVIEW = {
  type: 'object',
  required: ['slug', 'verdict', 'findings'],
  additionalProperties: false,
  properties: {
    slug: { type: 'string' },
    verdict: { enum: ['pass', 'revise'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['kind', 'detail'],
        additionalProperties: false,
        properties: {
          kind: { enum: ['wrong-definition', 'wrong-proof', 'wrong-example', 'pacing', 'forward-ref', 'notation', 'other'] },
          detail: { type: 'string' },
        },
      },
    },
  },
}

const SEAMS = {
  type: 'object',
  required: ['seamFindings'],
  additionalProperties: false,
  properties: {
    seamFindings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['seam', 'detail'],
        additionalProperties: false,
        properties: {
          seam: { enum: ['notation', 'terminology', 'link', 'redundant-reteach', 'voice'] },
          detail: { type: 'string' },
        },
      },
    },
  },
}

const SOURCES = {
  type: 'object',
  required: ['sources'],
  additionalProperties: false,
  properties: {
    sources: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'url'],
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          url: { type: 'string' },
          kind: { enum: ['paper', 'book', 'docs', 'reference', 'tutorial', 'other'] },
          note: { type: 'string' },
        },
      },
    },
  },
}

// concept id -> [sources]; populated by the research phase, read by writers/reviewers.
const sourcesByConcept = new Map()

function sourcesFor(n) {
  const ids = new Set((n.beats ?? []).map((b) => b.concept).concat(n.prereqs ?? []))
  const lines = []
  for (const id of ids) {
    const ss = sourcesByConcept.get(id)
    if (ss && ss.length)
      lines.push(`  ${id}:\n${ss.map((s) => `    - ${s.title} <${s.url}>${s.note ? ` — ${s.note}` : ''}`).join('\n')}`)
  }
  return lines.length ? lines.join('\n') : '  (none provided — ground anything you are unsure of via WebSearch/WebFetch before stating it)'
}

function prereqSummaries(n) {
  return (n.prereqs ?? [])
    .map((id) => {
      const c = conceptById.get(id)
      return c ? `- [[${id}]] (${c.title})${(n.alreadyTaught ?? []).includes(id) ? ' — ALREADY TAUGHT: link, do not re-teach' : ''}` : `- ${id}`
    })
    .join('\n')
}

function writePrompt(n) {
  const beats = (n.beats ?? [])
    .map((b) => `  - ${b.kind.toUpperCase()} ${b.concept} (${conceptById.get(b.concept)?.title ?? b.concept})`)
    .join('\n')
  return [
    `Write the lesson note for slug "${n.slug}" ("${n.title}").`,
    `Course: ${m.course.title}. Density: ${m.course.pacing?.density ?? 'balanced'}. Time budget: ${m.course.pacing?.timeBudgetMin ?? 12} min.`,
    ``,
    `BEATS (one new concept per beat, in order; only DEFINE concepts marked DEFINE):`,
    beats,
    ``,
    `PLANNED EXERCISES (fill each as a foldable question of the stated kind + a verified foldable solution; every define beat also needs a per-beat quick check):`,
    (n.exercises ?? [])
      .map((e) => `  - ${e.kind}: ${e.concept}${(e.interleave ?? []).length ? ` (interleave ${e.interleave.join(', ')})` : ''}`)
      .join('\n') || '  (none beyond per-beat quick checks)',
    ``,
    `CLOSED LINK VOCABULARY (you may [[link]] ONLY these concept ids):`,
    `  ${(n.linkVocab ?? []).join(', ')}`,
    ``,
    `PREREQS:`,
    prereqSummaries(n),
    ``,
    `NOTATION TABLE (use these exact symbols, no substitutes):`,
    (m.notation ?? []).map((e) => `  - ${e.object}: ${e.symbol}`).join('\n'),
    ``,
    `SOURCES (ground truth — write definitions/claims to match these; cite only fetched URLs):`,
    sourcesFor(n),
    ``,
    `VOICE — imitate this exemplar (register: ${m.voice?.register ?? 'precise, direct'}):`,
    m.voice?.exemplar ?? '(no exemplar provided)',
    ``,
    `If you discover the manifest is wrong (a prereq is missing, a concept is mis-homed, or one "concept" is really several), DO NOT invent a link, teach it inline, or silently omit it. Return status="blocked" with an amendment instead.`,
  ].join('\n')
}

phase('Research')
const groundingConcepts = m.concepts.filter((c) => c.groundingRequired)
log(`research: ${groundingConcepts.length} concept(s) flagged for grounding`)
const researched = await parallel(
  groundingConcepts.map((c) => () =>
    agent(
      `Find real, authoritative, fetched sources for the concept "${c.title}" (id "${c.id}") as used in the course "${m.course.title}". ` +
        `Capture the authoritative definition/theorem statement where the concept is correctness-critical. Return only URLs you actually fetched.`,
      { label: `research:${c.id}`, phase: 'Research', agentType: 'antirot:researcher', model: 'sonnet', schema: SOURCES },
    ).then((r) => ({ id: c.id, sources: r?.sources ?? [] })),
  ),
)
for (const r of researched.filter(Boolean)) sourcesByConcept.set(r.id, r.sources)

phase('Write')
const results = await pipeline(
  [...m.notes].sort((a, b) => a.order - b.order),
  (n) =>
    agent(writePrompt(n), {
      label: `write:${n.slug}`,
      phase: 'Write',
      agentType: 'antirot:lesson-writer',
      model: isCritical(n) ? 'opus' : 'sonnet',
      schema: WRITE_RESULT,
    }),
  (writeResult, n) => {
    if (!writeResult || writeResult.status === 'blocked')
      return { write: writeResult, review: null, note: n.slug }
    return agent(
      `Adversarially review the lesson note "${n.slug}" ("${n.title}") in ${m.course.outDir}. ` +
        `Extract each definition/theorem/worked-example and verify it in isolation — assume it is wrong until shown right. ` +
        `Check pacing (one new concept per beat) and that no concept outside the closed vocabulary is used. ` +
        `Ground anything you are not independently certain of against the sources below (or fetch your own); verify cited URLs exist and support their claim. ` +
        `Do NOT rate it highly just because it reads fluently.\n\nSOURCES:\n${sourcesFor(n)}`,
      {
        label: `review:${n.slug}`,
        phase: 'Review',
        agentType: 'antirot:course-reviewer',
        model: 'opus',
        schema: REVIEW,
      },
    ).then((review) => ({ write: writeResult, review, note: n.slug }))
  },
)

phase('Cross-check')
const seam = await agent(
  `Read the whole course at ${m.course.outDir}. Look ONLY at cross-lesson seams: ` +
    `(1) notation — is each object in the notation table rendered with its one canonical symbol everywhere? ` +
    `(2) terminology — same term, same meaning across lessons? ` +
    `(3) redundant re-teaching — is any concept marked "already taught" re-explained instead of linked? ` +
    `(4) voice — do lessons read as one author? ` +
    `Report only seam violations; do not re-review individual lessons.`,
  { label: 'cross-check', phase: 'Cross-check', agentType: 'antirot:course-reviewer', model: 'opus', schema: SEAMS },
)

const clean = results.filter(Boolean)
const amendments = clean
  .filter((r) => r.write && r.write.amendments?.length)
  .flatMap((r) => r.write.amendments.map((a) => ({ slug: r.note, ...a })))
const needsRevision = clean
  .filter((r) => r.review && r.review.verdict === 'revise')
  .map((r) => ({ slug: r.note, findings: r.review.findings }))

return {
  written: clean.filter((r) => r.write && r.write.status === 'complete').length,
  blocked: clean.filter((r) => r.write && r.write.status === 'blocked').map((r) => r.note),
  amendments,
  needsRevision,
  seamFindings: seam?.seamFindings ?? [],
  // concept id -> sources; the command persists these into the manifest, then
  // re-runs build-artifacts so Resources.md is generated from real citations.
  sources: Object.fromEntries(sourcesByConcept),
}

function isCritical(n) {
  return (n.beats ?? []).some((b) => {
    const c = conceptById.get(b.concept)
    return c && (c.criticality === 'critical' || c.difficulty === 'proof')
  })
}
