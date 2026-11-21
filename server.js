const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
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
const DB_FILE = path.join(__dirname, "messages_db.json");

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

const INITIAL_ASSISTANT_MESSAGE = {
  role: "assistant",
  content: "*You recently inherited a farm from your grandparents. You have always struggled with money so you think life on a farm could work to make an extra buck. When you make it to the farm for the first time. It’s completely dilapidated with no crops or livestock to be seen. When you enter the house off to the side, you find a woman with cow horns and a tail, wearing a cow print bikini and a bell collar sleeping on the floor. She wakes up when you enter.*\n“Hello, master.”\n"
};

const conversationHistory = [
  { ...INITIAL_ASSISTANT_MESSAGE }
];

// ==================== قاعدة البيانات المحلية لحفظ معرفات الرسائل ====================
function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify({ messages: [] }, null, 2));
    }
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return { messages: [] };
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("DB_WRITE_ERROR:", e.message);
  }
}

function saveMessageRecord({ id, role, content, botId = BOT_ID, sessionId = SESSION_ID }) {
  if (!id) return;
  const db = readDB();
  const strId = String(id);
  if (!db.messages.some(m => String(m.id) === strId)) {
    db.messages.push({
      id: strId,
      role,
      content: content || "",
      botId: Number(botId),
      sessionId: Number(sessionId),
      createdAt: new Date().toISOString()
    });
    writeDB(db);
  }
}

function removeMessageRecords(idsToRemove = []) {
  const idSet = new Set(idsToRemove.map(String));
  const db = readDB();
  const removedItems = db.messages.filter(m => idSet.has(String(m.id)));
  db.messages = db.messages.filter(m => !idSet.has(String(m.id)));
  writeDB(db);
  return removedItems;
}

