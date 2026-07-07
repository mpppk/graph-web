// Drive MCP Inspector's Apps tab: connect over Streamable HTTP with a Bearer
// token, select the get_graph app, provide graph_id, "Open App", and confirm
// the /embed iframe (the read-only React Flow graph) renders. Screenshots go to
// OUT. Requires oauth-token.mjs to have written OUT/state.json + OUT/session.json.
//
// Env overrides (see oauth-token.mjs): OUT, PW, CHROMIUM.
// NOTE: open the Inspector at http://localhost:6274 (NOT 127.0.0.1) — otherwise
// the Inspector proxy rejects the request with "Invalid origin" (403).
import fs from "node:fs";
const PW = process.env.PW || "/opt/node22/lib/node_modules/playwright/index.js";
const pw = (await import(PW)).default;
const { chromium } = pw;

const OUT = process.env.OUT || "/tmp/mcp-verify";
const CHROMIUM =
	process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const INSPECTOR = process.env.INSPECTOR || "http://localhost:6274";
const MCP_URL = process.env.MCP_URL || "http://localhost:3000/api/mcp";
const { token, graphId } = JSON.parse(
	fs.readFileSync(`${OUT}/session.json`, "utf8"),
);

const browser = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await browser.newContext({
	viewport: { width: 1400, height: 900 },
	storageState: `${OUT}/state.json`,
});
const page = await ctx.newPage();
page.on("console", (m) => {
	const t = m.text();
	if (/embed|csp|Refused|blocked|denied|Content Security|frame-src/i.test(t))
		console.log("PAGE:", t.slice(0, 220));
});
await page.goto(INSPECTOR, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

// Connect: Streamable HTTP + Authorization header
await page.getByRole("combobox").first().click();
await page.waitForTimeout(400);
await page.getByRole("option", { name: /Streamable HTTP/i }).click();
await page.waitForTimeout(500);
await page.getByRole("textbox").first().fill(MCP_URL);
await page.getByRole("button", { name: /^Authentication/i }).click();
await page.waitForTimeout(400);
await page.locator('input[type="password"]').first().fill(`Bearer ${token}`);
await page.getByRole("switch").first().click(); // enable the Authorization header
await page.getByRole("button", { name: /^Connect$/i }).click();
await page.waitForTimeout(3500);

// Apps tab -> select the app -> provide input -> Open App
await page.getByRole("tab", { name: /^Apps/i }).first().click();
await page.waitForTimeout(1500);
await page.getByText("get_graph", { exact: true }).first().click();
await page.waitForTimeout(1500);
const backBtn = page.getByRole("button", { name: /Back to Input/i });
if (await backBtn.count()) {
	await backBtn.first().click();
	await page.waitForTimeout(800);
}
const gid = page.locator("#graph_id");
if (await gid.count()) await gid.fill(graphId);
else await page.locator("textarea, input[type=text]").last().fill(graphId);
await page.waitForTimeout(300);
for (const name of [/Render/i, /Open App/i, /Run/i, /Launch/i, /Submit/i]) {
	const b = page.getByRole("button", { name });
	if (await b.count()) { await b.first().click(); console.log("clicked", name.source); break; }
}
await page.waitForTimeout(6000);

const frames = page.frames().map((f) => f.url()).filter((u) => u && u !== "about:blank");
console.log("FRAMES:", JSON.stringify(frames));
console.log("has /embed frame:", frames.some((u) => u.includes("/embed/graphs/")));
await page.screenshot({ path: `${OUT}/apps-3-rendered.png` });
await browser.close();
console.log("DONE — screenshot at", `${OUT}/apps-3-rendered.png`);
