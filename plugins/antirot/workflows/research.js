export const meta = {
  name: 'antirot-research',
  description: 'Fetch real sources for grounding-required concepts. Runs before generation so sources can be persisted into the manifest and stamped into per-lesson Further reading + the Resources appendix.',
  whenToUse: 'Invoked by the /antirot command after the gate and before build-artifacts. Not run directly.',
  phases: [{ title: 'Research', detail: 'one researcher per grounding-required concept, parallel' }],
}

// Small args — NOT the manifest. { manifestPath, grounding: [{id, title}] }.
// Researchers read the manifest from disk for course context; nothing large is
// inlined into the workflow call.
//
// Defensive: `args` should arrive as a JSON object, but the orchestrator can
// pass it as a JSON-encoded STRING (a known Workflow footgun). A string `args`
// has no `.manifestPath`, so the run would abort spuriously. Coerce it back.
function parseArgs(a) {
  if (typeof a !== 'string') return a || {}
  try { const o = JSON.parse(a); log('note: args arrived as a JSON string — coerced to object'); return o }
  catch { log('warn: args is a non-JSON string — ignoring'); return {} }
}
const A = parseArgs(args)
const grounding = A.grounding || []
const manifestPath = A.manifestPath
// researcherModel (optional): force researchers to this model ('opus' | 'sonnet'
// | 'fable' | 'haiku'). Omit to default to Sonnet.
const researcherModel = A.researcherModel || 'sonnet'
if (!manifestPath) {
  log('no manifestPath in args — aborting')
  return { error: 'missing-manifestPath' }
}
log(`research: ${grounding.length} concept(s) to ground`)

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

phase('Research')
const results = await parallel(
  grounding.map((c) => () =>
    agent(
      `Find real, authoritative, fetched sources for the concept "${c.title}" (id "${c.id}"). ` +
        `Read ${manifestPath} for the course context (title, how this concept is used, neighbouring concepts). ` +
        `Capture the authoritative definition/theorem statement where the concept is correctness-critical. ` +
        `Return ONLY URLs you actually fetched — no recalled or guessed links.`,
      { label: `research:${c.id}`, phase: 'Research', agentType: 'antirot:researcher', model: researcherModel, schema: SOURCES },
    ).then((r) => ({ id: c.id, sources: r?.sources ?? [] })),
  ),
)

// concept id -> sources; the command persists this into the manifest, then runs
// build-artifacts so Further reading + Resources are generated from real links.
const sources = {}
for (const r of results.filter(Boolean)) sources[r.id] = r.sources
return { sources }
