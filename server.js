const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BOT_ID = 148005;
const SESSION_ID = 21702378;
const USER_ID = 13123914;
const UUID = "f0caea4f-3e19-4fc9-9bc4-fa0223fdbcab";
const AUTH_TOKEN = (process.env.AUTH_TOKEN || "").trim();
const FINGERPRINT = "254810a4c9b915cab1ac39f6174f7908";
const GUEST_KEY = "$2a$10$LusbhRWHXFSOk5m.0MI1yeNSmkW6.0BreQaQtRF1niYqv8N4JwwYq";
const USER_AGENT = "Mozilla/5.0 (Android 11; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0";

const BASE_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'x-no-show-msg-handle': 'true',
  'x-platform': 'web',
  'x-version': '999.0.0',
  'x-language': 'ar',
  'x-auth-token': AUTH_TOKEN,
  'x-finger': FINGERPRINT,
  'x-guest-key': GUEST_KEY,
  'x-guset-key': GUEST_KEY,
  'x-uuid': UUID,
  'x-uid': UUID,
  'x-user-id': String(USER_ID),
  'User-Agent': USER_AGENT,
  'Origin': 'https://www.yollo.ai',
  'Referer': `https://www.yollo.ai/ar/chat/Cow-Girl-Emma-${BOT_ID}?sessionId=${SESSION_ID}`
};

const conversationHistory = [
  {
    role: "assistant",
    content: "*You recently inherited a farm from your grandparents. You have always struggled with money so you think life on a farm could work to make an extra buck. When you make it to the farm for the first time. It’s completely dilapidated with no crops or livestock to be seen. When you enter the house off to the side, you find a woman with cow horns and a tail, wearing a cow print bikini and a bell collar sleeping on the floor. She wakes up when you enter.*\n“Hello, master.”\n"
  }
];

async function readStreamResponse(streamRes) {
  if (!streamRes.body || typeof streamRes.body.getReader !== "function") {
    return await streamRes.text();
  }

  const reader = streamRes.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let fullRaw = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      fullRaw += decoder.decode(value, { stream: true });
    }
  }

  fullRaw += decoder.decode();
  return fullRaw;
}

function extractFullReply(rawText, userMsg) {
  if (!rawText) return "";

  let collected = "";
  const lines = rawText.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const payload = trimmed.startsWith("data:")
      ? trimmed.slice(5).trim()
      : trimmed;

    if (!payload || payload === "[DONE]") continue;

    try {
      const obj = JSON.parse(payload);
      const chunk =
        obj?.data?.reply ??
        obj?.data?.content ??
        obj?.data?.msg ??
        obj?.data?.delta ??
        obj?.reply ??
        obj?.content ??
        obj?.msg ??
        obj?.delta ??
        (typeof obj === "string" ? obj : "");

      if (typeof chunk === "string") {
        collected += chunk;
      }
    } catch {
      if (!payload.startsWith("{") && !payload.startsWith("[")) {
        collected += `${payload}\n`;
      }
    }
  }

  const finalReply = (collected || rawText).trim();

  if (!finalReply || finalReply === userMsg) {
    return "";
  }

  return finalReply;
}

app.get('/health', (req, res) => {
  res.json({
    status: "ok",
    botId: BOT_ID,
    sessionId: SESSION_ID,
    uuid: UUID,
    hasAuthToken: Boolean(AUTH_TOKEN)
  });
});

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ ok: false, error: "الرسالة فارغة" });
  }

  if (!AUTH_TOKEN) {
    return res.status(500).json({ ok: false, error: "متغير AUTH_TOKEN غير مضبوط في Render" });
  }

  const userMsg = message.trim();

  try {
    // 1. إرسال الرسالة إلى /api/msg/send
    const sendRes = await fetch('https://www.yollo.ai/api/msg/send', {
      method: 'POST',
      headers: BASE_HEADERS,
      body: JSON.stringify({
        sessionId: SESSION_ID,
        msg: userMsg
      })
    });

    const sendData = await sendRes.json().catch(() => ({}));
    console.log("SEND_STATUS:", sendRes.status, "SEND_DATA:", JSON.stringify(sendData).slice(0, 500));

    if (!sendRes.ok || (sendData && sendData.code && sendData.code !== 0 && sendData.code !== 200)) {
      return res.json({
        ok: false,
        reply: sendData?.msg || sendData?.message || `فشل إرسال الرسالة (${sendRes.status})`
      });
    }

    // إضافة رسالة المستخدم إلى السجل
    conversationHistory.push({
      role: "user",
      content: userMsg
    });

    // 2. قراءة رد النموذج من /chat-stream
    const streamRes = await fetch('https://www.yollo.ai/chat-stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': AUTH_TOKEN,
        'x-finger': FINGERPRINT,
        'x-guest-key': GUEST_KEY,
        'x-guset-key': GUEST_KEY,
        'x-uuid': UUID,
        'x-uid': UUID,
        'User-Agent': USER_AGENT,
        'Origin': 'https://www.yollo.ai',
        'Referer': `https://www.yollo.ai/ar/chat/Cow-Girl-Emma-${BOT_ID}?sessionId=${SESSION_ID}`
      },
      body: JSON.stringify({
        message: userMsg,
        sessionId: String(SESSION_ID),
        uid: UUID,
        userId: USER_ID,
        conversationHistory,
        userToken: AUTH_TOKEN,
        userLocale: "ar",
        isRegenerate: false,
        isSafeMode: false,
        generateType: 0
      })
    });

    const rawStreamText = await readStreamResponse(streamRes);
    console.log("STREAM_STATUS:", streamRes.status, "STREAM_RAW:", rawStreamText.slice(0, 1500));

    const botReply = extractFullReply(rawStreamText, userMsg);

    // 3. تسجيل الرد عبر /api/msg/callback وحفظه في السجل
    if (botReply) {
      conversationHistory.push({
        role: "assistant",
        content: botReply
      });

      await fetch('https://www.yollo.ai/api/msg/callback', {
        method: 'POST',
        headers: BASE_HEADERS,
        body: JSON.stringify({
          sessionId: SESSION_ID,
          msg: botReply,
          generateType: "1"
        })
      }).catch(() => {});
    }

    res.json({
      ok: Boolean(botReply),
      reply: botReply || `لم يرد البوت بنص جديد (حالة البث: ${streamRes.status})؛ راجع سجلات Render.`
    });
  } catch (err) {
    console.error("CHAT_ERROR:", err);
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
