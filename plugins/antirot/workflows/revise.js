export const meta = {
  name: 'antirot-revise',
  description: 'Apply reviewer + seam findings to flagged lessons, fill module capstones, then re-verify every touched note in a mandatory loop until clean.',
  whenToUse: 'Invoked by the /antirot command after the checker is structurally green but the build-course review pass returned needsRevision / seamFindings, and/or module capstones are still unfilled. Not run directly.',
  phases: [
    { title: 'Revise', detail: 'one reviser per flagged note; applies findings under closed-vocab / no-self-link constraints' },
    { title: 'Capstones', detail: 'one writer per unfilled module capstone solution' },
    { title: 'Verify', detail: 'read-only re-review of every touched note; re-revise failures and loop until clean (or maxVerifyRounds)' },
  ],
}

// Small args only — same contract as build-course.js. The manifest is NOT
// inlined. Each reviser reads its own findings file + brief from disk; the
// workflow just iterates slugs and routes by what route-findings.mjs prepared.
//   args = { manifestPath, outDir, briefsDir, revisionsDir,
//            notes:     [{slug, path}],                              // reviewer-flagged notes
//            capstones: [{module, overviewPath, prompt, concepts}],  // unfilled capstones
//            reviserModel?,    // force reviser model (default 'sonnet')
//            maxVerifyRounds?  // re-verify/re-revise rounds (default 2) }
//
// Per-note findings live at  <revisionsDir>/<slug>.json  (written by
// route-findings.mjs: reviewer findings, one array). Cross-lesson seam findings
// (which have no single owning note) live at <revisionsDir>/_seams.json and are
// read by every reviser, who applies only the ones naming their note.
//
// Defensive: coerce a stringified `args` back to an object (the known Workflow
// footgun — see build-course.js).
function parseArgs(a) {
  if (typeof a !== 'string') return a || {}
  try { const o = JSON.parse(a); log('note: args arrived as a JSON string — coerced to object'); return o }
  catch { log('warn: args is a non-JSON string — ignoring'); return {} }
}
const A = parseArgs(args)
// Note: the manifest path is intentionally not bound — revisers and verifiers
// read per-note briefs + findings from disk, never the full manifest.
const { outDir, briefsDir, revisionsDir } = A
const notes = Array.isArray(A.notes) ? A.notes : []
const capstones = Array.isArray(A.capstones) ? A.capstones : []
const reviserModel = A.reviserModel || 'sonnet'
const maxVerifyRounds = Number.isInteger(A.maxVerifyRounds) ? A.maxVerifyRounds : 2

if (!outDir || !briefsDir || !revisionsDir) {
  log('missing args (need outDir, briefsDir, revisionsDir) — aborting')
  return { error: 'bad-args' }
}
if (!notes.length && !capstones.length) {
  log('nothing to revise and no capstones to fill — no-op')
  return { revised: 0, capstonesFilled: 0, verified: 0, stillFailing: [], rounds: 0 }
}

const REVISE_RESULT = {
  type: 'object',
  required: ['slug', 'status'],
  additionalProperties: false,
  properties: {
    slug: { type: 'string' },
    status: { enum: ['complete', 'blocked'] },
    applied: { type: 'array', items: { type: 'string' } },
    note: { type: 'string' },
  },
}

const CAPSTONE_RESULT = {
  type: 'object',
  required: ['module', 'status'],
  additionalProperties: false,
  properties: {
    module: { type: 'string' },
    status: { enum: ['complete', 'blocked'] },
    note: { type: 'string' },
  },
}

const VERDICT = {
  type: 'object',
  required: ['id', 'verdict'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    verdict: { enum: ['pass', 'revise'] },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        required: ['detail', 'fix'],
        additionalProperties: false,
        properties: { detail: { type: 'string' }, fix: { type: 'string' } },
      },
    },
  },
}

const notePath = (p) => `${outDir}/${p}`
const briefPath = (slug) => `${briefsDir}/${slug}.json`
const findingsPath = (slug) => `${revisionsDir}/${slug}.json`
const seamsPath = `${revisionsDir}/_seams.json`

const REVISE_CONSTRAINTS =
  `Hard constraints: stay strictly inside this note's closed link vocabulary (from the brief's linkVocab); ` +
  `NEVER wikilink a concept this note defines itself — that is an illegal self/forward reference the checker rejects, so name it in plain prose instead; ` +
  `do not introduce any concept outside the vocabulary; leave the generated "Further reading" section untouched; keep frontmatter status: complete. ` +
  `Apply ONLY the listed fixes — do not rewrite sound prose or re-flag your own work.`

// --- Phase: Revise ----------------------------------------------------------
phase('Revise')
const reviseOne = (n) =>
  agent(
    `Revise the lesson note "${n.slug}" at ${notePath(n.path)}. ` +
      `Read your findings at ${findingsPath(n.slug)} (the reviewer's list for this note) and the shared cross-lesson seam findings at ${seamsPath} — ` +
      `apply every finding addressed to this note, plus any seam finding whose detail names this note, its slug, or one of its concepts; ignore seams that name other notes. ` +
      `Read your brief at ${briefPath(n.slug)} for the closed vocabulary, notation table, voice exemplar, and pacing. ` +
      `Fix each finding precisely against the brief's sources (recompute any arithmetic/derivation; ground uncertain claims). ${REVISE_CONSTRAINTS} ` +
      `If a finding cannot be fixed without a manifest/plan change (missing prereq, out-of-vocab concept genuinely needed), return status="blocked" with the reason in applied[] rather than inventing.`,
    {
      label: `revise:${n.slug}`,
      phase: 'Revise',
      agentType: 'antirot:lesson-writer',
      model: reviserModel,
      schema: REVISE_RESULT,
    },
  ).then((r) => ({ ...(r || { slug: n.slug, status: 'blocked' }), note: n.slug, path: n.path }))

