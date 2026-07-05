# Runtime
* このWebアプリケーションは、Cloudflare Workersにデプロイします。そのため、ランタイムはNode.jsではないことに注意してください。
* ローカルでのタスクランナーにはBunを使用してください。

# 開発コマンド

* マージ前チェック（CIと同一）: `bun run typecheck` / `bun run check` / `bun run build` / `bun run test`
* ローカルDB: 初回・スキーマ変更後は `bun run db:migrate:local` してから `bun run dev`
* OAuth/MCPをローカル検証する場合は `.dev.vars` に `BETTER_AUTH_URL=http://localhost:3000` を設定

# 開発時の注意点

## 実装プランの作成

プランの作成時は、検討が必要な項目を徹底的に洗い出し、曖昧性が完全に排除されるまでユーザに質問・確認を行なってください。

## UI変更時の動作確認

必ず3条件で確認する:

* デスクトップ幅（1280x800）
* モバイル幅（393x852）。意図しないスクロールがないか（`scrollHeight === clientHeight`）も確認
* ダークモード

## React Flow (@xyflow/react)

グラフキャンバスを触る前に `docs/react-flow-notes.md` を読むこと。新しく踏んだ落とし穴は同ファイルに追記する。

## DBスキーマ変更を含むPR

* マイグレーションは `drizzle/` に連番SQLで追加。better-auth関連はbetter-authのスキーマ定義と突合する。
* デプロイ前に `bun run db:migrate:remote` / `db:migrate:preview` の適用が必要な場合、PRのdescriptionに明記する。

## PRの作成

* PRには実装プランの内容をdetailsタグで記載してください。
* PRにはTest Planを記載してください。Test Planには、手動での動作確認の手順を記載してください。その後、実際にブラウザで動作確認を行なってください。
* ブラウザでの動作確認中はスクリーンショットを適宜撮影し、Gyazo CLI経由でアップロードしてください。画像はリポジトリにコミットしないでください。
* 動作確認の完了後は、結果をPRのdescriptionに追記してください。結果には撮影したスクリーンショットのGyazo画像を記載してください。
