const CONDITION_COLORS = {
  NM: "#2563eb",
  "VG+": "#ea580c",
  VG: "#dc2626",
  G: "#6b7280",
  M: "#7c3aed",
  Mint: "#059669",
};

const PLATFORM_STYLES = {
  eBay: { color: "#e53238", dash: null },
  Discogs: { color: "#1a1a1a", dash: null },
  Etsy: { color: "#f56400", dash: "4 2" },
  Amazon: { color: "#ff9900", dash: "2 2" },
  "Facebook Marketplace": { color: "#4267b2", dash: "5 3" },
};

const PLATFORM_PALETTE = [
  { color: "#0ea5e9", dash: null },
  { color: "#7c3aed", dash: "4 2" },
  { color: "#15803d", dash: "2 2" },
  { color: "#64748b", dash: "5 3" },
  { color: "#b91c1c", dash: "1 2" },
];

function getPlatformStyles(platforms) {
  const order = [...new Set(platforms)];
  const scale = {};
  let paletteIndex = 0;
  order.forEach((p) => {
    scale[p] = PLATFORM_STYLES[p] ?? PLATFORM_PALETTE[paletteIndex++ % PLATFORM_PALETTE.length];
  });
  return scale;
}

function getPlatformColors(platforms) {
  const styles = getPlatformStyles(platforms);
  const colors = {};
  Object.keys(styles).forEach((p) => (colors[p] = styles[p].color));
  return colors;
}

function getPlatformDashes(platforms) {
  const styles = getPlatformStyles(platforms);
  const dashes = {};
  Object.keys(styles).forEach((p) => (dashes[p] = styles[p].dash));
  return dashes;
}

const LISTING_TYPE_LABEL = {
  sale: "Sale",
  unsold: "Unsold",
  auction: "Auction",
  obo: "OBO",
};

const LISTING_TYPE_DESC = {
  sale: "Confirmed sale — buyer purchased at the listed price.",
  unsold: "Listed but did not sell — represents an asking price floor, not a market value.",
  auction: "Auction result — final winning bid; strong market signal.",
  obo: "Or-Best-Offer listing — final price negotiated with seller.",
};

const CONDITION_FULL = {
  M: "Mint — perfect, unplayed; like new from the factory.",
  Mint: "Mint — perfect, unplayed; like new from the factory.",
  NM: "Near Mint — minimal handling; almost no visible wear.",
  "VG+": "Very Good Plus — light wear; plays without surface noise.",
  VG: "Very Good — visible wear; some minor surface noise possible.",
  G: "Good — significant wear; plays through but with audible defects.",
};

const PLATFORM_DESC = {
  eBay: "eBay — broad marketplace; auctions and fixed-price listings.",
  Discogs: "Discogs — collector-focused music marketplace; condition-graded listings.",
  Etsy: "Etsy — independent sellers; often vintage or curated copies.",
  Amazon: "Amazon — fixed-price retail; usually new or warehouse copies.",
  "Facebook Marketplace": "Facebook Marketplace — local listings; condition and authenticity vary.",
};

const SECTION_INFO = {
  "Listing type": "How each transaction was offered — confirmed sales and auctions are stronger signals than unsold asking prices.",
  "Condition": "Grading scale used by collectors. Hover each badge for the full definition.",
  "Platform": "Where the listing appeared. Different platforms have different buyer pools and pricing norms.",
};

function symbolPathFor(type, size = 90) {
  if (type === "unsold") return d3.symbol().type(d3.symbolPlus).size(size)();
  if (type === "auction") return d3.symbol().type(d3.symbolTriangle).size(size)();
  if (type === "obo") return d3.symbol().type(d3.symbolDiamond).size(size)();
  return d3.symbol().type(d3.symbolCircle).size(size)();
}

function getColor(cond) {
  return CONDITION_COLORS[cond] || "gray";
}

