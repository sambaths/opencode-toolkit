#!/usr/bin/env node
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

const MIN_PASS_RATE = 80
const MAX_REGRESSION_POINTS = 5

export function evaluateSkill(input, sha256 = "not supplied") {
  if (!input || typeof input !== "object" || !Array.isArray(input.cases) || input.cases.length === 0) {
    throw new Error("evaluation must contain a non-empty cases array")
  }
  if (!input.authoring_suite_id || !input.held_out_suite_id || input.authoring_suite_id === input.held_out_suite_id) {
    throw new Error("authoring_suite_id and a distinct held_out_suite_id are required")
  }
  if (input.cases.some((item) => item.split !== "held_out")) {
    throw new Error("every evaluated case must be marked split=held_out")
  }
  const ids = input.cases.map((item) => item.id)
  if (ids.some((id) => typeof id !== "string" || !id) || new Set(ids).size !== ids.length) {
    throw new Error("every case must have a unique non-empty id")
  }
  for (const item of input.cases) {
    if (typeof item.candidate_pass !== "boolean" || typeof item.baseline_pass !== "boolean" ||
        typeof item.critical_failure !== "boolean" || typeof item.evidence !== "string" || !item.evidence.trim()) {
      throw new Error(`case ${item.id} needs boolean outcomes, critical_failure, and non-empty evidence`)
    }
  }

  const total = input.cases.length
  const candidatePasses = input.cases.filter((item) => item.candidate_pass).length
  const baselinePasses = input.cases.filter((item) => item.baseline_pass).length
  const criticalFailures = input.cases.filter((item) => item.critical_failure).map((item) => item.id)
  const candidateRate = candidatePasses * 100 / total
  const baselineRate = baselinePasses * 100 / total
  const deltaPoints = candidateRate - baselineRate
  const passed = candidateRate >= MIN_PASS_RATE && criticalFailures.length === 0 && deltaPoints > -MAX_REGRESSION_POINTS

  return {
    held_out_suite_id: input.held_out_suite_id,
    authoring_suite_id: input.authoring_suite_id,
    input_sha256: sha256,
    measurement: "manifest-scored; case outcomes are supplied inputs and are not independently verified by this tool",
    cases: total,
    candidate_pass_rate_percent: candidateRate,
    baseline_pass_rate_percent: baselineRate,
    baseline_delta_percentage_points: deltaPoints,
    critical_failures: criticalFailures,
    thresholds: {
      minimum_pass_rate_percent: MIN_PASS_RATE,
      zero_critical_failures: true,
      maximum_regression_percentage_points: MAX_REGRESSION_POINTS,
    },
    evaluation: passed ? "PASS" : "FAIL",
    adoption: "PENDING_HUMAN_APPROVAL",
  }
}

async function main() {
  const path = process.argv[2]
  if (!path) throw new Error("usage: node tools/evaluate-skill.mjs <evaluation.json>")
  const bytes = await readFile(path)
  const input = JSON.parse(bytes.toString("utf8"))
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  console.log(JSON.stringify(evaluateSkill(input, sha256), null, 2))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`Skill evaluation failed: ${error.message}`)
    process.exitCode = 1
  })
}
