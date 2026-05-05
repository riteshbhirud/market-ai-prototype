#!/usr/bin/env python3
"""
Inference API for the market-ai prototype. Uses a local LLM (Ollama) with
Structured Chain of Thought (SCoT) reasoning: plan, reasoning_steps, summary,
evidence, assumptions, limitations. No RAG — prompt + model inference only.
Fallback: return 503 so the frontend can use the rule-based engine.
"""
import json
import os
import re
import urllib.request
import urllib.error
import urllib.parse

# Default: Ollama on localhost; override with env OLLAMA_HOST
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")
INFERENCE_TIMEOUT = int(os.environ.get("INFERENCE_TIMEOUT", "90"))

# Optional proxy target for the external FastAPI interpretation-engine service.
# This helps when the browser cannot reach the service due to CORS/network.
INTERPRETATION_ENGINE_API = os.environ.get("INTERPRETATION_ENGINE_API", "").rstrip("/")
PROXY_TIMEOUT = int(os.environ.get("PROXY_TIMEOUT", str(INFERENCE_TIMEOUT)))

# SCoT prompt template (Structured Chain of Thought)
SCOT_APPRAISER = """You are an expert in collectibles with a knowledge of market trends.
Solve the following problem, reasoning step-by-step in a structured way.

Problem:
Given the following listing data, generate a summary of the current market value of the collectible.
Here is an example summary: "Recent market signals suggest a typical value around $X"

{listing_data}

The values in the JSON correspond to the following:
Listing Type: Unsold, Sale, Auction, Or Best Offer (obo).
Condition: Good (G), Very Good (VG), Very Good + (VG+), Near Mint (NM), Mint (M).
Platform: eBay, Discogs, Etsy, Amazon.
Date: MM-DD-YYYY.
Price: $USD.

Output your reasoning and solution in this exact JSON format (strictly valid JSON, no markdown):
{{
  "plan": "Describe how you'll solve the problem.",
  "reasoning_steps": ["Step 1...", "Step 2...", "..."],
  "summary": "Summary including price range or average",
  "evidence": ["Evidence 1 Supporting Summary", "Evidence 2", "..."],
  "assumptions": ["Assumption 1 Assumed for Summary", "Assumption 2", "..."],
  "limitations": ["Limitation 1 of Summary", "Limitation 2", "..."],
  "alternatives": ["Alternative explanation 1", "Alternative 2", "..."]
}}

Important:
- Limit evidence to at most 6 items, assumptions to 5, limitations to 5.
- Keep the JSON strictly valid. Output only the JSON object, no other text."""


def _date_to_mm_dd_yyyy(d):
    """Convert YYYY-MM-DD to MM-DD-YYYY for prompt."""
    if not d:
        return ""
    parts = str(d).strip().split("-")
    if len(parts) == 3:
        y, m, d = parts[0], parts[1], parts[2]
        return f"{m}-{d}-{y}"
    return str(d)


def _build_listing_data(data):
    """Build listing_data JSON for the SCoT prompt (listing_type, condition, platform, date, price)."""
    if not data:
        return "[]"
    listings = []
    for row in data:
        listings.append({
            "listing_type": row.get("listing_type", ""),
            "condition": row.get("condition", ""),
            "platform": row.get("platform", ""),
            "date": _date_to_mm_dd_yyyy(row.get("date", "")),
            "price": row.get("price", ""),
        })
    return json.dumps(listings, indent=2)


def _build_prompt(data):
    """Build the full SCoT prompt with listing data."""
    listing_data = _build_listing_data(data)
    return SCOT_APPRAISER.format(listing_data=listing_data)


def call_ollama(prompt, system=None):
    """Call Ollama /api/generate. Returns (response_text, error)."""
    body = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
    }
    if system:
        body["system"] = system
    req = urllib.request.Request(
        f"{OLLAMA_HOST.rstrip('/')}/api/generate",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=INFERENCE_TIMEOUT) as resp:
            out = json.loads(resp.read().decode("utf-8"))
            return (out.get("response") or "").strip(), None
    except urllib.error.HTTPError as e:
        return None, f"Ollama HTTP {e.code}: {e.reason}"
    except urllib.error.URLError as e:
        return None, f"Ollama unreachable: {e.reason}"
    except json.JSONDecodeError as e:
        return None, f"Invalid JSON from Ollama: {e}"
    except Exception as e:
        return None, str(e)


