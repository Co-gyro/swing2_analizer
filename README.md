# Cast Analyzer Proxy Server

バックエンドプロキシサーバー - M-Tracer APIのCORS問題を解決するためのNode.js/Expressサーバー

## 機能

- M-Tracer APIへのプロキシリクエスト
- CORS対応
- UID暗号化エンドポイント
- スイングリスト取得
- スイング詳細取得

## セットアップ

### 1. 依存関係のインストール

```bash
cd server
npm install
```

### 2. サーバーの起動

**開発環境（自動再起動）:**
```bash
npm run dev
```

**本番環境:**
```bash
npm start
```

サーバーは `http://localhost:3001` で起動します。

## エンドポイント

### ヘルスチェック
```
GET /health
```

レスポンス:
```json
{
  "status": "ok",
  "message": "Proxy server is running"
}
```

### UID暗号化
```
POST /api/encrypt
```

リクエストボディ:
```json
{
  "uid": "2903c1cce6084be392647e9a9b4bdd5b"
}
```

レスポンス:
```json
{
  "encrypted_uid": "暗号化されたUID文字列"
}
```

### スイングリスト取得
```
GET /api/swing_list/:encryptedUID
```

パラメータ:
- `encryptedUID`: 暗号化されたユーザーID

レスポンス: スイングリストのJSON配列

### スイング詳細取得
```
GET /api/swing_detail/:encryptedUID/:swingId
```

パラメータ:
- `encryptedUID`: 暗号化されたユーザーID
- `swingId`: スイングID

レスポンス: スイング詳細データのJSON

## 環境変数

| 変数名 | デフォルト値 | 説明 |
|--------|-------------|------|
| PORT   | 3001        | サーバーのポート番号 |

## 本番環境へのデプロイ

### Railway / Render / Heroku等にデプロイする場合

1. `server` ディレクトリをルートとしてデプロイ
2. ビルドコマンド: `npm install`
3. 起動コマンド: `npm start`
4. 環境変数 `PORT` は自動的に設定される

### フロントエンドの設定

デプロイ後、フロントエンドの環境変数を更新:

```bash
# .env
VITE_PROXY_URL=https://your-proxy-server.com/api/
```

## トラブルシューティング

### CORSエラーが発生する場合

サーバーのCORS設定を確認してください。現在は全てのオリジンを許可していますが、本番環境では特定のドメインに制限することを推奨します。

[server.js](server.js:13-17)を編集:
```javascript
app.use(cors({
  origin: 'https://your-frontend-domain.com',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
}));
```

### 接続タイムアウトが発生する場合

M-Tracer APIが応答しない可能性があります。サーバーログを確認してください。

## ログ

サーバーは全てのリクエストとレスポンスをコンソールにログ出力します:

```
2025-01-06T10:30:00.000Z - POST /api/encrypt
Encrypting UID: 2903c1cce6084be392647e9a9b4bdd5b
Encryption response: {...}

2025-01-06T10:30:05.000Z - GET /api/swing_list/br+Q...
Fetching swing list: https://obs.m-tracer.golf/api/swing_list/br+Q...
Swing list response status: 200
Swing list data received: 15 items
```
