# MCPサーバー対応 検討資料

グラフ一覧の取得・グラフ編集・ノード情報の取得/編集などを、MCP (Model Context Protocol) 経由で
外部のAIクライアント (Claude Code / Claude Desktop など) から操作できるようにするための検討資料。

## 決定事項

| 項目 | 決定内容 |
| --- | --- |
| 認証方式 | better-auth の MCP プラグイン (OAuth 2.1) |
| 初期スコープ | 読み取り + 基本編集(ノード/エッジ/メタデータのCRUD、グラフ名・説明の更新)。グラフ削除・ノードタイプ管理・テンプレート管理は初期スコープ外 |
| デプロイ形態 | 既存Workerに `/api/mcp` エンドポイントを追加(別Workerには分けない) |

## 背景と現状整理

- 本アプリは TanStack Start 製で Cloudflare Workers にデプロイされ、DBは D1 (Drizzle ORM)。
- ビジネスロジックは `src/lib/graph-server-fns.ts` の server function 群(約45個)に集約されている。
- 認証は better-auth (メール+パスワード、organization/teams プラグイン)。認可は
  `assertGraphAccess` / `assertOrgAccess` / `assertTeamAccess` で行っているが、いずれも
  `getRequest().headers` からセッションCookieを読む前提になっている。
- MCPクライアントはブラウザのセッションCookieを持たないため、**Cookie非依存の認証経路と、
  userId を明示的に受け取る認可ロジック**が必要になる。

## アーキテクチャ方針

```
MCPクライアント (Claude Code / Desktop)
        │  Streamable HTTP + OAuth 2.1 Bearer token
        ▼
/api/mcp (TanStack Start server route)
        │  better-auth MCPプラグインでトークン → userId 解決
        ▼
MCPツール定義 (src/lib/mcp/tools.ts)
        │  userId を引数に渡す
        ▼
サービス層 (src/lib/graph-service.ts) ← server fns からも同じ関数を呼ぶ
        │
        ▼
D1 (Drizzle)
```

### 1. サービス層の抽出(前提リファクタ)

MCPツールとWeb UI (server fns) でロジックを二重実装すると確実に乖離するため、
認証非依存のサービス層を抽出する。

- `src/lib/graph-service.ts` (仮) を新設し、`userId: string` を明示的に受け取る純粋な関数群として
  グラフ/ノード/エッジ/メタデータ操作を移動する。
- `assertGraphAccess` 等の認可ヘルパーも `userId` 引数版に変更する。
  ただし `assertOrgAccess` は現在 `auth.api.getFullOrganization` に **リクエストヘッダーを渡して**
  org メンバーシップを確認しているため、ヘッダー非依存の実装
  (better-auth の member テーブルを直接クエリする等)への置き換えが必要。
- 既存の server fns はサービス層を呼ぶ薄いラッパーに書き換える(挙動変更なし)。
- このリファクタは単独PRとして先行させ、既存テストと手動確認で挙動不変を担保する。

### 2. 認証: better-auth MCP プラグイン (OAuth 2.1)

- better-auth の `mcp` プラグインを `src/lib/auth.ts` に追加する。これによりアプリ自体が
  OAuth 認可サーバーとなり、以下が提供される:
  - `/.well-known/oauth-authorization-server` などのディスカバリーメタデータ
  - 認可エンドポイント(既存のログインページに誘導する `loginPage` 設定)
  - Dynamic Client Registration(MCPクライアントが自動登録できる)
- `/api/mcp` ハンドラー側では、プラグインが提供するヘルパー(`withMcpAuth` 相当)で
  Bearer トークンからセッション(userId)を解決し、認証失敗時は 401 +
  `WWW-Authenticate` ヘッダーを返す(MCP仕様のOAuthフロー起動に必要)。
- 認可はサービス層の `assertGraphAccess(graphId, userId)` をそのまま通すため、
  **Web UIとMCPでアクセス可能範囲が完全に一致する**(org/teamの権限モデルを二重管理しない)。
- OAuth用テーブル(client / accessToken 等)が追加されるため、D1マイグレーションが発生する。

確認事項(実装プラン作成時に要検証):

- 現行 better-auth 1.5.x での `mcp` プラグインのAPI(`withMcpAuth` のシグネチャ、
  Dynamic Client Registration の対応状況)。
- Claude Code / Claude Desktop からの実際の接続手順(リモートMCPサーバー登録 → OAuth同意画面)。

### 3. トランスポート: Streamable HTTP(ステートレス)

