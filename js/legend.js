const CONDITION_COLORS = {
  M: "green",
  Mint: "green",
  NM: "blue",
  "VG+": "orange",
  VG: "red",
  G: "gray",
};

// Known platforms get fixed colors; others get colors from this palette
const PLATFORM_PALETTE = [
  "#e53238", // eBay red
  "#2d2d2d", // Discogs dark
  "#f56400", // Etsy orange
  "#ff9900", // Amazon
  "#4267b2", // Facebook blue
  "#25d366", // WhatsApp green
  "#7c3aed", // generic purple
  "#0ea5e9", // generic sky
  "#64748b", // slate
];

function getPlatformColors(platforms) {
  const known = { eBay: "#a099d0", Discogs: "#af6af4", Etsy: "#f54bd3", Amazon: "#da5e00", "Facebook Marketplace": "#4267b2" };
  const order = [...new Set(platforms)];
  const scale = {};
  let paletteIndex = 0;
  order.forEach((p) => {
    scale[p] = known[p] ?? PLATFORM_PALETTE[paletteIndex++ % PLATFORM_PALETTE.length];
  });
  return scale;
}

function getSymbol(type) {
  if (type === "sale") return "●";
  if (type === "unsold") return "⊕";
  if (type === "auction") return "▲";
  if (type === "obo") return "◆";
  return "●";
}

function getColor(cond) {
  return CONDITION_COLORS[cond] || "gray";
}

export function drawLegend(data) {
  const container = d3.select("#legend").html("");

  const listingTypes = [...new Set(data.map((d) => d.listing_type))];
  const conditions = [...new Set(data.map((d) => d.condition))];
  const platforms = [...new Set(data.map((d) => d.platform))];
  const platformColors = getPlatformColors(platforms);

  const shapeLegend = container.append("div").attr("class", "legend-block");
  shapeLegend.append("div").text("Listing type");
  listingTypes.forEach((type) => {
    const item = shapeLegend.append("div").attr("class", "legend-item");
    item.append("span").attr("class", "legend-symbol").text(getSymbol(type));
    item.append("span").text(type);
  });

  const colorLegend = container.append("div").attr("class", "legend-block");
  colorLegend.append("div").text("Condition");
  conditions.forEach((cond) => {
    const item = colorLegend.append("div").attr("class", "legend-item");
    item
      .append("span")
      .attr("class", "legend-symbol")
      .style("background", getColor(cond))
      .style("border-radius", "2px");
    item.append("span").text(cond);
  });

  const platformLegend = container.append("div").attr("class", "legend-block");
  platformLegend.append("div").text("Platform (outline)");
  platforms.forEach((platform) => {
    const item = platformLegend.append("div").attr("class", "legend-item");
    item
      .append("span")
      .attr("class", "legend-symbol")
      .style("background", "transparent")
      .style("border", `4px solid ${platformColors[platform] ?? "#666"}`);
    item.append("span").text(platform);
  });
}

export { getColor, getSymbol, getPlatformColors, CONDITION_COLORS, PLATFORM_PALETTE };
