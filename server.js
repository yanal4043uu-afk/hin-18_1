const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BOT_ID = 148005;
const SESSION_ID = 21702378;
const UID = "f0caea4f-3e19-4fc9-9bc4-fa0223fdbcab";
const USER_ID = 13123914;
const AUTH_TOKEN = (process.env.AUTH_TOKEN || "").trim();
const FINGERPRINT = "254810a4c9b915cab1ac39f6174f7908";

app.get('/health', (req, res) => {
  res.json({ status: "ok", botId: BOT_ID, sessionId: SESSION_ID });
});

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ ok: false, error: "الرسالة فارغة" });
  }

  if (!AUTH_TOKEN) {
    return res.status(500).json({ ok: false, error: "متغير AUTH_TOKEN غير مضبوط في Render" });
  }

  try {
    const response = await fetch('https://www.yollo.ai/api/msg/send', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Android 11; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
        'Content-Type': 'application/json',
        'x-auth-token': AUTH_TOKEN,
        'x-finger': FINGERPRINT,
        'Origin': 'https://www.yollo.ai',
        'Referer': `https://www.yollo.ai/ar/chat/Cow-Girl-Emma-${BOT_ID}?sessionId=${SESSION_ID}`
      },
      body: JSON.stringify({
        botId: BOT_ID,
        sessionId: SESSION_ID,
        uid: UID,
        userId: USER_ID,
        content: message.trim(),
        msg: message.trim(),
        type: "text"
      })
    });

    const data = await response.json();

    const botReply =
      data?.data?.reply ||
      data?.data?.content ||
      data?.data?.msg ||
      data?.reply ||
      data?.content ||
      data?.msg ||
      JSON.stringify(data);

    res.json({
      ok: response.ok,
      reply: botReply
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: "تعذر الاتصال بخادم yollo.ai",
      details: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