const revised = (await parallel(notes.map((n) => () => reviseOne(n)))).filter(Boolean)

// --- Phase: Capstones -------------------------------------------------------
phase('Capstones')
const capResults = (
  await parallel(
    capstones.map((c) => () =>
      agent(
        `Fill the capstone solution in the module overview at ${notePath(c.overviewPath)}. ` +
          `The capstone task is: "${c.prompt}". The solution must integrate these concepts and stay consistent with the module's lessons: ${(c.concepts || []).join(', ') || '(the module)'}. ` +
          `Write the full worked solution INSIDE the existing "> [!success]- Solution" callout, replacing the "(to be written)" placeholder — every computational/derivation step verifiable. ` +
          `Do not change the question callout. Keep the solution a single foldable success callout. Do not add wikilinks to concepts taught in this module's own lessons unless they are earlier-module concepts. Return {module, status}.`,
        {
          label: `capstone:${c.module}`,
          phase: 'Capstones',
          agentType: 'antirot:lesson-writer',
          model: reviserModel,
          schema: CAPSTONE_RESULT,
        },
      ).then((r) => ({ ...(r || { module: c.module, status: 'blocked' }), overviewPath: c.overviewPath })),
    ),
  )
).filter(Boolean)

// --- Phase: Verify (mandatory loop) -----------------------------------------
// This is the policy fix: every touched note is independently re-reviewed, and
// any reviser-introduced error is fixed and re-verified, instead of relying on
// a hand-rolled spot-check. A reviser fixing one bug can introduce another
// (observed: a false least-fixpoint claim, an invalid Newman's-lemma proof) —
// the loop closes that hole.
phase('Verify')

// Verify items: revised notes that completed + capstones that completed.
let pending = [
  ...revised.filter((r) => r.status === 'complete').map((r) => ({ id: r.slug, kind: 'note', path: r.path })),
  ...capResults.filter((r) => r.status === 'complete').map((r) => ({ id: r.module, kind: 'capstone', path: r.overviewPath })),
]

const verifyOne = (item) =>
  agent(
    item.kind === 'capstone'
      ? `Adversarially re-review the capstone solution in ${notePath(item.path)} (module "${item.id}"). ` +
          `Recompute every step; confirm the solution actually integrates the named concepts, is correct and complete, contains no "to be written" stub, and introduces no concept the module hasn't taught. Treat it as wrong until shown right.`
      : `Adversarially re-review the just-revised lesson note "${item.id}" at ${notePath(item.path)}. Read its brief at ${briefPath(item.id)} for sources, closed vocabulary, voice, and pacing. ` +
          `Verify the fixes are correct AND introduced no new error: recompute every definition/example/solution step, confirm no claim contradicts a prereq lesson, and confirm the reviser added no self/forward-reference wikilink and nothing out of vocabulary. Treat every claim as wrong until checked.`,
    {
      label: `verify:${item.id}`,
      phase: 'Verify',
      agentType: 'antirot:course-reviewer',
      model: 'opus',
      schema: VERDICT,
    },
  ).then((v) => ({ item, verdict: v }))

const stillFailing = []
let rounds = 0
while (pending.length && rounds < maxVerifyRounds) {
  rounds++
  log(`verify round ${rounds}: ${pending.length} item(s)`)
  const verdicts = (await parallel(pending.map((it) => () => verifyOne(it)))).filter(Boolean)
  const failures = verdicts.filter((v) => v.verdict && v.verdict.verdict === 'revise' && (v.verdict.errors || []).length)

  if (!failures.length) { pending = []; break }

  // Last round? record and stop — don't re-revise blindly.
  if (rounds >= maxVerifyRounds) {
    for (const f of failures) stillFailing.push({ id: f.item.id, errors: f.verdict.errors })
    pending = []
    break
  }

  // Re-revise each failure with the verifier's errors as the findings, then loop.
  log(`verify round ${rounds}: re-revising ${failures.length} item(s)`)
  await parallel(
    failures.map((f) => () => {
      const fixes = f.verdict.errors.map((e, i) => `(${i + 1}) ${e.detail} — fix: ${e.fix}`).join(' ')
      return agent(
        f.item.kind === 'capstone'
          ? `Correct the capstone solution in ${notePath(f.item.path)} (module "${f.item.id}"). A verification pass found: ${fixes}. Apply exactly these fixes inside the "> [!success]- Solution" callout; change nothing else. Keep every step verifiable.`
          : `Correct the lesson note "${f.item.id}" at ${notePath(f.item.path)}. A verification pass found error(s) a prior reviser introduced or missed: ${fixes}. Read your brief at ${briefPath(f.item.id)}. Apply exactly these fixes. ${REVISE_CONSTRAINTS}`,
        {
          label: `re-revise:${f.item.id}`,
          phase: 'Verify',
          agentType: 'antirot:lesson-writer',
          model: reviserModel,
          schema: REVISE_RESULT,
        },
      )
    }),
  )
  pending = failures.map((f) => f.item) // re-verify only what we just touched
}

const revisedOk = revised.filter((r) => r.status === 'complete').length
const capsOk = capResults.filter((r) => r.status === 'complete').length

return {
  revised: revisedOk,
  capstonesFilled: capsOk,
  verified: revisedOk + capsOk - stillFailing.length,
  blocked: [
    ...revised.filter((r) => r.status === 'blocked').map((r) => ({ id: r.slug, reason: r.applied || [] })),
    ...capResults.filter((r) => r.status === 'blocked').map((r) => ({ id: r.module, reason: ['capstone blocked'] })),
  ],
  stillFailing,
  rounds,
}