async function readStreamResponse(streamRes) {
  if (!streamRes.body || typeof streamRes.body.getReader !== "function") {
    console.log("STREAM_READER: fallback to text()");
    return await streamRes.text();
  }

  const reader = streamRes.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let fullRaw = "";
  let chunkCount = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunkCount += 1;
      fullRaw += decoder.decode(value, { stream: true });
    }
  }

  fullRaw += decoder.decode();
  console.log("STREAM_CHUNKS_COUNT:", chunkCount, "TOTAL_LEN:", fullRaw.length);
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

    if (!sendRes.ok || (sendData && sendData.code && sendData.code !== 0 && sendData.code !== 200 && sendData.code !== "200")) {
      return res.json({
        ok: false,
        reply: sendData?.msg || sendData?.message || `فشل إرسال الرسالة (${sendRes.status})`
      });
    }

    // استخراج وحفظ ID رسالة المستخدم من استجابة /api/msg/send
    const userMsgId =
      sendData?.data?.id ??
      sendData?.data?.msgId ??
      sendData?.id ??
      sendData?.msgId ??
      null;

    if (userMsgId) {
      saveMessageRecord({
        id: userMsgId,
        role: "user",
        content: userMsg
      });
    }

    conversationHistory.push({
      role: "user",
      content: userMsg
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    console.log("CALLING_STREAM_START");

    let streamRes;
    try {
      streamRes = await fetch('https://www.yollo.ai/chat-stream', {
        method: 'POST',
        signal: controller.signal,
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
    } finally {
      clearTimeout(timeoutId);
    }

    console.log("STREAM_HEADERS_RECEIVED:", streamRes.status);
    const rawStreamText = await readStreamResponse(streamRes);
    console.log("STREAM_STATUS:", streamRes.status, "STREAM_RAW:", rawStreamText.slice(0, 1500));

    const botReply = extractFullReply(rawStreamText, userMsg);
    let botMsgId = null;

    if (botReply) {
      conversationHistory.push({
        role: "assistant",
        content: botReply
      });

      const callbackRes = await fetch('https://www.yollo.ai/api/msg/callback', {
        method: 'POST',
        headers: BASE_HEADERS,
        body: JSON.stringify({
          sessionId: SESSION_ID,
          msg: botReply,
          generateType: "1"
        })
      }).catch(() => null);

      if (callbackRes) {
        const callbackData = await callbackRes.json().catch(() => ({}));
        console.log("CALLBACK_DATA:", JSON.stringify(callbackData).slice(0, 500));

        // استخراج وحفظ ID رد البوت من استجابة /api/msg/callback
        botMsgId =
          callbackData?.data?.id ??
          callbackData?.data?.msgId ??
          callbackData?.id ??
          callbackData?.msgId ??
          null;

        if (botMsgId) {
          saveMessageRecord({
            id: botMsgId,
            role: "assistant",
            content: botReply
          });
        }
      }
    }

    res.json({
      ok: Boolean(botReply),
      reply: botReply || `تم إرسال الرسالة ولكن لم يظهر نص رد من /chat-stream (الحالة: ${streamRes.status}).`,
      userMsgId: userMsgId ? String(userMsgId) : null,
      botMsgId: botMsgId ? String(botMsgId) : null
    });
  } catch (err) {
    console.error("CHAT_ERROR:", err?.name, err?.message, err?.cause || "");
    res.status(500).json({
      ok: false,
      error: err?.name === "AbortError" ? "انتهت مهلة انتظار البث (60 ثانية)" : "تعذر الاتصال بخادم yollo.ai",
      details: err.message
    });
  }
});

// ==================== حذف رسالة محددة بالـ ID من Yollo ومن السجل ====================
app.post('/api/delete-message', async (req, res) => {
  const { messageId } = req.body;

  if (!messageId) {
    return res.status(400).json({ ok: false, error: "معرّف الرسالة مفقود" });
  }

  if (!AUTH_TOKEN) {
    return res.status(500).json({ ok: false, error: "متغير AUTH_TOKEN غير مضبوط في Render" });
  }

  try {
    const delRes = await fetch(`https://www.yollo.ai/api/msg/deleteMessage/${messageId}`, {
      method: 'DELETE',
      headers: BASE_HEADERS
    });

    const delData = await delRes.json().catch(() => ({}));
    console.log("DELETE_MSG_STATUS:", messageId, delRes.status, JSON.stringify(delData).slice(0, 300));

    const removed = removeMessageRecords([messageId]);

    // إزالة الرسالة المحذوفة من ذاكرة المحادثة الحالية في السيرفر أيضاً
    if (removed.length > 0) {
      const targetContent = removed[0].content;
      const idx = conversationHistory.findIndex((m, i) => i > 0 && m.content === targetContent);
      if (idx !== -1) {
        conversationHistory.splice(idx, 1);
      }
    }

    res.json({
      ok: delRes.ok,
      deletedId: String(messageId),
      data: delData
    });
  } catch (err) {
    console.error("DELETE_MSG_ERROR:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==================== مسح محتوى المحادثة بالكامل (حذف جميع الـ IDs) ====================
app.post('/api/clear', async (req, res) => {
  const { messageIds = [] } = req.body;

  if (!AUTH_TOKEN) {
    return res.status(500).json({ ok: false, error: "متغير AUTH_TOKEN غير مضبوط في Render" });
  }

  try {
    const db = readDB();
    const dbIds = db.messages.map(m => String(m.id));
    const allIds = [...new Set([...messageIds.map(String), ...dbIds].filter(Boolean))]
      .sort((a, b) => Number(b) - Number(a));

    let deletedCount = 0;

    for (const id of allIds) {
      const delRes = await fetch(`https://www.yollo.ai/api/msg/deleteMessage/${id}`, {
        method: 'DELETE',
        headers: BASE_HEADERS
      }).catch(() => null);

      if (delRes && delRes.ok) {
        deletedCount += 1;
      }
    }

    removeMessageRecords(allIds);

    // إعادة تصفير ذاكرة المحادثة في السيرفر إلى الرسالة الافتتاحية فقط
    conversationHistory.length = 0;
    conversationHistory.push({ ...INITIAL_ASSISTANT_MESSAGE });

    console.log("CLEAR_SESSION_DONE:", { targeted: allIds.length, deletedCount });

    res.json({
      ok: true,
      totalTargeted: allIds.length,
      deletedCount
    });
  } catch (err) {
    console.error("CLEAR_ERROR:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==================== عرض قاعدة البيانات المحفوظة للفحص ====================
app.get('/api/db-messages', (req, res) => {
  const db = readDB();
  res.json({
    ok: true,
    count: db.messages.length,
    messages: db.messages
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
