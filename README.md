# 販売手帳AI（Azure App Service）

旧 `aicomm-testUI` の販売手帳AIを切り出し、1つのAzure App Serviceから複数の販売手帳AIをURL別・認証別に提供するプロジェクトです。

既定のURLは次です。

```text
/apps/sogo-seibu-sales-handbook
```

## 仕組み

```text
ブラウザ
  └─ /apps/<slug>（パターン固有のBasic認証）
       └─ /api/handbooks/<slug>/chat/stream（同じ認証）
            └─ サーバーだけがAPIキーを付けてBrainAPIへ接続
```

- UI: React + Vite
- API: Node.js + Express + TypeScript
- BrainAPI: `/api/v1/prediction` のSSEストリーミング中継
- 設定: `config/handbooks.json` と接頭辞付き環境変数
- 認証: 販売手帳パターンごとのHTTP Basic認証

Brain Project ID、API Key、認証パスワードはブラウザへ返さず、Gitにも保存しません。必須設定が不足した場合は、認証なしで誤起動せずに起動を停止します。

## ローカル実行

```powershell
Copy-Item .env.example .env.local
# .env.local の <...> を実値へ変更
npm install
npm run build
npm start
```

次を開きます。

```text
http://localhost:3001/apps/sogo-seibu-sales-handbook
```

開発時は `npm run dev` も利用できます。Viteは `http://localhost:5173`、APIは `http://localhost:3001` です。画面HTMLを含む本番同等の認証確認は、`npm run build && npm start` で行ってください。

## テスト

```powershell
npm test
```

テストはビルドに加え、URL別認証の分離、秘密情報の非公開、BrainAPI SSE中継をローカルのモックサーバーで確認します。実際のBrainAPIは呼びません。

## Azureへの設定

実際のPortal操作、環境変数の高度な編集用JSON、GitHub連携、パターン追加方法は [Azure App Service 設定手順](docs/AZURE_APP_SERVICE_SETUP.md) を参照してください。

## 主な環境変数

`config/handbooks.json` の `envPrefix` が `SOGO_SEIBU` の場合、次を読み込みます。

| 必須 | 環境変数 |
| --- | --- |
| 必須 | `SOGO_SEIBU_BRAIN_BASE_URL` |
| 必須 | `SOGO_SEIBU_BRAIN_PROJECT_ID` |
| 必須 | `SOGO_SEIBU_BRAIN_API_KEY` |
| 必須 | `SOGO_SEIBU_AUTH_USERNAME` |
| 必須 | `SOGO_SEIBU_AUTH_PASSWORD` |
| 任意 | `SOGO_SEIBU_BRAIN_CONNECTION_NAME` |
| 任意 | `SOGO_SEIBU_AUTH_REALM` |
| 任意 | `SOGO_SEIBU_AUTH_USERS_JSON`（複数ユーザーの場合） |

各パターンで別の `envPrefix` を指定すると、URL・BrainAPI接続・認証情報をそれぞれ独立させられます。
