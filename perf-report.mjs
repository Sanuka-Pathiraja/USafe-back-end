/**
 * USafe Backend — Performance Benchmark
 * Run: node perf-report.mjs
 * Requires the server to be running on BASE_URL.
 */

const BASE_URL = "http://localhost:5000";
const RUNS = 5; // number of times each endpoint is called

// ─── credentials ───────────────────────────────────────────────
const EMAIL = "sahan@email.com";
const PASSWORD = "sahan";
// ───────────────────────────────────────────────────────────────

// ─── helpers ───────────────────────────────────────────────────
function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

function avg(arr) {
  return (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
}

function min(arr) {
  return Math.min(...arr).toFixed(1);
}

function max(arr) {
  return Math.max(...arr).toFixed(1);
}

async function request(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const t0 = performance.now();
  let status;
  try {
    const res = await fetch(`${BASE_URL}${path}`, opts);
    status = res.status;
    await res.json();
  } catch (e) {
    status = "ERR";
  }
  const ms = performance.now() - t0;
  return { ms, status };
}

async function bench(label, method, path, body, token) {
  const times = [];
  let lastStatus;
  for (let i = 0; i < RUNS; i++) {
    const { ms, status } = await request(method, path, body, token);
    times.push(ms);
    lastStatus = status;
  }
  return { label, method, path, avg: avg(times), min: min(times), max: max(times), status: lastStatus };
}

function printTable(rows) {
  const cols = [
    { key: "label",  title: "Endpoint",       width: 36 },
    { key: "method", title: "Method",          width: 7  },
    { key: "status", title: "Status",          width: 7  },
    { key: "avg",    title: "Avg (ms)",        width: 10 },
    { key: "min",    title: "Min (ms)",        width: 10 },
    { key: "max",    title: "Max (ms)",        width: 10 },
  ];

  const line = cols.map(c => "─".repeat(c.width)).join("┼");
  const header = cols.map(c => c.title.padEnd(c.width)).join("│");

  console.log("\n┌" + cols.map(c => "─".repeat(c.width)).join("┬") + "┐");
  console.log("│" + header + "│");
  console.log("├" + line + "┤");

  for (const row of rows) {
    const cells = cols.map(c => String(row[c.key] ?? "").padEnd(c.width));
    console.log("│" + cells.join("│") + "│");
  }

  console.log("└" + cols.map(c => "─".repeat(c.width)).join("┴") + "┘");
}

// ─── main ──────────────────────────────────────────────────────
async function main() {
  console.log("=".repeat(70));
  console.log("  USafe Backend — Performance Report");
  console.log("  Date :", new Date().toISOString());
  console.log("  Runs per endpoint:", RUNS);
  console.log("=".repeat(70));

  const memBefore = process.memoryUsage();

  // Step 1 — login to get token
  process.stdout.write("\n[1/2] Logging in to get JWT token... ");
  const { ms: loginMs, status: loginStatus } = await request(
    "POST", "/user/login", { email: EMAIL, password: PASSWORD }
  );

  let token = null;
  try {
    const res = await fetch(`${BASE_URL}/user/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const data = await res.json();
    token = data.token;
  } catch {}

  if (!token) {
    console.log("FAILED — check EMAIL/PASSWORD and that the server is running.");
    process.exit(1);
  }
  console.log(`OK (${loginMs.toFixed(1)} ms, status ${loginStatus})`);

  // Step 2 — benchmark each endpoint
  process.stdout.write("[2/2] Running benchmarks");
  const tick = () => process.stdout.write(".");

  const results = [];

  const run = async (...args) => { const r = await bench(...args); results.push(r); tick(); return r; };

  // Auth
  await run("Login",                     "POST", "/user/login",           { email: EMAIL, password: PASSWORD });
  await run("Get user profile",          "GET",  "/user/get",             null,  token);

  // Contacts
  await run("List contacts",             "GET",  "/contact/contacts",     null,  token);

  // Community feed
  await run("Community feed (default)",  "GET",  "/report/feed",          null,  token);
  await run("Community feed (limit=5)",  "GET",  "/report/feed?limit=5",  null,  token);

  // Safe route
  await run("Safe route",                "GET",  "/safe-route",           null,  token);

  // Trip
  await run("Trip start (validation)",   "POST", "/api/trip/start",
    { tripName: "", durationMinutes: 0, contactIds: [] }, token);

  // Community report
  await run("My reports",                "GET",  "/report/my-reports",    null,  token);

  // User
  await run("Report count",             "GET",  "/user/community-report-count", null, token);

  // Emergency start (set DISABLE_SMS=true, CALL_PROVIDER=demo, ALLOW_DEMO_CALL_FALLBACK=true in .env first)
  await run("Emergency start",          "POST", "/emergency/start",
    { locationText: "Colombo", useDefaultTemplate: true }, token);

  // SMS (DISABLE_SMS=true in .env — no real message sent)
  await run("Bulk SMS (Notify.lk)",     "POST", "/sms/notify/bulk",
    { recipients: [{ to: "0771234567" }], message: "Perf test" });

  // Call (CALL_PROVIDER=demo in .env — no real call made)
  await run("Voice call",               "POST", "/call",
    { to: "0771234567" });

  console.log(" done\n");

  // ─── memory snapshot ─────────────────────────────────────────
  const memAfter = process.memoryUsage();

  printTable(results);

  console.log("\n  Memory Usage");
  console.log("  ─────────────────────────────────────────");
  console.log(`  RSS (before)       : ${mb(memBefore.rss)}`);
  console.log(`  RSS (after)        : ${mb(memAfter.rss)}`);
  console.log(`  Heap used (before) : ${mb(memBefore.heapUsed)}`);
  console.log(`  Heap used (after)  : ${mb(memAfter.heapUsed)}`);
  console.log(`  Heap total         : ${mb(memAfter.heapTotal)}`);
  console.log("  ─────────────────────────────────────────");
  console.log(`  All times are averages over ${RUNS} runs.\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
