/**
 * Interpretation source: try LLM inference API (Ollama) first; fallback to rule-based.
 * No RAG — prompt + model inference only.
 */

import { interpret} from "./interpretationEngine.js";

const INFERENCE_API = window.INFERENCE_API_URL || "http://localhost:5000";

export async function fetchInterpretation(data) {
  const res = await fetch(`${INFERENCE_API}/interpret`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  const out = await res.json();
  return {
    summary: out.summary || "",
    evidence: Array.isArray(out.evidence) ? out.evidence : [],
    assumptions: Array.isArray(out.assumptions) ? out.assumptions : [],
    limitations: Array.isArray(out.limitations) ? out.limitations : [],
    alternatives: Array.isArray(out.alternatives) ? out.alternatives : [],
    plan: out.plan || "",
    reasoning_steps: Array.isArray(out.reasoning_steps) ? out.reasoning_steps : [],
    median: out.median,
    saleCount: out.saleCount,
    totalCount: out.totalCount,
  };
}

/** Get interpretation: LLM if API available, else rule-based. Same shape as interpret(). */
// if test_data use preset
export async function getInterpretation(data, usePresetInterpretation, presetInterpretationFileName) {
  if (usePresetInterpretation) {
    try {
      const interpretation = await fetch("data/preset_interpretations/" + presetInterpretationFileName).then((r) => r.json());
      const summary = `Recent marketplace signals suggest an expected price around $${interpretation.current_estimate} with a range from $${interpretation.current_low_range} to $${interpretation.current_high_range}, with a ${interpretation.current_trend} price trend. This is based on ${data.length} records (${data.length} confirmed sale${data.length > 1 ? "s" : ""}).`

      return {
        summary: summary,
        evidence: interpretation.evidence,
        assumptions: interpretation.assumptions,
        limitations: interpretation.limitations,
        alternatives: interpretation.alternative_interpretations,
        plan: "",
        reasoning_steps: interpretation.reasoning_steps,
        median: interpretation.current_estimate,
        saleCount: data.length,
        totalCount: data.length,
        current_estimate: interpretation.current_estimate,
        current_trend: interpretation.current_trend,
        current_high_range: interpretation.current_high_range,
        current_low_range: interpretation.current_low_range,
      };
    } catch (e){
      console.error("Failed to load preset interpretation, falling back to live inference:", e);
      return await interpret(data, false);
    }
  } else {
  try {
    return await fetchInterpretation(data, false);
  } catch {
    return await interpret(data, false);
  }
  }
}
