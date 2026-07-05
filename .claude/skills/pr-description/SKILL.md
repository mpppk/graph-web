---
name: pr-description
description: graph-webのCLAUDE.mdが定めるPR description構成（実装プラン・Test Plan・動作確認結果）に沿ってPR本文を組み立てる際に使う。graph-webでPRを作成・更新するときに使う。
---

# pr-description

graph-webのPRは、CLAUDE.mdの「PRの作成」節に従い、以下の構成で書く。過去のPRごとに体裁が微妙にばらついているため、このスキルをテンプレートとして使う。

## 構成

```markdown
# <タイトル: 変更内容が一目でわかる日本語 or feat(scope): 形式>

## Summary / 概要

変更内容と、それがなぜ必要かを2〜4行程度で。

<details>
<summary>実装プラン</summary>

（ユーザーと合意した実装プランの内容をそのまま、または要約して記載。
 対象ファイル一覧、設計上の判断とその理由、既知の制約があれば明記する）

</details>

## Test Plan

- [ ] `bun run typecheck`
- [ ] `bun run check`
- [ ] `bun run build`
- [ ] `bun run test`
- [ ] （手動確認手順を箇条書きで。何を操作して何が起きればOKかを具体的に書く）

DBスキーマ変更を含む場合は、デプロイ前に `bun run db:migrate:remote` / `bun run db:migrate:preview` の適用が必要な旨をここに明記する。

## 動作確認結果

（`browser-verify` スキルで実施した結果。確認項目とGyazo画像リンクを表形式または箇条書きで）

| 確認項目 | 結果 |
| --- | --- |
| デスクトップ表示 | [screenshot](https://gyazo.com/...) ✅ |
| モバイル表示 | [screenshot](https://gyazo.com/...) ✅ |
| ダークモード | [screenshot](https://gyazo.com/...) ✅ |
```

## 注意点

* 「実装プラン」は必ず `<details>` タグで折りたたむ（CLAUDE.md準拠）。
* Test Planは「実施予定の手順」ではなく「実際に実施し、結果チェックが入った状態」でPRに載せる。ブラウザでの動作確認は自己申告で済ませず、実際に行う。
* スクリーンショットはGyazo CLI経由でアップロードしたリンクを貼る。画像ファイルをリポジトリにコミットしない。
* 破壊的操作（削除系ツール・マイグレーション等）を含む場合は、冪等性や認可（他人のリソースを操作できないか）の確認結果も動作確認結果に含める。