// Renders a compact HTML legend strip at the top of the chart container so
// the plot area itself is fully unobstructed. Rebuilt on every chart render.
export function drawChartLegend(container, data) {
  const node = typeof container.node === "function" ? container.node() : container;
  const existing = node.querySelector(".chart-legend-bar");
  if (existing) existing.remove();

  const listingTypes = [...new Set(data.map((d) => d.listing_type))];
  const conditions = [...new Set(data.map((d) => d.condition))];
  const platforms = [...new Set(data.map((d) => d.platform))];
  const platformStyles = getPlatformStyles(platforms);

  const bar = document.createElement("div");
  bar.className = "chart-legend-bar";

  function makeSection(title, items, renderSwatch, descLookup) {
    const sec = document.createElement("div");
    sec.className = "chart-legend-section";

    const t = document.createElement("span");
    t.className = "chart-legend-title";
    t.textContent = title;
    if (SECTION_INFO[title]) {
      const info = document.createElement("span");
      info.className = "info-icon";
      info.setAttribute("data-tooltip", SECTION_INFO[title]);
      info.setAttribute("tabindex", "0");
      info.textContent = "i";
      t.appendChild(info);
    }
    sec.appendChild(t);

    items.forEach((key) => {
      const row = document.createElement("span");
      row.className = "chart-legend-item";
      const tip = descLookup ? descLookup(key) : null;
      if (tip) {
        row.setAttribute("data-tooltip", tip);
        row.setAttribute("tabindex", "0");
      }
      row.appendChild(renderSwatch(key));
      const lbl = document.createElement("span");
      lbl.className = "chart-legend-label";
      lbl.textContent = LISTING_TYPE_LABEL[key] || key;
      row.appendChild(lbl);
      sec.appendChild(row);
    });
    return sec;
  }

  function makeSvg(width, height) {
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgEl.setAttribute("width", width);
    svgEl.setAttribute("height", height);
    svgEl.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svgEl.setAttribute("class", "chart-legend-swatch");
    return svgEl;
  }

  const typeSection = makeSection("Listing type", listingTypes, (key) => {
    const svgEl = makeSvg(18, 18);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", symbolPathFor(key, key === "unsold" ? 60 : 70));
    path.setAttribute("transform", "translate(9,9)");
    path.setAttribute("fill", key === "unsold" ? "none" : "#9ca3af");
    path.setAttribute("stroke", "#374151");
    path.setAttribute("stroke-width", key === "unsold" ? 2 : 1);
    svgEl.appendChild(path);
    return svgEl;
  }, (key) => LISTING_TYPE_DESC[key] || null);

  const condSection = makeSection("Condition", conditions, (key) => {
    const svgEl = makeSvg(18, 18);
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", 9);
    c.setAttribute("cy", 9);
    c.setAttribute("r", 5);
    c.setAttribute("fill", getColor(key));
    c.setAttribute("stroke", "#fff");
    c.setAttribute("stroke-width", 1);
    svgEl.appendChild(c);
    return svgEl;
  }, (key) => CONDITION_FULL[key] || null);

  const platSection = makeSection("Platform", platforms, (key) => {
    const style = platformStyles[key];
    const svgEl = makeSvg(18, 18);
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", 9);
    c.setAttribute("cy", 9);
    c.setAttribute("r", 5);
    c.setAttribute("fill", "#fff");
    c.setAttribute("stroke", style.color);
    c.setAttribute("stroke-width", 3);
    if (style.dash) c.setAttribute("stroke-dasharray", style.dash);
    svgEl.appendChild(c);
    return svgEl;
  }, (key) => PLATFORM_DESC[key] || `${key} listings`);

  bar.appendChild(typeSection);
  bar.appendChild(condSection);
  bar.appendChild(platSection);

  // Insert just before the SVG so it sits above the plot area.
  const svgInChart = node.querySelector("svg");
  if (svgInChart) {
    node.insertBefore(bar, svgInChart);
  } else {
    node.appendChild(bar);
  }
}

export {
  getColor,
  getPlatformColors,
  getPlatformStyles,
  getPlatformDashes,
  CONDITION_COLORS,
  PLATFORM_STYLES,
};
