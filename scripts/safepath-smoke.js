const BASE_URL = String(process.env.SMOKE_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");
const AUTH_TOKEN = process.env.SMOKE_AUTH_TOKEN || "";
const SAMPLE_TRACKING_ID = process.env.SMOKE_TRACKING_ID || "AbC123xYz9";

async function check(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    return true;
  } catch (error) {
    console.error(`[FAIL] ${name}: ${error.message}`);
    return false;
  }
}

async function getJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { response, body };
}

function assertStatus(actual, allowed, context) {
  if (!allowed.includes(actual)) {
    throw new Error(`${context} expected status ${allowed.join("/")}, got ${actual}`);
  }
}

async function run() {
  console.log(`SafePath smoke checks against: ${BASE_URL}`);

  const results = [];

  results.push(
    await check("/health", async () => {
      const { response } = await getJson(`${BASE_URL}/health`);
      assertStatus(response.status, [200, 503], "health");
    })
  );

  results.push(
    await check("/api/guardian/safety-score invalid input", async () => {
      const { response, body } = await getJson(`${BASE_URL}/api/guardian/safety-score`);
      assertStatus(response.status, [400], "safety-score invalid input");
      if (!body || !body.error) {
        throw new Error("safety-score response missing error field");
      }
    })
  );

  results.push(
    await check("/api/guardian/tracking invalid format", async () => {
      const { response, body } = await getJson(`${BASE_URL}/api/guardian/tracking/bad token`);
      assertStatus(response.status, [400], "tracking invalid format");
      if (!body || body.success !== false) {
        throw new Error("tracking invalid format should return success=false");
      }
    })
  );

  results.push(
    await check("/api/guardian/tracking sample token", async () => {
      const { response } = await getJson(`${BASE_URL}/api/guardian/tracking/${encodeURIComponent(SAMPLE_TRACKING_ID)}`);
      assertStatus(response.status, [200, 404], "tracking sample token");
    })
  );

  results.push(
    await check("/api/guardian/self-check auth gate", async () => {
      const headers = AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {};
      const { response, body } = await getJson(`${BASE_URL}/api/guardian/self-check`, {
        headers,
      });

      if (AUTH_TOKEN) {
        assertStatus(response.status, [200, 503], "guardian self-check (auth)");
      } else {
        assertStatus(response.status, [401], "guardian self-check (no auth)");
        if (!body || !body.error) {
          throw new Error("guardian self-check unauthorized response missing error field");
        }
      }
    })
  );

  const passed = results.filter(Boolean).length;
  const total = results.length;

  console.log(`\nSmoke result: ${passed}/${total} checks passed`);
  if (passed !== total) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error("Smoke script failed:", error.message);
  process.exit(1);
});
