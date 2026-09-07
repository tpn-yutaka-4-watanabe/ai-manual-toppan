# Azure App Service 設定手順

対象の App Service は `ai-manual-toppan` です。添付画像の構成どおり、Linux / Node.js 24 LTS を前提にしています。

このプロジェクトでは Deployment Center を使わず、リポジトリ内の GitHub Actions workflow からデプロイします。

## 1. Azure の環境変数を設定する

Azure Portal で次へ進みます。

```text
ai-manual-toppan
  -> 設定
  -> 環境変数
  -> アプリ設定
  -> 高度な編集
```

[azure-app-settings.sample.json](./azure-app-settings.sample.json) の内容を貼り付け、`<...>` を実値へ置き換えてください。

管理画面 `/admin` 用:

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

チャット画面 `/chats/seibu-sogo-sales-basic-rules` 用:

```text
SEIBU_SOGO_BRAIN_PROJECT_ID
SEIBU_SOGO_BRAIN_CONNECTION_NAME
SEIBU_SOGO_AUTH_USERNAME
SEIBU_SOGO_AUTH_PASSWORD
SEIBU_SOGO_AUTH_REALM
```

チャット画面 `/chats/toppan-generic-sales-handbook` 用:

```text
TOPPAN_GENERIC_BRAIN_PROJECT_ID
TOPPAN_GENERIC_BRAIN_CONNECTION_NAME
TOPPAN_GENERIC_AUTH_USERNAME
TOPPAN_GENERIC_AUTH_PASSWORD
TOPPAN_GENERIC_AUTH_REALM
```

保存時は、高度な編集画面の `OK` だけでなく、環境変数画面側の `適用` も押してください。

## 2. App Service のランタイムを確認する

Azure Portal で次を確認します。

```text
ランタイムスタック: Node
メジャーバージョン: 24 LTS
スタートアップコマンド: 空欄、または npm start
```

このリポジトリはルートの `package.json` に `start` を定義しているため、通常は空欄でも動きます。明示する場合は `npm start` です。

`SCM_DO_BUILD_DURING_DEPLOYMENT` は設定しません。GitHub Actions 側でビルド済みの状態にしてから App Service へ配置します。

## 3. GitHub に発行プロファイルを登録する

Azure Portal で App Service `ai-manual-toppan` を開き、上部の `発行プロファイルのダウンロード` から `.PublishSettings` ファイルを取得します。

ボタンが押せない場合は、次を確認します。

```text
設定
  -> 構成
  -> 全般設定
  -> SCM Basic Auth Publishing Credentials
  -> On
```

変更した場合は保存後に App Service を再起動し、もう一度 `発行プロファイルのダウンロード` を試してください。

次に GitHub リポジトリで以下へ進みます。

```text
Settings
  -> Secrets and variables
  -> Actions
  -> New repository secret
```

登録内容:

```text
Name:
AZURE_WEBAPP_PUBLISH_PROFILE

Secret:
ダウンロードした .PublishSettings ファイルの中身全体
```

この secret は GitHub Actions の `azure/webapps-deploy@v3` が App Service へデプロイするために使います。

発行プロファイルが組織ポリシーで使えない場合は、OIDC + managed identity 方式に切り替えます。その場合は GitHub 側に `AZURE_CLIENT_ID`、`AZURE_TENANT_ID`、`AZURE_SUBSCRIPTION_ID` を置き、workflowを `azure/login` 方式へ変更します。

## 4. GitHub へ push する

このフォルダで実行します。

```powershell
git add .
git commit -m "Build generic sales rules AI portal"
git push -u origin main
```

push 後、GitHub の `Actions` タブで `Deploy Azure App Service` が走ります。

## 5. デプロイ後に確認する

ヘルスチェック:

```text
https://ai-manual-toppan-gcc7eqfth2fbg8hb.japaneast-01.azurewebsites.net/api/health
```

管理画面:

```text
https://ai-manual-toppan-gcc7eqfth2fbg8hb.japaneast-01.azurewebsites.net/admin
```

チャット画面:

```text
https://ai-manual-toppan-gcc7eqfth2fbg8hb.japaneast-01.azurewebsites.net/chats/seibu-sogo-sales-basic-rules
https://ai-manual-toppan-gcc7eqfth2fbg8hb.japaneast-01.azurewebsites.net/chats/toppan-generic-sales-handbook
```

確認ポイント:

- `/admin` は `ADMIN_AUTH_USERNAME` / `ADMIN_AUTH_PASSWORD` で開ける
- `/chats/seibu-sogo-sales-basic-rules` は `SEIBU_SOGO_AUTH_USERNAME` / `SEIBU_SOGO_AUTH_PASSWORD` で開ける
- `/chats/toppan-generic-sales-handbook` は `TOPPAN_GENERIC_AUTH_USERNAME` / `TOPPAN_GENERIC_AUTH_PASSWORD` で開ける
- 管理画面の認証情報ではチャット画面を開けない
- チャット画面の認証情報では管理画面を開けない
- チャットで質問すると BrainAPI の回答が表示される

## 6. 参考

- Azure App Service の GitHub Actions デプロイ: https://learn.microsoft.com/en-us/azure/app-service/deploy-github-actions
- Node.js App Service の設定: https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs
- App Service のアプリ設定と高度な編集: https://learn.microsoft.com/en-us/azure/app-service/configure-common
