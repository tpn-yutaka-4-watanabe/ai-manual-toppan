# チャット追加ガイドライン

このアプリは、1つのAzure App Service上で複数の販売手帳AIを別URL・別認証で提供する構成です。BrainAPIの接続先とAPIキーは全チャット共通、Project IDと認証情報はチャット別です。新しいチャットを追加するときは、既存チャットの `slug`、`envPrefix`、チャット別環境変数、資料ファイルを変更しないでください。

## 基本方針

- 既存チャットの `slug` は変更しない。
- 既存チャットの `envPrefix` は変更しない。
- 共通の `BRAIN_BASE_URL` / `BRAIN_API_KEY` は、新しいチャット追加時に増やさない。
- 既存チャット用のProject IDと認証環境変数は変更しない。
- 追加するチャットだけに、新しい `slug` と `envPrefix` を割り当てる。
- GitにBrainAPIキー、Project ID、Basic認証パスワード、Azure発行プロファイルを保存しない。
- 根拠ページ表示を使う場合は、該当チャットの `source` だけを追加・変更する。

## 追加時に変更する場所

通常は次の2か所です。

```text
config/handbooks.json
Azure App Service の環境変数
```

根拠ページ表示を使う場合は、配信用のPDFとページ画像をリポジトリに含めます。

```text
output/pdf/任意の抜粋PDF.pdf
output/source-pages/<slug>/page_1.png
```

## 1. config/handbooks.json に追加する

例:

```json
{
  "slug": "new-sales-rules",
  "envPrefix": "NEW_SALES_RULES",
  "title": "新チャット 販売基本ルールAI",
  "assistantLabel": "新チャット 販売基本ルールAI",
  "inputPlaceholder": "販売基本ルールについて質問を入力してください",
  "initialMessage": "新チャット 販売基本ルールAIです。確認したいことを入力してください。",
  "source": {
    "label": "販売基本ルール 抜粋PDF",
    "pdfPath": "output/pdf/example.pdf",
    "imageDir": "output/source-pages/new-sales-rules",
    "pageTags": [
      { "tag": "page_1", "label": "p.1 参照ページ名", "sourcePage": 1, "pdfPage": 1 }
    ]
  }
}
```

`slug` はURLになります。

```text
/chats/new-sales-rules
```

`envPrefix` は環境変数名の接頭辞になります。

```text
NEW_SALES_RULES_BRAIN_PROJECT_ID
NEW_SALES_RULES_BRAIN_CONNECTION_NAME
NEW_SALES_RULES_AUTH_USERNAME
NEW_SALES_RULES_AUTH_PASSWORD
```

## 2. Azure App Service に環境変数を追加する

新しい `envPrefix` に対応する環境変数を追加します。

```text
NEW_SALES_RULES_BRAIN_PROJECT_ID
NEW_SALES_RULES_BRAIN_CONNECTION_NAME
NEW_SALES_RULES_AUTH_USERNAME
NEW_SALES_RULES_AUTH_PASSWORD
NEW_SALES_RULES_AUTH_REALM
```

次の2項目は全チャット共通です。通常、新しいチャットを追加するたびに設定する必要はありません。

```text
BRAIN_BASE_URL
BRAIN_API_KEY
```

複数ユーザーにしたい場合は、`NEW_SALES_RULES_AUTH_USERNAME` / `NEW_SALES_RULES_AUTH_PASSWORD` の代わりに次を使えます。

```text
NEW_SALES_RULES_AUTH_USERS_JSON=[{"username":"user1","password":"password1"},{"username":"user2","password":"password2"}]
```

## 3. 根拠ページ表示を使う場合

LLMの回答末尾に `[page_65]` のようなタグを出力させると、チャット画面側で根拠ページボタンに変換されます。ユーザーがボタンを押すと、該当ページだけを切り出した画像が同じアプリ内のポップアップで表示されます。

ページ画像は、`source.imageDir` に `page_65.png` のようなファイル名で配置します。

`config/handbooks.json` の `source.pageTags` には次を入れます。

- `tag`: LLMが回答末尾に出すタグ。例: `page_65`
- `label`: 画面に表示する根拠ページ名。例: `p.65 金券・小切手の取扱い方`
- `sourcePage`: 元PDF上のページ番号。
- `pdfPage`: 配信用に抜粋したPDF内のページ番号。

RAGに投入するMarkdownや疑似JSONにも、該当する `参照ページタグ` を持たせてください。LLMがページを特定できない場合、UIは根拠ページを表示できません。

## 4. 確認すること

追加後は次を確認します。

- `/admin` に新チャットが表示される。
- 新チャットのURLが専用ユーザーで開ける。
- 新チャットのユーザーでは既存チャットを開けない。
- 既存チャットのユーザーでは新チャットを開けない。
- 新チャットで質問して、BrainAPIから回答が返る。
- 回答末尾に `[page_XX]` が出る質問で、根拠ページボタンが表示される。
- 根拠ページボタンを押すと、同じアプリ内に該当ページ画像がポップアップ表示される。

## 避けること

`config/handbooks.json` の既存項目をコピーするときは、`slug` と `envPrefix` の変更漏れが一番危険です。重複したまま動かすと起動時に失敗します。これは意図した安全策で、別チャットのBrainAPIや認証情報を誤って使うことを避けるためです。

## 作業前後のチェック

作業前:

```powershell
git status --short
git diff -- config/handbooks.json
```

作業後:

```powershell
npm test
git diff -- config/handbooks.json
```
