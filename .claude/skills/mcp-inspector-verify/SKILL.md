---
name: mcp-inspector-verify
description: graph-webのMCPサーバー（src/lib/mcp/ や src/routes/api/mcp.ts）変更時に、MCP InspectorでOAuth接続〜tools/list〜get_graph実行〜（UI変更なら）Appのライブ描画までを実機確認する手順とスクリプト。MCP関連のTest Plan実施時に使う。
---

# mcp-inspector-verify

MCP サーバーの変更を、実際の MCP クライアント（MCP Inspector）から OAuth 接続して確認する。同梱スクリプト（`scripts/`）で OAuth トークン取得〜ツール実行〜App 描画までを Playwright で自動化できる。

## 前提

- `.dev.vars` に `BETTER_AUTH_URL=http://localhost:3000`。
- 初回・スキーマ変更後は `bun install && bun run db:migrate:local`。
- **サーバー類は run_in_background で起動する**（`( … & )` サブシェル起動はこの環境で SIGKILL される）。

```bash
# dev サーバー（:3000）
bun run dev
# MCP Inspector（UI :6274 / proxy :6277）。cached bin 直起動が npx より安定
DANGEROUSLY_OMIT_AUTH=true MCP_AUTO_OPEN_ENABLED=false \
  node "$(npm root)/@modelcontextprotocol/inspector/client/bin/start.js"
# ↑ npx で入れた場合は ~/.npm/_npx/*/node_modules/@modelcontextprotocol/inspector/client/bin/start.js
```

## 自動確認（推奨）

```bash
# 1) サインアップ＋グラフseed＋OAuthトークン取得＋MCP直叩きで ui:// 返却を確認
#    state.json / session.json を OUT に出力
OUT=/tmp/mcp-verify node .claude/skills/mcp-inspector-verify/scripts/oauth-token.mjs
# 2) Inspector UI を駆動：Streamable HTTP＋Bearer で接続→Apps タブで get_graph を Open App
#    → /embed iframe 描画を確認、スクショを OUT に保存
OUT=/tmp/mcp-verify node .claude/skills/mcp-inspector-verify/scripts/inspector-apps.mjs
```

`inspector-apps.mjs` が `has /embed frame: true` を出せば App がライブ描画されている。`OUT/apps-3-rendered.png` にグラフが写る。

> Playwright と Chromium は web 実行環境固有パスを使う。既定は `PW=/opt/node22/lib/node_modules/playwright/index.js` と `CHROMIUM=/opt/pw-browsers/chromium-*/chrome-linux/chrome`。別環境では env で上書きするか `bunx playwright` に置き換える。

## 手動でやる場合の勘所

- **ブラウザは `http://localhost:6274` で開く**（`127.0.0.1:6274` だと Inspector proxy が "Invalid origin" 403）。
- Inspector 左ペイン: Transport=**Streamable HTTP**、URL=`http://localhost:3000/api/mcp`、Authentication → Custom Headers に `Authorization` / 値 `Bearer <token>` を入れ**トグル ON** → Connect。
- OAuth トークンは `oauth-token.mjs` の流れ: Discovery(`/.well-known/oauth-authorization-server`) → DCR(`/api/auth/mcp/register`, `token_endpoint_auth_method: none`) → authorize(PKCE S256、ログイン済みなら consent 自動) → token(`/api/auth/mcp/token`)。
- **App をライブ描画させるには、tool 宣言に `_meta.ui.resourceUri` が必要**（無いと Inspector の Apps タブに出ない）。Apps タブ → app 選択 → 入力(graph_id) → **Open App**。
- `ui://` リソースのブリッジ HTML が host からデータを受け取るには、`ui/initialize` に **`protocolVersion` と `appInfo` が必須**（欠けると host が `ui/notifications/tool-result` を送らず、App が「読み込み中」で止まる）。

## 証跡

スクショは **Gyazo に curl API でアップ**（CLI は proxy 経由で socket 失敗する）:

```bash
curl -sS -X POST https://upload.gyazo.com/api/upload \
  -F "access_token=$GYAZO_ACCESS_TOKEN" -F "imagedata=@OUT/apps-3-rendered.png"
```

得た URL を PR description の「動作確認結果」に記載する（画像はリポジトリにコミットしない）。
