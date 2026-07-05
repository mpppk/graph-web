---
name: browser-verify
description: graph-webのUI変更をローカルのdevサーバー上で実際にブラウザ確認するための定型手順。CLAUDE.mdが要求するTest Plan実施（デスクトップ/モバイル/ダークモードの3条件確認、Gyazoへのスクリーンショットアップロード）を行う際に使う。
---

# browser-verify

graph-webのPRでは、UI変更のたびに「devサーバー起動 → テストアカウント作成 → 検証用グラフ作成 → Playwrightで操作・スクリーンショット → Gyazoアップロード」という同じセットアップを毎回ゼロから組み立てているケースが多い。このスキルはその手順をまとめたものであり、都度の再発明を避けるために使う。

## 前提

* このリポジトリはCloudflare Workers向けなので、ローカルdevサーバーもwrangler経由のD1ローカルDBを使う。
* テストアカウントのサインアップ自体を自動化する公式スクリプトは現状ない。Playwrightからサインアップフォームを操作するか、`authClient.signUp.email({ email, password, name })`（`src/routes/login.tsx`が使っているのと同じAPI）をスクリプトから叩く。

## 手順

1. **依存関係とDBの準備**（初回、またはスキーマ変更後のみ）
   ```bash
   bun install
   bun run db:migrate:local
   ```

2. **devサーバー起動**（バックグラウンド）
   ```bash
   bun run dev
   ```
   `http://localhost:3000` で待ち受ける。

3. **Playwrightでの操作・検証**
   * Chromiumは `/opt/pw-browsers/chromium` にプリインストール済み。`playwright install` は不要。プロジェクトの `@playwright/test` バージョンが異なる場合は `executablePath: '/opt/pw-browsers/chromium'` を指定して起動する。
   * サインアップ（毎回一意なメールアドレスを使う。例: `verify-${Date.now()}@example.com`）→ ログイン → グラフ作成 → 検証対象の操作、の順で操作する。
   * ノードタイプ・メタデータなど検証したい状態は、UI操作 or 直接そのグラフのAPI/server fnsを呼んで用意する。

4. **3条件でのスクリーンショット取得**（CLAUDE.mdの「UI変更時の動作確認」参照）
   * デスクトップ幅（`page.setViewportSize({ width: 1280, height: 800 })`）
   * モバイル幅（`page.setViewportSize({ width: 393, height: 852 })`）。あわせて `document.documentElement.scrollHeight === document.documentElement.clientHeight` を確認し、意図しないスクロールが発生していないかチェックする。
   * ダークモード（プロフィールメニューのダークモード切替、または `document.documentElement.classList.add('dark')` を評価して確認）
   * モバイル + バーチャルキーボードが絡む変更の場合は、`docs/react-flow-notes.md` の「モバイルのバーチャルキーボード」の節にある `visualViewport` モック手順を使う。

5. **Gyazoへのアップロード**
   * 撮影したスクリーンショットはGyazo CLI経由でアップロードする（CLAUDE.md準拠）。画像ファイル自体はリポジトリにコミットしない。

6. **PRへの反映**
   * Test Planのチェックリストを実施結果で埋め、動作確認結果セクションにGyazo画像リンクを貼る（`pr-description` スキル参照）。
