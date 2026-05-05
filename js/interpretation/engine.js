/**
 * Single source of truth for interpretation shaping:
 * - canonical output normalization
 * - per-condition grade_chart derivation (ranges-first)
 * - compact payload shaping for limited-query providers
 */

export const INTERPRETATION_SCHEMA_VERSION = 1;

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function ensureArrayStrings(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x.map((v) => String(v));
  return [String(x)];
}

function isFiniteNumber(x) {
  return Number.isFinite(Number(x));
}

function toNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function parseDateMs(d) {
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
}

function median(sortedNums) {
  const n = sortedNums.length;
  if (!n) return null;
  if (n % 2 === 1) return sortedNums[(n - 1) / 2];
  return (sortedNums[n / 2 - 1] + sortedNums[n / 2]) / 2;
}

function percentile(sortedNums, p) {
  if (!sortedNums.length) return null;
  if (p <= 0) return sortedNums[0];
  if (p >= 1) return sortedNums[sortedNums.length - 1];
  const idx = (sortedNums.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedNums[lo];
  const w = idx - lo;
  return sortedNums[lo] * (1 - w) + sortedNums[hi] * w;
}

export function stableStringify(value) {
  const seen = new WeakSet();
  const sorter = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return JSON.stringify(value, function (k, v) {
    if (v && typeof v === "object") {
      if (seen.has(v)) return null;
      seen.add(v);
      if (Array.isArray(v)) return v;
      const out = {};
      for (const key of Object.keys(v).sort(sorter)) out[key] = v[key];
      return out;
    }
    return v;
  });
}

export function deriveGradeChartFromData(data) {
  const rows = Array.isArray(data) ? data : [];
  // Per-condition ranges using sales (preferred). If too sparse, fall back to overall.
  const sales = rows.filter((d) => d?.listing_type === "sale" || d?.listing_type === "sold");
  const allPrices = rows.map((d) => toNumber(d?.price)).filter((n) => n != null);
  const overallSorted = [...allPrices].sort((a, b) => a - b);

  const overallLow = percentile(overallSorted, 0.25) ?? (overallSorted[0] ?? null);
  const overallHigh = percentile(overallSorted, 0.75) ?? (overallSorted[overallSorted.length - 1] ?? null);

  const byCond = new Map();
  for (const row of sales) {
    const cond = row?.condition;
    const price = toNumber(row?.price);
    if (!cond || price == null) continue;
    if (!byCond.has(cond)) byCond.set(cond, []);
    byCond.get(cond).push(price);
  }

  const out = {};
  for (const [cond, prices] of byCond.entries()) {
    const sorted = [...prices].sort((a, b) => a - b);
    const low = sorted.length >= 5 ? percentile(sorted, 0.25) : sorted[0];
    const high = sorted.length >= 5 ? percentile(sorted, 0.75) : sorted[sorted.length - 1];
    if (low != null && high != null) out[cond] = [low, high];
  }

  if (!Object.keys(out).length && overallLow != null && overallHigh != null) {
    const conditions = [...new Set(rows.map((d) => d?.condition).filter(Boolean))];
    for (const c of conditions) out[c] = [overallLow, overallHigh];
  }

  return out;
}

export function normalizeInterpretation(raw, data) {
  const obj = raw && typeof raw === "object" ? raw : {};

  const grade_chart =
    obj.grade_chart &&
    typeof obj.grade_chart === "object" &&
    !Array.isArray(obj.grade_chart) &&
    Object.values(obj.grade_chart).every(
      (v) => Array.isArray(v) && v.length === 2 && isFiniteNumber(v[0]) && isFiniteNumber(v[1])
    )
      ? obj.grade_chart
      : deriveGradeChartFromData(data);

  return {
    summary: String(obj.summary || ""),
    evidence: ensureArrayStrings(obj.evidence),
    assumptions: ensureArrayStrings(obj.assumptions),
    limitations: ensureArrayStrings(obj.limitations),
    alternatives: ensureArrayStrings(obj.alternatives ?? obj.alternative_interpretations),
    plan: String(obj.plan || ""),
    reasoning_steps: ensureArrayStrings(obj.reasoning_steps),
    grade_chart,
    saleCount:
      typeof obj.saleCount === "number"
        ? obj.saleCount
        : (Array.isArray(data) ? data : []).filter((d) => d?.listing_type === "sale" || d?.listing_type === "sold").length,
    totalCount: typeof obj.totalCount === "number" ? obj.totalCount : (Array.isArray(data) ? data : []).length,
  };
}

export function compactMarketSummary(data) {
  const rows = Array.isArray(data) ? data : [];
  const totalCount = rows.length;

  const prices = rows.map((d) => toNumber(d?.price)).filter((n) => n != null);
  const sortedPrices = [...prices].sort((a, b) => a - b);
  const min = sortedPrices[0] ?? null;
  const max = sortedPrices[sortedPrices.length - 1] ?? null;
  const med = median(sortedPrices);
  const p25 = percentile(sortedPrices, 0.25);
  const p75 = percentile(sortedPrices, 0.75);

  const countsBy = (key) => {
    const m = {};
    for (const r of rows) {
      const v = r?.[key];
      if (!v) continue;
      m[v] = (m[v] || 0) + 1;
    }
    return m;
  };

  const sales = rows.filter((d) => d?.listing_type === "sale" || d?.listing_type === "sold");
  const salePrices = sales.map((d) => toNumber(d?.price)).filter((n) => n != null).sort((a, b) => a - b);

  const dates = rows
    .map((d) => parseDateMs(d?.date))
    .filter((t) => t != null)
    .sort((a, b) => a - b);
  const latest = dates.length ? dates[dates.length - 1] : null;

  const windowStats = (days) => {
    if (!latest) return null;
    const start = latest - days * 24 * 60 * 60 * 1000;
    const win = sales.filter((d) => {
      const t = parseDateMs(d?.date);
      return t != null && t >= start && t <= latest;
    });
    const ps = win.map((d) => toNumber(d?.price)).filter((n) => n != null).sort((a, b) => a - b);
    if (!ps.length) return { count: 0, avg: null, median: null };
    const avg = ps.reduce((a, b) => a + b, 0) / ps.length;
    return { count: ps.length, avg, median: median(ps) };
  };

  const sample = [];
  const byNewest = [...rows]
    .map((d) => ({ d, t: parseDateMs(d?.date) ?? -Infinity }))
    .sort((a, b) => b.t - a.t)
    .slice(0, 6)
    .map((x) => x.d);
  const byExtremes = [...sales]
    .filter((d) => toNumber(d?.price) != null)
    .sort((a, b) => toNumber(a.price) - toNumber(b.price));
  const extremes = [
    byExtremes[0],
    byExtremes[1],
    byExtremes[byExtremes.length - 2],
    byExtremes[byExtremes.length - 1],
  ].filter(Boolean);

  const pushDedup = (r) => {
    if (!r) return;
    const id = r.id ?? stableStringify({ date: r.date, price: r.price, platform: r.platform, condition: r.condition, listing_type: r.listing_type });
    if (sample.some((s) => (s.id ?? null) === id)) return;
    sample.push({
      id: r.id ?? null,
      listing_type: r.listing_type ?? "",
      condition: r.condition ?? "",
      platform: r.platform ?? "",
      date: r.date ?? "",
      price: r.price ?? null,
      description: r.description ? String(r.description).slice(0, 120) : "",
    });
  };

  byNewest.forEach(pushDedup);
  extremes.forEach(pushDedup);
  const cappedSample = sample.slice(0, 12);

  return {
    schema_version: INTERPRETATION_SCHEMA_VERSION,
    totalCount,
    saleCount: sales.length,
    counts: {
      by_listing_type: countsBy("listing_type"),
      by_platform: countsBy("platform"),
      by_condition: countsBy("condition"),
    },
    price_stats: { min, max, median: med, p25, p75 },
    sale_price_stats: {
      min: salePrices[0] ?? null,
      max: salePrices[salePrices.length - 1] ?? null,
      median: median(salePrices),
    },
    windows: {
      last_90d: windowStats(90),
      prev_365d: windowStats(365),
    },
    grade_chart_suggestion: deriveGradeChartFromData(rows),
    sample_rows: cappedSample,
  };
}

/**
 * Rule-based fallback interpretation.
 * Kept here so all hardcoded interpretation logic lives in this module.
 */
export async function interpretRuleBased(data) {
  const rows = Array.isArray(data) ? data : [];

  const sales = rows.filter((d) => d?.listing_type === "sale" || d?.listing_type === "sold");
  const unsold = rows.filter((d) => d?.listing_type === "unsold");
  const auctions = rows.filter((d) => d?.listing_type === "auction");
  const obo = rows.filter((d) => d?.listing_type === "obo");

  const prices = rows.map((d) => toNumber(d?.price)).filter((n) => n != null);
  const sortedPrices = [...prices].sort((a, b) => a - b);
  const med = median(sortedPrices) ?? 0;
  const minP = prices.length ? Math.min(...prices) : 0;
  const maxP = prices.length ? Math.max(...prices) : 0;

  const platforms = [...new Set(rows.map((d) => d?.platform).filter(Boolean))];
  const conditions = [...new Set(rows.map((d) => d?.condition).filter(Boolean))];

  const evidence = [];
  if (sales.length) {
    const salePrices = sales.map((d) => toNumber(d?.price)).filter((n) => n != null);
    if (salePrices.length) {
      evidence.push(
        `Confirmed sales: ${sales.length} transaction${sales.length > 1 ? "s" : ""} ($${Math.min(...salePrices)}–$${Math.max(...salePrices)})`
      );
    }
  }
  auctions.forEach((d) => evidence.push(`Auction: $${d.price} (${d.condition}, ${d.platform})`));
  unsold.forEach((d) => evidence.push(`Unsold listing: $${d.price} (${d.platform})`));
  if (obo.length) {
    evidence.push(`Best-offer listings: ${obo.map((d) => `$${d.price}`).join(", ")}`);
  }

  const assumptions = [
    "Auctions reflect collector demand and competitive bidding.",
    "Listings reflect seller expectations; unsold may indicate overpricing or weak liquidity.",
    "Condition (Mint/NM/VG+/VG/G) affects price; comparisons should account for grading.",
    "Multiple platforms may differ in buyer base and pricing norms.",
  ];

  const limitations = [];
  if (sales.length < 3) limitations.push("Very few confirmed sales — summary may not reflect stable demand.");
  if (rows.length < 8) limitations.push("Small sample size; interpretation is suggestive, not definitive.");
  if (conditions.length > 2) limitations.push("Mixed conditions in the data; like-for-like comparison is limited.");
  if (platforms.length === 1) limitations.push("Data from a single platform only; cross-market comparison not possible.");
  if (unsold.length && sales.length) {
    const lowUnsold = unsold.some((d) => {
      const p = toNumber(d?.price);
      return p != null && p < med * 0.9;
    });
    if (lowUnsold) limitations.push("Unsold listings at lower prices may indicate overpricing elsewhere or different liquidity.");
  }
  if (limitations.length === 0) limitations.push("Limited time window; seasonal or trend effects not assessed.");

  const pricesAboveMin = prices.filter((p) => p > minP);
  const upperRange = pricesAboveMin.length ? Math.min(...pricesAboveMin) : maxP;
  const altTemplates = [
    `The higher end of the range (e.g. $${maxP}) may reflect item rarity or one-off demand rather than a typical market value.`,
    `Unsold listings in the $${minP}–$${upperRange} range could mean weak liquidity, overpricing, or condition differences.`,
    `With only ${sales.length} sale(s), the median ($${Math.round(med)}) is sensitive to each transaction; one more sale could shift the picture.`,
    `Auction outcomes can overstate “market” value when few bidders compete; list prices may better reflect what sellers expect.`,
  ];

  const summary =
    sales.length >= 2
      ? `Recent marketplace signals suggest a central range around $${Math.round(med)}, based on ${rows.length} records (${sales.length} confirmed sale${sales.length > 1 ? "s" : ""}). This conclusion relies on a small set of transactions and may not reflect stable demand or broader market conditions.`
      : `Very limited data (${rows.length} records, ${sales.length} sale${sales.length !== 1 ? "s" : ""}) — any single number (e.g. $${Math.round(med)}) should be treated as suggestive, not a reliable “value.”`;

  return {
    summary,
    evidence,
    assumptions,
    limitations,
    alternatives: altTemplates,
    plan: "",
    reasoning_steps: [],
    saleCount: sales.length,
    totalCount: rows.length,
    current_estimate: med,
    current_trend: "None",
    current_high_range: maxP,
    current_low_range: minP,
  };
}

export const __test = {
  safeJsonParse,
};

