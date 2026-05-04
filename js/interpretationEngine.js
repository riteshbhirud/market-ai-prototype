/**
 * Lightweight rule-based interpretation engine.
 * Produces evidence, assumptions, limitations, and alternative explanations
 * from the dataset — interpretation, not recommendation.
 */

// summary: summary,
// evidence: interpretation.evidence,
// assumptions: interpretation.assumptions,
// limitations: interpretation.limitations,
// alternatives: interpretation.alternative_interpretations,
// plan: "",
// reasoning_steps: interpretation.reasoning_steps,
// saleCount: data.length,
// totalCount: data.length, // might not be accurate
// current_estimate: interpretation.current_estimate,
// current_trend: interpretation.current_trend,
// current_high_range: interpretation.current_high_range,
// current_low_range: interpretation.current_low_range,

export async function interpret(data, useAI) {
  if (useAI) {
    return interpret_AI()
  }
  const sales = data.filter((d) => d.listing_type === "sold");
  const unsold = data.filter((d) => d.listing_type === "unsold");
  const auctions = data.filter((d) => d.listing_type === "auction");
  const obo = data.filter((d) => d.listing_type === "obo");
  const prices = data.map((d) => d.price);
  const sortedPrices = [...prices].sort((a, b) => a - b);
  const med = median(sortedPrices);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const platforms = [...new Set(data.map((d) => d.platform))];
  const conditions = [...new Set(data.map((d) => d.condition))];

  const evidence = [];
  if (sales.length) {
    const salePrices = sales.map((d) => d.price);
    evidence.push(
      `Confirmed sales: ${sales.length} transaction${sales.length > 1 ? "s" : ""} ($${Math.min(...salePrices)}–$${Math.max(...salePrices)})`
    );
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
  if (data.length < 8) limitations.push("Small sample size; interpretation is suggestive, not definitive.");
  if (conditions.length > 2) limitations.push("Mixed conditions in the data; like-for-like comparison is limited.");
  if (platforms.length === 1) limitations.push("Data from a single platform only; cross-market comparison not possible.");
  if (unsold.length && sales.length) {
    const lowUnsold = unsold.some((d) => d.price < med * 0.9);
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
      ? `Recent marketplace signals suggest a central range around $${Math.round(med)}, based on ${data.length} records (${sales.length} confirmed sale${sales.length > 1 ? "s" : ""}). This conclusion relies on a small set of transactions and may not reflect stable demand or broader market conditions.`
      : `Very limited data (${data.length} records, ${sales.length} sale${sales.length !== 1 ? "s" : ""}) — any single number (e.g. $${Math.round(med)}) should be treated as suggestive, not a reliable “value.”`;
  
  const interpretation = {
    summary,
    evidence,
    assumptions,
    limitations,
    alternatives: altTemplates,
    plan: "",
    reasoning_steps: [],
    saleCount: sales.length,
    totalCount: data.length,
    current_estimate: med,
    current_trend: "None",
    current_high_range: maxP,
    current_low_range: minP,
  };

  return interpretation;
}

function median(sorted) {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return sorted[(n - 1) / 2];
  return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

/**
 * Returns one alternative explanation; cycle index for "request another".
 */
export async function getAlternativeInterpretation(data, index = 0) {
  const { alternatives } = await interpret(data, useAI=false);
  return alternatives[index % alternatives.length];
}