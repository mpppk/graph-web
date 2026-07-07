// Sign up a test user, seed a small graph, run the full MCP OAuth 2.1 flow
// (DCR -> authorize -> token), then call get_graph directly over MCP to confirm
// the ui:// resource is returned. Writes state.json + session.json into OUT for
// the Inspector UI step (inspector-apps.mjs).
//
// Env overrides:
//   OUT       output dir (default /tmp/mcp-verify)
//   BASE      dev server origin (default http://localhost:3000)
//   REPO      repo dir for `wrangler d1` (default /home/user/graph-web)
//   PW        path to the playwright module (web env has it global)
//   CHROMIUM  path to the chromium binary
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
const PW = process.env.PW || "/opt/node22/lib/node_modules/playwright/index.js";
const pw = (await import(PW)).default;
const { chromium } = pw;

const OUT = process.env.OUT || "/tmp/mcp-verify";
const BASE = process.env.BASE || "http://localhost:3000";
const REPO = process.env.REPO || "/home/user/graph-web";
const CHROMIUM =
	process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
fs.mkdirSync(OUT, { recursive: true });
const email = `verify-${Date.now()}@example.com`;
const password = "password1234";
const uuid = () => crypto.randomUUID();

function d1(cmd) {
	execSync(
		`bun run wrangler d1 execute DB --local --command ${JSON.stringify(cmd)}`,
		{ cwd: REPO, stdio: "ignore" },
	);
}
function d1json(cmd) {
	const out = execSync(
		`bun run wrangler d1 execute DB --local --json --command ${JSON.stringify(cmd)}`,
		{ cwd: REPO, encoding: "utf8" },
	);
	return JSON.parse(out.slice(out.indexOf("[")))[0]?.results ?? [];
}
const b64url = (buf) =>
	buf
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");

const browser = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

// 1. Sign up (establishes the dev-server cookie session)
await page.goto(`${BASE}/login`);
await page.getByRole("button", { name: /Don't have an account/i }).click();
await page.getByLabel("Name").fill("MCP Inspector Verify");
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password").fill(password);
await page.getByRole("button", { name: /Create account/i }).click();
await page.waitForTimeout(2500);
console.log("signed up:", email);

// 2. Create a graph + seed nodes/edges
await page.goto(`${BASE}/graphs`);
await page.getByRole("button", { name: /New Graph/i }).click();
await page.waitForTimeout(2000);
const graphId = d1json("SELECT id FROM graphs ORDER BY created_at DESC LIMIT 1;")[0].id;
const n = [uuid(), uuid(), uuid(), uuid(), uuid()];
const labels = ["売上", "コスト", "利益", "顧客数", "単価"];
const pos = [[100, 80], [100, 260], [380, 170], [-160, 170], [-160, 20]];
const types = ["KPI", "KPI", "KGI", null, null];
for (let i = 0; i < n.length; i++) {
	const t = types[i] === null ? "NULL" : `'${types[i]}'`;
	d1(`INSERT INTO nodes (id, graph_id, label, x, y, node_type) VALUES ('${n[i]}', '${graphId}', '${labels[i]}', ${pos[i][0]}, ${pos[i][1]}, ${t});`);
}
for (const [s, tg, lb] of [[n[0], n[2], "寄与"], [n[1], n[2], "減算"], [n[3], n[0], ""], [n[4], n[0], ""]]) {
	d1(`INSERT INTO edges (id, graph_id, source_node_id, target_node_id, label) VALUES ('${uuid()}', '${graphId}', '${s}', '${tg}', '${lb}');`);
}
console.log("graphId:", graphId, "(5 nodes, 4 edges)");

// 3. Dynamic Client Registration
const redirectUri = `${BASE}/login`;
const reg = await (await fetch(`${BASE}/api/auth/mcp/register`, {
	method: "POST",
	headers: { "content-type": "application/json" },
	body: JSON.stringify({
		client_name: "inspector-verify",
		redirect_uris: [redirectUri],
		grant_types: ["authorization_code", "refresh_token"],
		response_types: ["code"],
		token_endpoint_auth_method: "none",
		scope: "openid profile email offline_access",
	}),
})).json();
const clientId = reg.client_id;
console.log("registered client:", clientId);

// 4. Authorize (already logged in -> consent -> redirect with code)
const verifier = b64url(crypto.randomBytes(32));
const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
const state = uuid();
const authUrl = `${BASE}/api/auth/mcp/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${challenge}&code_challenge_method=S256&scope=${encodeURIComponent("openid profile email offline_access")}&state=${state}`;
await page.goto(authUrl, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
if (/consent/i.test(page.url()) || (await page.getByRole("button", { name: /Approve|Allow|許可|同意|Authorize|Accept/i }).count())) {
	const btn = page.getByRole("button", { name: /Approve|Allow|許可|同意|Authorize|Accept/i }).first();
	if (await btn.count()) { await btn.click(); await page.waitForTimeout(1500); }
}
await page.waitForURL(/[?&]code=/, { timeout: 15000 }).catch(() => {});
const code = new URL(page.url()).searchParams.get("code");
console.log("auth code:", code ? code.slice(0, 12) + "..." : "MISSING");

// 5. Token exchange
const tok = await (await fetch(`${BASE}/api/auth/mcp/token`, {
	method: "POST",
	headers: { "content-type": "application/x-www-form-urlencoded" },
	body: new URLSearchParams({
		grant_type: "authorization_code",
		code,
		redirect_uri: redirectUri,
		client_id: clientId,
		code_verifier: verifier,
	}),
})).json();
const token = tok.access_token;
console.log("access_token:", token ? token.slice(0, 16) + "..." : JSON.stringify(tok));

// 6. Direct MCP call: tools/call get_graph -> confirm ui:// resource returned
async function mcp(method, params, id) {
	const r = await fetch(`${BASE}/api/mcp`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
	});
	const text = await r.text();
	const line = text.split("\n").find((l) => l.startsWith("data:")) ?? text;
	return JSON.parse(line.replace(/^data:\s*/, ""));
}
await mcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "verify", version: "1" } }, 1);
const listed = await mcp("tools/list", {}, 2);
console.log("tools/list:", (listed.result?.tools ?? []).map((t) => t.name).join(", "));
const called = await mcp("tools/call", { name: "get_graph", arguments: { graph_id: graphId } }, 3);
const blocks = called.result?.content ?? [];
console.log("get_graph content blocks:", blocks.map((b) => b.type).join(", "));
console.log("ui resource:", JSON.stringify(blocks.find((b) => b.type === "resource")?.resource ?? null));

await ctx.storageState({ path: `${OUT}/state.json` });
fs.writeFileSync(`${OUT}/session.json`, JSON.stringify({ token, graphId, email }, null, 2));
await browser.close();
console.log("DONE — state/session written to", OUT);
