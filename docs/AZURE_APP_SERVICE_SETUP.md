# Azure App Service 設定手順

対象は、添付画面の Linux App Service `ai-manual-toppan`（Node.js 24 LTS）です。GitHubとAzure Portalの操作は以下の順序で行います。

## 1. GitHubへ初回push

このフォルダで次を実行します。GitHub上のリポジトリは作成済みで空なので、`main` をそのまま初回pushできます。

```powershell
git add .
git commit -m "Implement multi-tenant sales handbook AI"
git push -u origin main
```

APIキーやパスワードを含む `.env.local` は `.gitignore` 対象です。Gitへ追加しないでください。

## 2. 環境変数を高度な編集で設定

Azure Portalで次へ進みます。

1. `ai-manual-toppan`
2. `設定` → `環境変数`
3. `アプリ設定` → `高度な編集`
4. [azure-app-settings.example.json](./azure-app-settings.example.json) のJSONを貼り付ける
5. `<...>` の3か所以上（Project ID、API Key、ユーザー名、パスワード）を実値へ置き換える
6. `OK` → `適用`

設定を適用するとApp Serviceが再起動します。`PORT` はApp Serviceが自動で渡すため追加しません。

### 既定のそごう西武パターンで必要な値

| 環境変数 | 用途 |
| --- | --- |
| `SOGO_SEIBU_BRAIN_BASE_URL` | BrainAPIのベースURL |
| `SOGO_SEIBU_BRAIN_PROJECT_ID` | Brain Project ID |
| `SOGO_SEIBU_BRAIN_API_KEY` | Brain API Key（秘密） |
| `SOGO_SEIBU_BRAIN_CONNECTION_NAME` | 画面に表示する接続名（任意） |
| `SOGO_SEIBU_AUTH_USERNAME` | このURL専用のBasic認証ユーザー名 |
| `SOGO_SEIBU_AUTH_PASSWORD` | このURL専用のBasic認証パスワード（秘密） |
| `SOGO_SEIBU_AUTH_REALM` | ブラウザの認証ダイアログ名（任意、ASCII文字を推奨） |

複数ユーザーを許可する場合は、`SOGO_SEIBU_AUTH_USERNAME` と `SOGO_SEIBU_AUTH_PASSWORD` の代わりに次を1つ設定できます。

```text
SOGO_SEIBU_AUTH_USERS_JSON=[{"username":"user1","password":"password1"},{"username":"user2","password":"password2"}]
```

## 3. GitHub連携を設定

Azure Portalで次へ進みます。

1. `デプロイ` → `デプロイ センター`
2. ソースに `GitHub` を選択
3. 組織 `tpn-yutaka-4-watanabe`
4. リポジトリ `ai-manual-toppan`
5. ブランチ `main`
6. 認証方式は、選択できる場合は `ユーザー割り当てマネージドID` を選択
7. `保存`

Deployment Centerが `.github/workflows/` にワークフローを作成し、push時にビルドとデプロイを行います。ワークフロー内で `npm install` と `npm run build` が実行され、デプロイ対象に `client/dist`、`server/dist`、実行用 `node_modules` が含まれることを確認してください。この構成ではGitHub Actions側でビルドするため、`SCM_DO_BUILD_DURING_DEPLOYMENT` は設定しません。

App Serviceの `設定` → `構成` → `スタック設定` では次を確認します。

- スタック: Node
- メジャーバージョン: 24 LTS
- スタートアップコマンド: 空欄、または `npm start`

ルート `package.json` に `start` スクリプトがあるため、通常は空欄で動作します。

## 4. デプロイ後の確認

1. `https://<App Serviceの既定ドメイン>/api/health` が `200` と `"ok": true` を返す
2. `https://<App Serviceの既定ドメイン>/apps/sogo-seibu-sales-handbook` を開く
3. 認証ダイアログで `SOGO_SEIBU_AUTH_USERNAME` / `SOGO_SEIBU_AUTH_PASSWORD` を入力する
4. 質問を送信し、BrainAPIの回答がストリーミング表示される
5. 不正な資格情報では `401` になる

必要に応じて `監視` → `正常性チェック` のパスへ `/api/health` を設定できます。このエンドポイントだけはBasic認証なしで稼働状態を返します。

起動しない場合は `監視` → `ログ ストリーム` を開きます。必須環境変数が不足している場合、アプリは意図的に起動せず、不足した変数名をログへ表示します。秘密の値自体は表示しません。

## 5. 販売手帳パターンを追加

例として、URL `/apps/toppan-sales-handbook` を追加します。

### Git側

`config/handbooks.json` の配列に追加します。

```json
{
  "slug": "toppan-sales-handbook",
  "envPrefix": "TOPPAN",
  "title": "TOPPAN販売手帳AI",
  "assistantLabel": "TOPPAN販売手帳AI",
  "inputPlaceholder": "販売手帳について質問を入力",
  "initialMessage": "TOPPAN販売手帳AIです。確認したいことを入力してください。"
}
```

### Azure側

高度な編集で、同じ接頭辞の設定を追加します。

```json
{
  "name": "TOPPAN_BRAIN_BASE_URL",
  "value": "https://uat.brain.metaclone.jp",
  "slotSetting": false
},
{
  "name": "TOPPAN_BRAIN_PROJECT_ID",
  "value": "<このパターンのProject ID>",
  "slotSetting": false
},
{
  "name": "TOPPAN_BRAIN_API_KEY",
  "value": "<このパターンのAPI Key>",
  "slotSetting": false
},
{
  "name": "TOPPAN_AUTH_USERNAME",
  "value": "<このパターンのユーザー名>",
  "slotSetting": false
},
{
  "name": "TOPPAN_AUTH_PASSWORD",
  "value": "<このパターンのパスワード>",
  "slotSetting": false
}
```

`envPrefix` が環境変数名の接頭辞です。パターンごとに別の接頭辞を使うことで、BrainAPI接続と認証情報を完全に分離します。

## 6. Gitを変更せず定義一覧を差し替える方法（任意）

`HANDBOOK_APPS_JSON` を設定すると、`config/handbooks.json` の代わりにそのJSON配列を読み込みます。秘密情報は含めず、`slug`、`envPrefix`、画面文言だけを入れてください。BrainAPIと認証の値は引き続き接頭辞付きの別環境変数へ設定します。

トップページに設定済みアプリのリンクを表示したい場合だけ、`HANDBOOK_INDEX_ENABLED=true` にします。既定値は一覧を公開しない `false` です。
