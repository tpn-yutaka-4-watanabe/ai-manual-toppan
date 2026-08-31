# チャット追加ガイドライン

新しいチャットを追加するときは、既存チャットの定義と環境変数を変更せず、新しい `slug` と `envPrefix` を追加します。

## 原則

- 既存の `slug` は変更しない
- 既存の `envPrefix` は変更しない
- 既存チャットの BrainAPI 環境変数は変更しない
- 共有コードは、追加だけで済む場合は変更しない
- Gitに Project ID、API Key、Basic認証パスワードを保存しない

## 追加時に変更する場所

通常はこの2か所だけです。

```text
config/handbooks.json
Azure App Service の環境変数
```

## 1. config/handbooks.json に追加する

例:

```json
{
  "slug": "new-sales-rules",
  "envPrefix": "NEW_SALES_RULES",
  "title": "新チャット 販売基本ルールAI",
  "assistantLabel": "新チャット 販売基本ルールAI",
  "inputPlaceholder": "販売基本ルールについて質問を入力",
  "initialMessage": "新チャット 販売基本ルールAIです。確認したいことを入力してください。"
}
```

`slug` はURLになります。

```text
/chats/new-sales-rules
```

`envPrefix` は環境変数名の接頭辞になります。

```text
NEW_SALES_RULES_BRAIN_BASE_URL
NEW_SALES_RULES_BRAIN_PROJECT_ID
NEW_SALES_RULES_BRAIN_API_KEY
NEW_SALES_RULES_AUTH_USERNAME
NEW_SALES_RULES_AUTH_PASSWORD
```

## 2. Azure App Service に環境変数を追加する

新しい `envPrefix` に対応する環境変数を追加します。

```text
NEW_SALES_RULES_BRAIN_BASE_URL
NEW_SALES_RULES_BRAIN_PROJECT_ID
NEW_SALES_RULES_BRAIN_API_KEY
NEW_SALES_RULES_BRAIN_CONNECTION_NAME
NEW_SALES_RULES_AUTH_USERNAME
NEW_SALES_RULES_AUTH_PASSWORD
NEW_SALES_RULES_AUTH_REALM
```

複数ユーザーにしたい場合は、`NEW_SALES_RULES_AUTH_USERNAME` / `NEW_SALES_RULES_AUTH_PASSWORD` の代わりに次を使います。

```text
NEW_SALES_RULES_AUTH_USERS_JSON=[{"username":"user1","password":"password1"},{"username":"user2","password":"password2"}]
```

## 3. 確認すること

追加後は以下を確認します。

- `/admin` に新チャットが表示される
- 新チャットのURLが専用ユーザーで開ける
- 新チャットのユーザーでは既存チャットを開けない
- 既存チャットのユーザーでは新チャットを開けない
- 既存チャットで質問して、以前どおり回答が返る

## 避けること

`config/handbooks.json` の既存項目をコピーするとき、`slug` と `envPrefix` の変更漏れが一番危険です。

特に `envPrefix` が重複すると起動時に失敗します。これは意図した安全策です。重複したまま動かして、別チャットのBrainAPIや認証情報を誤って使うことを避けるためです。

## 変更前チェック

作業前に以下を控えておくと戻しやすくなります。

```powershell
git status --short
git diff -- config/handbooks.json
```

作業後は以下を実行します。

```powershell
npm test
git diff -- config/handbooks.json docs/azure-app-settings.example.json
```
