export const meta = {
  name: 'antirot-build-course',
  description: 'Fan out lesson-writers against a frozen manifest, then review each lesson adversarially as it lands.',
  whenToUse: 'Invoked by the /antirot command after the design gate and after build-artifacts has written the skeleton. Not run directly.',
  phases: [
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
    `CLOSED LINK VOCABULARY (you may [[link]] ONLY these concept ids):`,
    `  ${(n.linkVocab ?? []).join(', ')}`,
    ``,
    `PREREQS:`,
    prereqSummaries(n),
    ``,
    `NOTATION TABLE (use these exact symbols, no substitutes):`,
    (m.notation ?? []).map((e) => `  - ${e.object}: ${e.symbol}`).join('\n'),
    ``,
    `VOICE — imitate this exemplar (register: ${m.voice?.register ?? 'precise, direct'}):`,
    m.voice?.exemplar ?? '(no exemplar provided)',
    ``,
    `If you discover the manifest is wrong (a prereq is missing, a concept is mis-homed, or one "concept" is really several), DO NOT invent a link, teach it inline, or silently omit it. Return status="blocked" with an amendment instead.`,
  ].join('\n')
}

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
        `Do NOT rate it highly just because it reads fluently.`,
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
}

function isCritical(n) {
  return (n.beats ?? []).some((b) => {
    const c = conceptById.get(b.concept)
    return c && (c.criticality === 'critical' || c.difficulty === 'proof')
  })
}
