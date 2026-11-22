import test from "node:test"
import assert from "node:assert/strict"
import { evaluateSkill } from "./evaluate-skill.mjs"

function suite(overrides = {}) {
  return {
    authoring_suite_id: "authoring-v1",
    held_out_suite_id: "sealed-v1",
    cases: Array.from({ length: 10 }, (_, index) => ({
      id: `case-${index + 1}`,
      split: "held_out",
      baseline_pass: true,
      candidate_pass: true,
      critical_failure: false,
      evidence: "Observed output matched the prewritten expected result.",
    })),
    ...overrides,
  }
}

test("passes at the exact 80 percent floor but keeps adoption gated", () => {
  const input = suite()
  input.cases[9].candidate_pass = false
  input.cases[8].candidate_pass = false
  input.cases[9].baseline_pass = false
  input.cases[8].baseline_pass = false
  const report = evaluateSkill(input, "fixture-sha")
  assert.equal(report.candidate_pass_rate_percent, 80)
  assert.equal(report.evaluation, "PASS")
  assert.equal(report.adoption, "PENDING_HUMAN_APPROVAL")
  assert.equal(report.input_sha256, "fixture-sha")
})

test("fails below 80 percent and on any critical failure", () => {
  const low = suite()
  low.cases[8].candidate_pass = false
  low.cases[9].candidate_pass = false
  low.cases[7].candidate_pass = false
  assert.equal(evaluateSkill(low).evaluation, "FAIL")

  const critical = suite()
  critical.cases[0].critical_failure = true
  assert.deepEqual(evaluateSkill(critical).critical_failures, ["case-1"])
  assert.equal(evaluateSkill(critical).evaluation, "FAIL")
})

test("fails on a material baseline regression", () => {
  const input = suite()
  input.cases[0].candidate_pass = false
  input.cases[1].candidate_pass = false
  assert.equal(evaluateSkill(input).baseline_delta_percentage_points, -20)
  assert.equal(evaluateSkill(input).evaluation, "FAIL")

  const boundary = suite({ cases: Array.from({ length: 20 }, (_, index) => ({
    id: `boundary-${index + 1}`,
    split: "held_out",
    baseline_pass: true,
    candidate_pass: index < 19,
    critical_failure: false,
    evidence: "Observed output matched the prewritten expected result.",
  })) })
  assert.equal(evaluateSkill(boundary).baseline_delta_percentage_points, -5)
  assert.equal(evaluateSkill(boundary).evaluation, "FAIL")
})

test("rejects contaminated or unreproducible case sets", () => {
  assert.throws(() => evaluateSkill(suite({ held_out_suite_id: "authoring-v1" })), /distinct/)
  const contaminated = suite()
  contaminated.cases[0].split = "authoring"
  assert.throws(() => evaluateSkill(contaminated), /held_out/)
  const missingEvidence = suite()
  missingEvidence.cases[0].evidence = ""
  assert.throws(() => evaluateSkill(missingEvidence), /evidence/)
})
