---
name: mcp-inspector-verify
description: graph-webのMCPサーバー（src/lib/mcp/ や src/routes/api/mcp.ts）変更時に、MCP InspectorでOAuth接続〜tools/list〜get_graph実行〜（UI変更なら）Appのライブ描画までを実機確認する手順。MCP関連のTest Plan実施時に使う。
---

# mcp-inspector-verify

MCP サーバーの変更を、実際の MCP クライアント（MCP Inspector）から OAuth 接続して確認する。ブラウザ操作は Playwright で行う（都度その場で操作すればよく、専用の検証スクリプトを作る必要はない）。

## 前提・起動

- `.dev.vars` に `BETTER_AUTH_URL=http://localhost:3000`。初回・スキーマ変更後は `bun install && bun run db:migrate:local`。
- **サーバー類は run_in_background で起動する**（`( … & )` サブシェル起動はこの環境で SIGKILL される）。
  - dev サーバー: `bun run dev`（:3000）。
  - MCP Inspector: `DANGEROUSLY_OMIT_AUTH=true MCP_AUTO_OPEN_ENABLED=false node <inspector>/client/bin/start.js`（UI :6274 / proxy :6277）。npx で入れた実体は `~/.npm/_npx/*/node_modules/@modelcontextprotocol/inspector/client/bin/start.js`。cached bin 直起動が npx 経由より安定。
- Playwright / Chromium は web 実行環境のグローバルを使う（`bunx playwright` か `/opt/pw-browsers/chromium-*/chrome-linux/chrome`）。`playwright install` は不要。

## 手順（Playwright でブラウザ操作）

1. **サインアップ**して dev サーバーの Cookie セッションを作る（App の `/embed` iframe はこの Cookie で認証される）。グラフを作成し、必要ならノード/エッジを `wrangler d1 execute DB --local` で投入。
2. **OAuth 2.1 で Bearer トークンを取得**（同一ブラウザコンテキストで）:
   - Discovery: `GET /.well-known/oauth-authorization-server`。
   - DCR: `POST /api/auth/mcp/register`（`token_endpoint_auth_method: "none"`、`redirect_uris` を登録）。
   - authorize: `GET /api/auth/mcp/authorize`（PKCE `S256`）。ログイン済みなので consent を承認 → `redirect_uri?code=...`。
   - token: `POST /api/auth/mcp/token`（`grant_type=authorization_code` ＋ `code_verifier`）→ `access_token`。
   - （任意）`POST /api/mcp` に `Authorization: Bearer <token>` で `tools/list` / `tools/call get_graph` を叩き、`ui://` リソース返却を先に確認しておくと切り分けが早い。
3. **Inspector UI を操作**（ブラウザは **`http://localhost:6274`** で開く。`127.0.0.1:6274` だと proxy が "Invalid origin" 403）:
   - Transport=**Streamable HTTP**、URL=`http://localhost:3000/api/mcp`。
   - Authentication → Custom Headers に `Authorization` / 値 `Bearer <token>` を入れ**トグル ON** → Connect。
   - **Tools タブ**: `tools/list` に対象ツールが出ること、実行して `Tool Result: Success` を確認。
   - **Apps タブ**（UI 変更時）: ツールに `_meta.ui.resourceUri` があれば App として現れる。選択 → 入力（例 `graph_id`）→ **Open App** で App がライブ描画。成功判定は `page.frames()` に `/embed/graphs/...` が現れること（＝内側 iframe が描画）。

## ハマりどころ

- **App がライブ描画されるには、ツール宣言に `_meta.ui.resourceUri` が必要**（無いと Inspector の Apps タブに出ない）。tool 結果に mcp-ui リソースを同梱するだけでは Apps タブは描画しない。
- `ui://` リソースのブリッジ HTML が host からデータを受け取るには、`ui/initialize` に **`protocolVersion` と `appInfo` が必須**（欠けると host が `ui/notifications/tool-input` / `tool-result` を送らず、App が「読み込み中」で止まる）。graph id はこの tool-input/tool-result から取得する。

## 証跡

スクショは **Gyazo に curl API でアップ**（CLI は proxy 経由で socket 失敗する）:

```bash
curl -sS -X POST https://upload.gyazo.com/api/upload \
  -F "access_token=$GYAZO_ACCESS_TOKEN" -F "imagedata=@shot.png"
```

得た URL を PR description の「動作確認結果」に記載する（画像はリポジトリにコミットしない）。
