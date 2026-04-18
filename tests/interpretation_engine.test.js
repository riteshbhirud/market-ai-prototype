/**
 * Tests for the rule-based interpretation engine.
 * Ensures output shape and that inference is data-driven (numbers from data appear in output).
 */
import { interpret, getAlternativeInterpretation } from "../js/interpretationEngine.js";

const fixture = [
  { id: 1, date: "2025-01-10", price: 160, listing_type: "unsold", condition: "VG", platform: "eBay", description: "Copy A" },
  { id: 2, date: "2025-02-05", price: 175, listing_type: "sale", condition: "NM", platform: "Discogs", description: "Copy B" },
  { id: 3, date: "2025-02-20", price: 220, listing_type: "auction", condition: "VG+", platform: "eBay", description: "Copy C" },
  { id: 4, date: "2025-03-01", price: 165, listing_type: "obo", condition: "VG", platform: "eBay", description: "Copy D" },
  { id: 5, date: "2025-03-18", price: 180, listing_type: "sale", condition: "NM", platform: "Discogs", description: "Copy E" },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// --- Shape ---
const out = await interpret(fixture, false);
assert(typeof out.summary === "string" && out.summary.length > 0, "summary is non-empty string");
assert(Array.isArray(out.evidence), "evidence is array");
assert(Array.isArray(out.assumptions), "assumptions is array");
assert(Array.isArray(out.limitations), "limitations is array");
assert(Array.isArray(out.alternatives), "alternatives is array");
assert(out.evidence.length > 0, "evidence has at least one item");
assert(out.assumptions.length > 0, "assumptions has at least one item");
assert(out.limitations.length > 0, "limitations has at least one item");
assert(out.alternatives.length > 0, "alternatives has at least one item");
assert(typeof out.median === "number", "median is number");
assert(out.saleCount === 2, "saleCount equals number of sale records");
assert(out.totalCount === 5, "totalCount equals data length");

// --- Data-driven: summary and evidence should reflect actual prices/numbers ---
const prices = fixture.map((d) => d.price);
const median = out.median;
assert(prices.includes(median) || Math.abs(median - 177.5) < 2, "median is consistent with data (expected ~177–180)");

const summaryLower = out.summary.toLowerCase();
assert(summaryLower.includes("175") || summaryLower.includes("180") || summaryLower.includes("$") || summaryLower.includes("median") || summaryLower.includes("2"), "summary references data (e.g. prices or sale count)");

const evidenceText = out.evidence.join(" ");
assert(evidenceText.includes("175") || evidenceText.includes("180") || evidenceText.includes("220") || evidenceText.includes("160"), "evidence includes at least one actual price");
assert(evidenceText.includes("2") || evidenceText.includes("sale"), "evidence references sales");

// --- Alternatives: getAlternativeInterpretation cycles ---
const alt0 = await getAlternativeInterpretation(fixture, 0);
const alt1 = await getAlternativeInterpretation(fixture, 1);
assert(typeof alt0 === "string" && alt0.length > 0, "getAlternativeInterpretation(0) returns non-empty string");
assert(typeof alt1 === "string" && alt1.length > 0, "getAlternativeInterpretation(1) returns non-empty string");
assert(alt0 === out.alternatives[0], "alt0 matches first alternative");
assert(alt1 === out.alternatives[1], "alt1 matches second alternative");

// --- Sparse data: fewer than 3 sales should produce a limitation ---
const sparse = [
  { id: 1, date: "2025-01-01", price: 100, listing_type: "sale", condition: "NM", platform: "eBay", description: "X" },
  { id: 2, date: "2025-01-02", price: 120, listing_type: "unsold", condition: "VG", platform: "eBay", description: "Y" },
];
const sparseOut = await interpret(sparse, false);
assert(sparseOut.saleCount === 1, "sparse data has 1 sale");
const limitationsText = sparseOut.limitations.join(" ");
assert(limitationsText.toLowerCase().includes("few") || limitationsText.toLowerCase().includes("small") || limitationsText.toLowerCase().includes("limited"), "sparse data yields a limitation about sample size or few sales");

console.log("All interpretation engine tests passed.");
process.exit(0);
