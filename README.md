# 販売基本ルールAI

Azure App Service 上で、複数の販売基本ルールAIチャットを URL 別・認証別に提供するアプリです。

管理画面から登録済みチャットの一覧を開けます。管理画面と各チャット画面は、それぞれ別の Basic 認証を環境変数で設定します。

## URL

```text
管理画面:
/admin

チャット画面:
/chats/seibu-sogo-sales-basic-rules
```

今回の初期チャットは次の設定です。

```text
タイトル: 西部・そごう 販売基本ルールAI
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
  -> サーバーがBrainAPIへ接続
```

Brain Project ID、Brain API Key、Basic認証パスワードはブラウザへ返さず、Gitにも保存しません。

必須の環境変数が不足している場合、アプリは起動時に失敗します。設定ミスのまま認証なしで公開されることを避けるためです。

## 主な環境変数

管理画面用:

```text
ADMIN_AUTH_USERNAME
ADMIN_AUTH_PASSWORD
ADMIN_AUTH_REALM
ADMIN_TITLE
```

西部・そごう 販売基本ルールAI 用:

```text
SEIBU_SOGO_BRAIN_BASE_URL
SEIBU_SOGO_BRAIN_PROJECT_ID
SEIBU_SOGO_BRAIN_API_KEY
SEIBU_SOGO_BRAIN_CONNECTION_NAME
SEIBU_SOGO_AUTH_USERNAME
SEIBU_SOGO_AUTH_PASSWORD
SEIBU_SOGO_AUTH_REALM
```

Azure Portal の高度な編集へ貼るサンプルは [docs/azure-app-settings.example.json](docs/azure-app-settings.example.json) です。

複数ユーザーを許可したい場合は、`*_AUTH_USERNAME` / `*_AUTH_PASSWORD` の代わりに `*_AUTH_USERS_JSON` を使えます。

```text
ADMIN_AUTH_USERS_JSON=[{"username":"admin1","password":"password1"},{"username":"admin2","password":"password2"}]
SEIBU_SOGO_AUTH_USERS_JSON=[{"username":"user1","password":"password1"},{"username":"user2","password":"password2"}]
```

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

テストでは、管理画面とチャット画面の認証分離、URL別認証、秘密情報の非公開、BrainAPI SSEプロキシを確認します。実際のBrainAPIは呼びません。

## デプロイ

このリポジトリには GitHub Actions workflow を入れています。

```text
.github/workflows/deploy-azure-app-service.yml
```

GitHub の repository secret に `AZURE_WEBAPP_PUBLISH_PROFILE` を登録すると、`main` へ push したときにビルド、テスト、Azure App Service へのデプロイが実行されます。

Azure側の詳しい設定手順は [docs/AZURE_APP_SERVICE_SETUP.md](docs/AZURE_APP_SERVICE_SETUP.md) を参照してください。

## チャット追加

新しいチャットを追加するときは、[docs/ADDING_CHAT_GUIDELINES.md](docs/ADDING_CHAT_GUIDELINES.md) を先に確認してください。

原則として、追加時に変更するのは `config/handbooks.json` と Azure の環境変数だけです。既存チャットに影響を出さないため、共有コードや既存の `envPrefix` は変更しません。
