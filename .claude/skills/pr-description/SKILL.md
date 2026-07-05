---
name: pr-description
description: graph-webのPR description（実装プラン・Test Plan・動作確認結果）のテンプレート。PRを作成・更新するときに使う。
---

# pr-description

以下の構成でPR本文を書く。

```markdown
## 概要

変更内容とその理由を2〜4行で。

<details>
<summary>実装プラン</summary>

（合意した実装プラン。対象ファイル、設計判断、既知の制約）

</details>

## Test Plan

- [ ] `bun run typecheck` / `bun run check` / `bun run build` / `bun run test`
- [ ] 手動確認手順（何を操作して何が起きればOKか）

## 動作確認結果

| 確認項目 | 結果 |
| --- | --- |
| デスクトップ / モバイル / ダークモード | [screenshot](https://gyazo.com/...) ✅ |
```

## 注意点

* Test Planは実施済みの状態（チェック入り）で載せる。ブラウザ確認は実際に行う（`browser-verify` スキル参照）
* DBスキーマ変更を含む場合は `db:migrate:remote` / `db:migrate:preview` が必要な旨を明記
* スクリーンショットはGyazoリンクで貼り、画像はリポジトリにコミットしない