def extract_json(text):
    """Try to extract a JSON object from model output (handles markdown fences)."""
    text = (text or "").strip()
    m = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text)
    if m:
        text = m.group(1)
    else:
        start = text.find("{")
        if start != -1:
            depth = 0
            for i in range(start, len(text)):
                if text[i] == "{":
                    depth += 1
                elif text[i] == "}":
                    depth -= 1
                    if depth == 0:
                        text = text[start : i + 1]
                        break
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _ensure_list(x, default=None):
    if x is None:
        return default or []
    return x if isinstance(x, list) else [x]


def interpret_with_llm(data):
    """
    Run LLM inference with SCoT. Returns a dict with
    plan, reasoning_steps, summary, evidence, assumptions, limitations, alternatives,
    or None on failure.
    """
    prompt = _build_prompt(data)
    response, err = call_ollama(prompt)
    if err or not response:
        return None, err

    obj = extract_json(response)
    if not obj or not isinstance(obj, dict):
        return None, "Model did not return valid JSON"

    evidence = _ensure_list(obj.get("evidence"), [])
    assumptions = _ensure_list(obj.get("assumptions"), [])
    limitations = _ensure_list(obj.get("limitations"), [])
    alternatives = _ensure_list(obj.get("alternatives"), [])
    reasoning_steps = _ensure_list(obj.get("reasoning_steps"), [])

    # If model didn't return alternatives, use last reasoning step or a limitation as one
    if not alternatives and reasoning_steps:
        alternatives = [reasoning_steps[-1]] if reasoning_steps else []
    if not alternatives and limitations:
        alternatives = [limitations[0]] if limitations else []
    if not alternatives:
        alternatives = ["Alternative view not generated."]

    return {
        "plan": obj.get("plan") or "",
        "reasoning_steps": reasoning_steps,
        "summary": obj.get("summary") or "No summary generated.",
        "evidence": evidence[:6],
        "assumptions": assumptions[:5],
        "limitations": limitations[:5],
        "alternatives": alternatives,
        "median": None,
        "saleCount": sum(1 for d in data if d.get("listing_type") == "sale"),
        "totalCount": len(data),
    }, None


def main():
    """Run a minimal HTTP server that exposes POST /interpret (Ollama) and optional proxy."""
    from http.server import HTTPServer, BaseHTTPRequestHandler

    class InferenceHandler(BaseHTTPRequestHandler):
        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def do_POST(self):
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length) if length else b""
                payload = json.loads(body.decode("utf-8"))
            except (ValueError, json.JSONDecodeError) as e:
                self._send_json(400, {"error": f"Invalid request: {e}"})
                return

            if self.path == "/interpret":
                data = payload.get("data") or []
                result, err = interpret_with_llm(data)
                if err:
                    self._send_json(503, {"error": err, "fallback": True})
                    return
                self._send_json(200, result)
                return

            # Same-origin proxy to external FastAPI interpretation-engine.
            # Expected browser request: POST /interpret-engine with JSON body (already shaped by js/api.js)
            if self.path == "/interpret-engine":
                if not INTERPRETATION_ENGINE_API:
                    self._send_json(503, {"error": "INTERPRETATION_ENGINE_API not configured", "fallback": True})
                    return
                try:
                    proxied = self._proxy_post_json(f"{INTERPRETATION_ENGINE_API}/interpret", payload)
                    self._send_json(proxied["status"], proxied["json"])
                except Exception as e:
                    self._send_json(503, {"error": f"Proxy failed: {e}", "fallback": True})
                return

            self.send_response(404)
            self.end_headers()

        def _proxy_post_json(self, url, obj):
            req = urllib.request.Request(
                url,
                data=json.dumps(obj).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=PROXY_TIMEOUT) as resp:
                    raw = resp.read().decode("utf-8")
                    return {"status": resp.status, "json": json.loads(raw) if raw else {}}
            except urllib.error.HTTPError as e:
                raw = e.read().decode("utf-8") if hasattr(e, "read") else ""
                parsed = None
                try:
                    parsed = json.loads(raw) if raw else None
                except Exception:
                    parsed = None
                return {"status": e.code, "json": parsed or {"error": raw or f"HTTP {e.code}: {e.reason}"}}

        def _send_json(self, status, obj):
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(obj).encode("utf-8"))

        def log_message(self, format, *args):
            pass

    port = int(os.environ.get("INFERENCE_PORT", "5000"))
    server = HTTPServer(("", port), InferenceHandler)
    print(f"Inference API at http://localhost:{port} (Ollama: {OLLAMA_HOST}, model: {OLLAMA_MODEL})")
    print("POST /interpret with JSON body: {\"data\": [...]} (SCoT reasoning)")
    if INTERPRETATION_ENGINE_API:
        print(f"POST /interpret-engine proxies to: {INTERPRETATION_ENGINE_API}/interpret")
    server.serve_forever()


if __name__ == "__main__":
    main()
