export const meta = {
  name: 'antirot-build-course',
  description: 'Fan out lesson-writers against pre-generated per-note briefs, then review each lesson adversarially as it lands.',
  whenToUse: 'Invoked by the /antirot command after research + build-artifacts. Not run directly.',
  phases: [
    { title: 'Write', detail: 'one lesson-writer per note, parallel; model routed by criticality' },
    { title: 'Review', detail: 'claim-level adversarial review of each lesson as soon as it is written' },
    { title: 'Cross-check', detail: 'single pass over named seams: notation, terminology, link legality' },
  ],
}

// Small args only — the manifest is NOT inlined (that caused the orchestrator to
// trim it and silently corrupt grounding/routing). Each writer reads its own
// small brief from disk; the workflow just iterates slugs and routes by `critical`.
//   args = { manifestPath, outDir, briefsDir, notes: [{slug, title, path, critical}],
//            writerModel? }
// writerModel (optional): force every lesson-writer to this model ('opus' |
// 'sonnet' | 'fable' | 'haiku'). Omit to keep cost-routing (Opus for critical
// notes, Sonnet otherwise).
//
// Defensive: `args` should arrive as a JSON object, but the orchestrator can
// pass it as a JSON-encoded STRING (a known Workflow footgun). Destructuring a
// string yields all-undefined and the run aborts as "bad-args". Coerce it back.
function parseArgs(a) {
  if (typeof a !== 'string') return a || {}
  try { const o = JSON.parse(a); log('note: args arrived as a JSON string — coerced to object'); return o }
  catch { log('warn: args is a non-JSON string — ignoring'); return {} }
}
const { manifestPath, outDir, briefsDir, notes, writerModel } = parseArgs(args)
if (!Array.isArray(notes) || !outDir || !briefsDir) {
  log('missing args (need notes, outDir, briefsDir) — aborting')
  return { error: 'bad-args' }
}

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
          type: { enum: ['missing-prereq', 'mis-homed', 'needs-split', 'ungrounded', 'other'] },
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
          kind: { enum: ['wrong-definition', 'wrong-proof', 'wrong-example', 'wrong-solution', 'pacing', 'forward-ref', 'notation', 'citation', 'other'] },
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
          seam: { enum: ['notation', 'terminology', 'link', 'redundant-reteach', 'voice', 'opener-repetition'] },
          detail: { type: 'string' },
        },
      },
    },
  },
}

const briefPath = (slug) => `${briefsDir}/${slug}.json`
const notePath = (p) => `${outDir}/${p}`

phase('Write')
const results = await pipeline(
  notes,
  (n) =>
    agent(
      `Write the lesson note "${n.slug}" ("${n.title}"). ` +
        `Read your brief at ${briefPath(n.slug)} — it contains the beats, closed link vocabulary, notation table, voice exemplar, prereqs (with already-taught flags), sources, and planned exercises/figures. ` +
        `The skeleton (with frontmatter, beat headings, Exercises, Summary, Flashcards, and a generated Further reading section) is already at ${notePath(n.path)} — fill the prose, leave the generated Further reading section untouched, set status: complete. ` +
        `If the plan is wrong (missing prereq, mis-homed concept, ungroundable claim), return status="blocked" with an amendment instead of inventing anything.`,
      {
        label: `write:${n.slug}`,
        phase: 'Write',
        agentType: 'antirot:lesson-writer',
        model: writerModel || (n.critical ? 'opus' : 'sonnet'),
        schema: WRITE_RESULT,
      },
    ),
  (writeResult, n) => {
    if (!writeResult || writeResult.status === 'blocked')
      return { write: writeResult, review: null, note: n.slug }
    return agent(
      `Adversarially review the lesson note "${n.slug}" at ${notePath(n.path)}. Read its brief at ${briefPath(n.slug)} for the sources, closed vocabulary, the voice exemplar, and the pacing (density + scaffolding). ` +
        `Extract each definition/theorem/worked-example/exercise-solution and verify it in isolation — assume wrong until shown right; recompute computational steps; ground uncertain claims against the brief's sources (or fetch your own) and confirm cited URLs support their claim. ` +
        `Check pacing (one new concept per beat) and that no concept outside the closed vocabulary is used. ` +
        `Judge prose against the brief's voice exemplar and pacing: flag a recap-opening (a lesson/section opening by re-explaining a known prereq instead of the concept's motivation); for standard/rich scaffolding require motivation + intuition before the formal definition (lean may go straight to formal); flag voice diverging from the exemplar. Do NOT pass it just because it reads fluently, and do NOT over-flag a terse lean note or a one-line prereq link.`,
      { label: `review:${n.slug}`, phase: 'Review', agentType: 'antirot:course-reviewer', model: 'opus', schema: REVIEW },
    ).then((review) => ({ write: writeResult, review, note: n.slug }))
  },
)

phase('Cross-check')
const seam = await agent(
  `Read the whole course at ${outDir} (and ${manifestPath} for the canonical notation table). Look ONLY at cross-lesson seams: ` +
    `(1) notation — one canonical symbol per object everywhere; (2) terminology — same term, same meaning; ` +
    `(3) redundant re-teaching of already-taught prereqs; (4) voice — one author?; ` +
    `(5) opener-repetition — do many lessons open with the same formula sentence (e.g. "Here is the move that makes X…"), reading as machine-stamped? Report only seam violations.`,
  { label: 'cross-check', phase: 'Cross-check', agentType: 'antirot:course-reviewer', model: 'opus', schema: SEAMS },
)

const clean = results.filter(Boolean)
return {
  written: clean.filter((r) => r.write && r.write.status === 'complete').length,
  blocked: clean.filter((r) => r.write && r.write.status === 'blocked').map((r) => r.note),
  amendments: clean
    .filter((r) => r.write && r.write.amendments?.length)
    .flatMap((r) => r.write.amendments.map((a) => ({ slug: r.note, ...a }))),
  needsRevision: clean
    .filter((r) => r.review && r.review.verdict === 'revise')
    .map((r) => ({ slug: r.note, findings: r.review.findings })),
  seamFindings: seam?.seamFindings ?? [],
}
