/**
 * Interpretation source: try LLM inference API (Ollama) first; fallback to rule-based.
 * No RAG — prompt + model inference only.
 */

import { interpretRuleBased } from "./interpretation/engine.js";
import {
  INTERPRETATION_SCHEMA_VERSION,
  compactMarketSummary,
  normalizeInterpretation,
  stableStringify,
} from "./interpretation/engine.js";

const INFERENCE_API = globalThis?.INFERENCE_API_URL || "http://localhost:5000";
// External FastAPI interpretation-engine service (preferred when configured).
const INTERPRETATION_ENGINE_API = globalThis?.INTERPRETATION_ENGINE_API_URL || "";

const SCHEMA_VERSION = INTERPRETATION_SCHEMA_VERSION;

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_FASTAPI_TIMEOUT_MS = 120_000;

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const CACHE_PREFIX = "market-ai:interpretation:";

const CIRCUIT_FAIL_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 2 * 60 * 1000; // 2m

const inFlight = new Map(); // cacheKey -> Promise

const circuit = {
  failures: 0,
  openUntil: 0,
};

function nowMs() {
  return Date.now();
}

function hasLocalStorage() {
  try {
    return typeof localStorage !== "undefined" && !!localStorage;
  } catch {
    return false;
  }
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// Simple stable hash (FNV-1a 32-bit).
function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function makeCacheKey(provider, data) {
  const body = stableStringify({ provider, schema: SCHEMA_VERSION, data });
  return `${CACHE_PREFIX}${provider}:${hashString(body)}`;
}

function loadCache(cacheKey) {
  if (!hasLocalStorage()) return null;
  const raw = localStorage.getItem(cacheKey);
  if (!raw) return null;
  const obj = safeJsonParse(raw);
  if (!obj || typeof obj !== "object") return null;
  if (typeof obj.expiresAt !== "number" || obj.expiresAt < nowMs()) {
    localStorage.removeItem(cacheKey);
    return null;
  }
  return obj.value ?? null;
}

function saveCache(cacheKey, value) {
  if (!hasLocalStorage()) return;
  const payload = { expiresAt: nowMs() + CACHE_TTL_MS, value };
  try {
    localStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch {
    // ignore quota errors
  }
}

async function fetchJsonWithTimeout(url, { method = "GET", headers, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      mode: "cors",
      credentials: "omit",
      signal: controller.signal,
    });
    const text = await res.text();
    const json = text ? safeJsonParse(text) : null;
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(t);
  }
}

function isRetryableStatus(status) {
  return status === 429 || status === 503 || status === 502 || status === 504;
}

async function sleepMs(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function retryingPostJson(url, payload, { timeoutMs, attempts = 3 } = {}) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    const { ok, status, json } = await fetchJsonWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      timeoutMs,
    }).catch((e) => {
      lastErr = e;
      return { ok: false, status: 0, json: null };
    });

    if (ok) return { ok: true, status, json, error: null };
    if (!isRetryableStatus(status)) return { ok: false, status, json, error: lastErr };

    // exponential backoff with jitter
    const backoff = Math.min(2000 * 2 ** i, 8000) + Math.floor(Math.random() * 250);
    await sleepMs(backoff);
  }
  return { ok: false, status: 0, json: null, error: lastErr };
}

