import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3001;

// M-Tracer API endpoints
const ENCRYPT_API = 'https://dental-hotline.com/mtracer/uid_encrypt/uid_encrypt.php';
const API_BASE = 'https://obs.m-tracer.golf/api/';

// CORS設定 - すべてのオリジンを許可（本番環境では特定のドメインに制限することを推奨）
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
}));

// JSONボディパーサー
app.use(express.json());

// ログミドルウェア
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Proxy server is running' });
});

// 暗号化エンドポイント
app.post('/api/encrypt', async (req, res) => {
  try {
    const { uid } = req.body;

    if (!uid) {
      return res.status(400).json({ error: 'UID is required' });
    }

    console.log(`Encrypting UID: ${uid}`);

    const response = await fetch(ENCRYPT_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uid }),
    });

    if (!response.ok) {
      throw new Error(`Encryption API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Encryption response:', data);

    res.json(data);
  } catch (error) {
    console.error('Encryption error:', error);
    res.status(500).json({
      error: 'Failed to encrypt UID',
      message: error.message
    });
  }
});

// スイングリスト取得エンドポイント
app.get('/api/swing_list', async (req, res) => {
  try {
    const { uid, start_date, end_date } = req.query;

    if (!uid) {
      return res.status(400).json({ error: 'UID parameter is required' });
    }

    // クエリパラメータを含むURLを構築
    const queryParams = new URLSearchParams();
    queryParams.append('uid', uid);
    if (start_date) queryParams.append('start_date', start_date);
    if (end_date) queryParams.append('end_date', end_date);

    const url = `${API_BASE}swing_list?${queryParams.toString()}`;

    console.log(`Fetching swing list: ${url}`);
    console.log(`UID: ${uid}`);
    console.log(`Date range: ${start_date} to ${end_date}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    console.log(`Swing list response status: ${response.status}`);

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ error: 'No swing data found for this user' });
      }
      const errorText = await response.text();
      console.error('API error response:', errorText);
      return res.status(response.status).json({
        error: `API error: ${response.statusText}`,
        details: errorText
      });
    }

    const data = await response.json();
    console.log('Swing list data received:', Array.isArray(data) ? `${data.length} items` : typeof data);
    console.log('Response data structure:', JSON.stringify(data, null, 2));

    res.json(data);
  } catch (error) {
    console.error('Swing list fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch swing list',
      message: error.message
    });
  }
});

// スイング詳細取得エンドポイント
app.get('/api/swing_detail', async (req, res) => {
  try {
    const { uid, swing_id } = req.query;

    if (!uid) {
      return res.status(400).json({ error: 'UID parameter is required' });
    }

    if (!swing_id) {
      return res.status(400).json({ error: 'Swing ID parameter is required' });
    }

    // クエリパラメータを含むURLを構築
    const queryParams = new URLSearchParams();
    queryParams.append('uid', uid);
    queryParams.append('swing_id', swing_id);

    const url = `${API_BASE}swing_detail?${queryParams.toString()}`;

    console.log(`Fetching swing detail: ${url}`);
    console.log(`UID: ${uid}`);
    console.log(`Swing ID: ${swing_id}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    console.log(`Swing detail response status: ${response.status}`);

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ error: 'Swing detail not found' });
      }
      const errorText = await response.text();
      console.error('API error response:', errorText);
      return res.status(response.status).json({
        error: `API error: ${response.statusText}`,
        details: errorText
      });
    }

    const data = await response.json();
    console.log('Swing detail data received');
    console.log('Swing detail structure:', JSON.stringify(data, null, 2));

    res.json(data);
  } catch (error) {
    console.error('Swing detail fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch swing detail',
      message: error.message
    });
  }
});

// エラーハンドリングミドルウェア
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`\n🚀 Proxy server running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Encrypt endpoint: POST http://localhost:${PORT}/api/encrypt`);
  console.log(`   Swing list endpoint: GET http://localhost:${PORT}/api/swing_list?uid={encryptedUID}&start_date=...&end_date=...`);
  console.log(`   Swing detail endpoint: GET http://localhost:${PORT}/api/swing_detail?uid={encryptedUID}&swing_id={swingId}\n`);
});
