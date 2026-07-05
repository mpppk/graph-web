---
name: browser-verify
description: graph-webのUI変更をローカルdevサーバーで実際にブラウザ確認する手順。Test Plan実施（デスクトップ/モバイル/ダークモードの3条件確認、Gyazoアップロード）時に使う。
---

# browser-verify

## 手順

1. **準備**（初回・スキーマ変更後のみ）: `bun install && bun run db:migrate:local`
2. **devサーバー起動**: `bun run dev`（http://localhost:3000）
3. **Playwrightで操作**
   - Chromiumは `/opt/pw-browsers/chromium` にプリインストール済み。`playwright install` は不要
   - サインアップ（一意なメール例: `verify-${Date.now()}@example.com`）→ グラフ作成 → 検証対象の操作
4. **3条件でスクリーンショット**
   - デスクトップ: viewport 1280x800
   - モバイル: viewport 393x852。`scrollHeight === clientHeight` で意図しないスクロールがないことも確認
   - ダークモード: プロフィールメニューの切替、または `document.documentElement.classList.add('dark')`
   - バーチャルキーボード絡みは `docs/react-flow-notes.md` の visualViewport モック手順を使う
5. **Gyazo CLIでアップロード**（画像はリポジトリにコミットしない）し、結果をPR descriptionに記載
