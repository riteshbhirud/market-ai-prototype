/**
 * Unit tests for js/api.js provider pipeline helpers.
 * Focus: payload shaping bounds, normalization, and cache/fallback behaviors.
 */
import { getInterpretation, fetchContestResponse, __test } from "../js/api.js";
import { compactMarketSummary, normalizeInterpretation } from "../js/interpretation/engine.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeLocalStorageMock() {
  const m = new Map();
  return {
    getItem(k) {
      return m.has(k) ? m.get(k) : null;
    },
    setItem(k, v) {
      m.set(k, String(v));
    },
    removeItem(k) {
      m.delete(k);
    },
    _dump() {
      return m;
    },
  };
}

const fixture = [
  { id: 1, date: "2025-01-10", price: 160, listing_type: "unsold", condition: "VG", platform: "eBay", description: "Copy A" },
  { id: 2, date: "2025-02-05", price: 175, listing_type: "sale", condition: "NM", platform: "Discogs", description: "Copy B" },
  { id: 3, date: "2025-02-20", price: 220, listing_type: "auction", condition: "VG+", platform: "eBay", description: "Copy C" },
  { id: 4, date: "2025-03-01", price: 165, listing_type: "obo", condition: "VG", platform: "eBay", description: "Copy D" },
  { id: 5, date: "2025-03-18", price: 180, listing_type: "sale", condition: "NM", platform: "Discogs", description: "Copy E" },
];

// --- payload shaping bounds ---
{
  const summary = compactMarketSummary(fixture);
  assert(summary && typeof summary === "object", "compactMarketSummary returns object");
  assert(Array.isArray(summary.sample_rows), "compactMarketSummary.sample_rows is array");
  assert(summary.sample_rows.length <= 12, "sample_rows capped at 12");
  assert(summary.schema_version === 1, "schema_version is 1");
  assert(summary.grade_chart_suggestion && typeof summary.grade_chart_suggestion === "object", "grade_chart_suggestion exists");
}

// --- normalization guarantees grade_chart and arrays ---
{
  const norm = normalizeInterpretation(
    { summary: "x", evidence: "a", assumptions: null, limitations: ["l1"], alternatives: undefined },
    fixture
  );
  assert(typeof norm.summary === "string", "normalized summary is string");
  assert(Array.isArray(norm.evidence) && norm.evidence.length === 1, "evidence coerced to array");
  assert(Array.isArray(norm.assumptions), "assumptions coerced to array");
  assert(Array.isArray(norm.alternatives), "alternatives coerced to array");
  assert(norm.grade_chart && typeof norm.grade_chart === "object", "grade_chart always present");
  // per-condition should include NM from sales
  assert("NM" in norm.grade_chart, "grade_chart includes per-condition key when possible");
}

// --- cache hit avoids network (FastAPI path disabled, Ollama mocked) ---
{
  globalThis.localStorage = makeLocalStorageMock();
  globalThis.INTERPRETATION_ENGINE_API_URL = ""; // disable fastapi for this test
  globalThis.INFERENCE_API_URL = "http://ollama.test";

  let fetchCalls = 0;
  globalThis.fetch = async (url, opts) => {
    fetchCalls += 1;
    const body = JSON.stringify({
      plan: "p",
      reasoning_steps: ["r1"],
      summary: "ok",
      evidence: ["e1"],
      assumptions: ["a1"],
      limitations: ["l1"],
      alternatives: ["alt1"],
      saleCount: 2,
      totalCount: 5,
      grade_chart: { NM: [100, 200] },
    });
    return {
      ok: true,
      status: 200,
      async text() {
        return body;
      },
    };
  };

  const out1 = await getInterpretation(fixture, false, "");
  assert(out1.summary === "ok", "first call returns mocked summary");
  assert(fetchCalls === 1, "first call uses network once");

  const out2 = await getInterpretation(fixture, false, "");
  assert(out2.summary === "ok", "second call returns same");
  assert(fetchCalls === 1, "second call hits cache (no extra fetch)");
}

// --- contest endpoint payload shaping ---
{
  globalThis.INTERPRETATION_ENGINE_API_URL = "https://fastapi.test";
  let fetchCalls = 0;
  globalThis.fetch = async (url, opts) => {
    fetchCalls += 1;
    assert(url === "https://fastapi.test/contest", "contest endpoint selected");
    const body = JSON.parse(opts.body || "{}");
    assert(body.schema_version === 1, "schema_version passed");
    assert(body.user_interpretation === "I think the market is higher.", "user interpretation passed");
    assert(body.ai_interpretation && body.ai_interpretation.summary === "ok", "ai interpretation passed");
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          ai_response: "I see your point.",
          interpretation_changed: true,
          updated_interpretation: {
            summary: "Revised summary",
            evidence: [],
            assumptions: [],
            limitations: [],
            alternatives: [],
            alternative_interpretations: [],
            plan: "",
            reasoning_steps: [],
            grade_chart: { NM: [100, 200] },
            current_estimate: null,
            current_high_range: null,
            current_low_range: null,
            current_trend: "steady"
          },
        });
      },
    };
  };

  const response = await fetchContestResponse(
    fixture,
    { 
      summary: "ok", 
      evidence: [], 
      assumptions: [], 
      limitations: [], 
      alternatives: [], 
      alternative_interpretations: [],
      plan: "", 
      reasoning_steps: [],
      grade_chart: { NM: [100, 200] },
      current_estimate: null,
      current_high_range: null,
      current_low_range: null,
      current_trend: "steady"
    },
    "I think the market is higher."
  );

  assert(response.ai_response === "I see your point.", "contest response returned");
  assert(response.interpretation_changed === true, "contest changed true");
  assert(response.updated_interpretation.summary === "Revised summary", "updated interpretation returned");
  assert(fetchCalls === 1, "contest request uses network once");
}

console.log("All api provider tests passed.");
process.exit(0);