async function fetchInterpretation_Ollama(data) {
  const res = await fetchJsonWithTimeout(`${INFERENCE_API}/interpret`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
  if (!res.ok) {
    const body = res.json || {};
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json || {};
}

function circuitIsOpen() {
  return circuit.openUntil > nowMs();
}

function circuitRecordFailure() {
  circuit.failures += 1;
  if (circuit.failures >= CIRCUIT_FAIL_THRESHOLD) {
    circuit.openUntil = nowMs() + CIRCUIT_COOLDOWN_MS;
  }
}

function circuitRecordSuccess() {
  circuit.failures = 0;
  circuit.openUntil = 0;
}

function buildListingsSnippet(data, { maxRows = 25, descMax = 120 } = {}) {
  const rows = Array.isArray(data) ? data : [];
  const withT = rows
    .map((d) => ({ d, t: new Date(d?.date).getTime() }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => b.t - a.t);

  const picked = (withT.length ? withT.map((x) => x.d) : rows).slice(0, maxRows);

  return picked.map((d) => ({
    id: d?.id ?? null,
    date: d?.date != null ? String(d.date) : null,
    listing_type: d?.listing_type != null ? String(d.listing_type) : null,
    condition: d?.condition != null ? String(d.condition) : null,
    platform: d?.platform != null ? String(d.platform) : null,
    grade: d?.grade != null ? String(d.grade) : null,
    price: d?.price != null && Number.isFinite(Number(d.price)) ? Number(d.price) : null,
    description: d?.description ? String(d.description).slice(0, descMax) : null,
  }));
}

async function fetchInterpretation_FastApi(data) {
  if (!INTERPRETATION_ENGINE_API) throw new Error("FastAPI not configured");
  if (circuitIsOpen()) throw new Error("FastAPI circuit open");

  const market_summary = compactMarketSummary(data);
  const listings_snippet = buildListingsSnippet(data);
  const payload = {
    schema_version: SCHEMA_VERSION,
    correlation_id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    client_capabilities: {
      max_payload_bytes_hint: 24_000,
      allow_followup: false,
    },
    market_summary,
    listings_snippet,
  };

  const base = INTERPRETATION_ENGINE_API.replace(/\/+$/, "");
  const endpoint = base.endsWith("/interpret-engine") ? base : `${base}/interpret`;

  const { ok, status, json, error } = await retryingPostJson(endpoint, payload, {
    timeoutMs: DEFAULT_FASTAPI_TIMEOUT_MS,
    attempts: 3,
  });

  if (!ok) {
    circuitRecordFailure();
    const msg =
      (json && json.error) ||
      (error && error.name === "AbortError" ? `Timeout after ${DEFAULT_FASTAPI_TIMEOUT_MS}ms calling ${endpoint}` : null) ||
      (error && error.message ? `Network/CORS error calling ${endpoint}: ${error.message}` : null) ||
      `HTTP ${status}`;
    throw new Error(msg);
  }

  circuitRecordSuccess();
  return json || {};
}

/** Get interpretation: LLM if API available, else rule-based. Same shape as interpret(). */
// if test_data use preset
export async function getInterpretation(data, usePresetInterpretation, presetInterpretationFileName) {
  if (usePresetInterpretation && presetInterpretationFileName && presetInterpretationFileName !== "none") { // use a preset-interpretation
    try {
      const interpretation = await fetch("data/preset_interpretations/" + presetInterpretationFileName).then((r) => r.json());
      const norm = normalizeInterpretation(interpretation, data);
      const gradeRanges = norm.grade_chart || {};

      const formattedRanges = Object.entries(gradeRanges)
        .map(([grade, [low, high]]) => `${grade}: $${low}–$${high}`)
        .join(", and ");

      let saleCount =  (data.length) - (data.filter((d) => d.listing_type === "unsold").length);
      let totalCount = data.length;
      const summary = `Our AI Model estimates that the current market value (past three months) is : ${formattedRanges}. This is based on ${totalCount} records (${saleCount} confirmed sale${saleCount > 1 ? "s" : ""}).`;      
      return normalizeInterpretation(
        {
          ...norm,
          summary,
          saleCount,
          totalCount,
        },
        data
      );
    } catch (e){
      console.error("Failed to load preset interpretation, falling back to live inference:", e);
      return normalizeInterpretation(await interpretRuleBased(data), data);
    }
  } else {
    const providerOrder = [
      { name: "fastapi", enabled: !!INTERPRETATION_ENGINE_API, fn: fetchInterpretation_FastApi },
      { name: "ollama", enabled: !!INFERENCE_API, fn: fetchInterpretation_Ollama },
      { name: "rule", enabled: true, fn: async (d) => interpretRuleBased(d) },
    ];

    for (const p of providerOrder) {
      if (!p.enabled) continue;
      const cacheKey = makeCacheKey(p.name, data);
      const cached = loadCache(cacheKey);
      if (cached) return normalizeInterpretation(cached, data);

      if (inFlight.has(cacheKey)) {
        return normalizeInterpretation(await inFlight.get(cacheKey), data);
      }

      const prom = (async () => {
        const raw = await p.fn(data);
        saveCache(cacheKey, raw);
        return raw;
      })().finally(() => inFlight.delete(cacheKey));

      inFlight.set(cacheKey, prom);

      try {
        const raw = await prom;
        return normalizeInterpretation(raw, data);
      } catch (e) {
        console.warn(`Interpretation provider failed (${p.name}):`, e);
        // continue to next provider
      }
    }

    // final safety net
    return normalizeInterpretation(await interpretRuleBased(data), data);
  }
}

// Test hooks (node/unit tests): kept named exports so we can validate request sizing and range derivation.
export const __test = {
  compactMarketSummary,
  normalizeInterpretation,
  makeCacheKey,
  hashString,
  stableStringify,
};
