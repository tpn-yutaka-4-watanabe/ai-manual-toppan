# 販売基本ルールAI

1つのAzure App Service上で、複数の販売手帳AI/販売基本ルールAIを別URL・別認証で提供するアプリです。

管理画面から登録済みチャット一覧を開けます。管理画面と各チャット画面は、それぞれ別のBasic認証を環境変数で設定します。

## URL

```text
管理画面:
/admin

チャット画面:
/chats/seibu-sogo-sales-basic-rules
/chats/toppan-generic-sales-handbook
```

今回の初期チャット設定:

```text
タイトル: 西武・そごう 販売基本ルールAI
slug: seibu-sogo-sales-basic-rules
envPrefix: SEIBU_SOGO
```

旧形式の `/apps/<slug>` も互換入口として残しています。新しく案内するURLは `/chats/<slug>` を使います。

## 仕組み

```text
ブラウザ
  -> /admin                         管理用Basic認証
  -> /chats/<slug>                  チャット用Basic認証
  -> /api/handbooks/<slug>/...      チャット用Basic認証
  -> サーバー側でBrainAPIへ接続
```

Brain Project ID、Brain API Key、Basic認証パスワードはブラウザへ返さず、Gitにも保存しません。BrainAPIの接続先とAPIキーは全チャット共通、Project IDとBasic認証はチャット別に管理します。必須の環境変数が不足している場合、アプリは起動時に失敗します。設定ミスのまま認証なしで公開されることを避けるためです。

## 根拠ページ表示

LLMの回答末尾に `[page_65]` のようなページタグが含まれると、チャット画面はそのタグを本文から取り除き、代わりに根拠ページボタンとして表示します。

根拠ページボタンを押すと、該当ページだけを切り出した画像を同じアプリ内のポップアップで表示します。画像は該当チャットの認証付きAPIから読み込みます。

```text
/api/handbooks/seibu-sogo-sales-basic-rules/source-pages/page_65.png
```

タグとPDFページ・ページ画像の対応は `config/handbooks.json` の `source.pageTags` と `source.imageDir` で管理します。RAGに投入する疑似JSONにも `参照ページタグ` を持たせています。

## 主な環境変数

管理画面用:

```text
ADMIN_AUTH_USERNAME
ADMIN_AUTH_PASSWORD
ADMIN_AUTH_REALM
ADMIN_TITLE
```

全チャット共通のBrainAPI接続情報:

```text
BRAIN_BASE_URL
BRAIN_API_KEY
```

西武・そごう 販売基本ルールAI 用:

```text
SEIBU_SOGO_BRAIN_PROJECT_ID
SEIBU_SOGO_BRAIN_CONNECTION_NAME
SEIBU_SOGO_AUTH_USERNAME
SEIBU_SOGO_AUTH_PASSWORD
SEIBU_SOGO_AUTH_REALM
```

TOPPAN 汎用販売手帳AI 用:

```text
TOPPAN_GENERIC_BRAIN_PROJECT_ID
TOPPAN_GENERIC_BRAIN_CONNECTION_NAME
TOPPAN_GENERIC_AUTH_USERNAME
TOPPAN_GENERIC_AUTH_PASSWORD
TOPPAN_GENERIC_AUTH_REALM
```

複数ユーザーを許可したい場合は、`*_AUTH_USERNAME` / `*_AUTH_PASSWORD` の代わりに `*_AUTH_USERS_JSON` を使えます。

```text
ADMIN_AUTH_USERS_JSON=[{"username":"admin1","password":"password1"},{"username":"admin2","password":"password2"}]
SEIBU_SOGO_AUTH_USERS_JSON=[{"username":"user1","password":"password1"},{"username":"user2","password":"password2"}]
```

ローカル用サンプルは [.env.example](.env.example) を参照してください。Azure Portalの高度な編集へ貼るJSON形式のサンプルは [docs/azure-app-settings.sample.json](docs/azure-app-settings.sample.json) です。ただし実値を入れたファイルはコミットしないでください。

## ローカル実行

```powershell
Copy-Item .env.example .env.local
# .env.local の <...> を実値に変更
npm install
npm run build
npm start
```

開くURL:

```text
http://localhost:3001/admin
http://localhost:3001/chats/seibu-sogo-sales-basic-rules
```

開発中は次も使えます。

```powershell
npm run dev
```

## テスト

```powershell
npm test
```

テストでは、管理画面とチャット画面の認証分離、URL別認証、秘密情報の非公開、BrainAPI SSEプロキシ、根拠PDF/根拠ページ画像配信を確認します。実際のBrainAPIは呼びません。

## デプロイ

このリポジトリにはGitHub Actions workflowを入れます。

```text
.github/workflows/deploy-azure-app-service.yml
```

GitHubのrepository secretに `AZURE_WEBAPP_PUBLISH_PROFILE` を登録すると、`main` へpushした時にビルド、テスト、Azure App Serviceへのデプロイが実行されます。

Azure側の詳しい設定手順は [docs/AZURE_APP_SERVICE_SETUP.md](docs/AZURE_APP_SERVICE_SETUP.md) を参照してください。

## チャット追加

新しいチャットを追加するときは [docs/ADDING_CHAT_GUIDELINES.md](docs/ADDING_CHAT_GUIDELINES.md) を先に確認してください。

原則として、追加時に変更するのは `config/handbooks.json` とAzureの環境変数だけです。既存チャットに影響を出さないため、共有コードや既存の `slug` / `envPrefix` は変更しません。