- エンドポイントは `/api/mcp` 1本。TanStack Start の server route として実装する。
- セッションレス(リクエストごとに独立)の Streamable HTTP とし、SSE専用の旧トランスポートは
  サポートしない。Workers上でステートフルにするには Durable Objects
  (Cloudflare `agents` パッケージの McpAgent)が必要になるが、本ユースケース
  (ツール呼び出しのみ、サーバー発イベントなし)では不要。
- 実装ライブラリの選定は実装プラン時の検証事項:
  - 公式 `@modelcontextprotocol/sdk` の `StreamableHTTPServerTransport` は Node の
    http型に依存するため、fetchベースの Workers では変換層が必要。
  - fetch ネイティブなアダプター(例: `@hono/mcp` の StreamableHTTPTransport)を
    公式SDKの `McpServer` と組み合わせる構成が有力候補。
  - いずれも Workers ランタイム(nodejs_compat)で実際に動くことを最初に検証する。

### 4. ツール設計(初期スコープ)

LLMクライアントの使いやすさ(往復回数・トークン効率)を優先し、読み取りは粗い粒度、
書き込みはバッチ対応の設計とする。入力スキーマは zod(既存依存)で定義する。

読み取り:

| ツール | 内容 |
| --- | --- |
| `list_graphs` | アクセス可能なグラフ一覧(個人 + 所属org/teamのグラフ。id/name/description/所属) |
| `get_graph` | グラフ1件の全体像: グラフ情報 + 全ノード(label/type/座標) + 全エッジ + ノードメタデータ。大規模グラフ向けに `include_metadata` 等のオプションを検討 |
| `get_node` | ノード1件の詳細(メタデータ含む) |

書き込み:

| ツール | 内容 |
| --- | --- |
| `update_graph` | グラフの name / description 更新 |
| `create_nodes` | ノードの一括作成(label / nodeType / 座標任意。座標未指定時の配置ルールを実装時に決定) |
| `update_node` | ノードの label / nodeType / 座標の更新 |
| `delete_nodes` | ノードの一括削除(edges/metadataはDBのcascadeで削除) |
| `create_edges` | エッジの一括作成 |
| `update_edge` | エッジの label 更新 |
| `delete_edges` | エッジの一括削除 |
| `set_node_metadata` | ノードメタデータの upsert / 削除(key単位、valueType対応) |

初期スコープ外(第2弾以降): `create_graph` / `delete_graph`、ノードタイプのCRUD、
テンプレート管理、Mermaidエクスポート。

設計上の注意:

- `nodeType` の指定は名前ベースにする(IDはスコープ解決が複雑でLLMが扱いにくい)。
  存在しないタイプ名はエラーにするか作成するかを実装時に決定。
- ノードタイプにフィールドテンプレートがあるため、`update_node` でタイプ変更した際に
  Web UIと同じテンプレート適用(`setNodeTypeWithTemplate` 相当)を通すかを実装時に決定。
- 書き込み系ツールは `destructiveHint` 等のツールアノテーションを適切に付与する。

## 実装フェーズ案

1. **フェーズ0(リファクタ)**: サービス層抽出 + 認可ヘルパーの userId 引数化。挙動変更なし。
2. **フェーズ1(貫通確認)**: better-auth MCPプラグイン導入 + `/api/mcp` +
   `list_graphs` / `get_graph` の2ツールのみ。MCP Inspector と Claude Code で
   OAuthフロー〜ツール呼び出しまでをローカル (wrangler dev) / preview環境で確認。
3. **フェーズ2(編集ツール)**: 書き込み系ツールを追加。サービス層のユニットテスト
   (vitest) と、Claude Code から実グラフを編集するE2E的な手動確認。
4. **フェーズ3(運用整備・必要に応じて)**: レート制限、監査ログ、トークン失効UI。

各フェーズを独立したPRとして進める。

## リスク・未決事項

- **better-auth MCPプラグインの成熟度**: バージョン互換・Dynamic Client Registration の
  挙動はフェーズ1冒頭で実機検証する。問題があれば代替として generic OAuth Provider
  プラグイン + 手動クライアント登録、最終手段としてAPIキー方式に切り替え可能な構成にしておく。
- **Workers上でのMCP SDK動作**: トランスポートの互換性(上記3)はフェーズ1で最初に検証。
- **大規模グラフのレスポンスサイズ**: `get_graph` が巨大になる場合のページング/フィルタは
  実測してから判断。
- **同時編集の整合性**: Web UIとMCPからの同時編集は最後の書き込みが勝つ(現状のWeb UIと同じ)。
  楽観ロック等は初期スコープでは導入しない。
- **課金/悪用対策**: OAuthで認証済みユーザーのみアクセス可能だが、レート制限は
  フェーズ3で検討(Cloudflare Rate Limiting バインディング等)。
