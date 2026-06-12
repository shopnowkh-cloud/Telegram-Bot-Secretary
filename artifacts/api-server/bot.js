const TelegramBot = require("node-telegram-bot-api");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage, DeletedMessage } = require("telegram/events");
const http = require("http");
const fs = require("fs");
const path = require("path");

// ── HTTP health check ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Bot running");
}).listen(PORT, () => console.log(`HTTP server on port ${PORT}`));

// ── Config ────────────────────────────────────────────────────────────────
const TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const API_ID  = parseInt(process.env.TELEGRAM_API_ID);
const API_HASH = process.env.TELEGRAM_API_HASH;
const SESSION = process.env.TELEGRAM_SESSION || "";

if (!TOKEN)            { console.error("TELEGRAM_BOT_TOKEN not set"); process.exit(1); }
if (!API_ID || !API_HASH) { console.error("TELEGRAM_API_ID/HASH not set"); process.exit(1); }

// ── HTML helpers ──────────────────────────────────────────────────────────
function esc(text) {
  if (!text && text !== 0) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function b(text)  { return `<b>${esc(text)}</b>`; }
function code(text) { return `<code>${esc(text)}</code>`; }
const HTML = { parse_mode: "HTML" };

// ── Active Users ──────────────────────────────────────────────────────────
const USERS_FILE = path.join(__dirname, "users.json");

function loadUsers() {
  try { return new Set(JSON.parse(fs.readFileSync(USERS_FILE, "utf8"))); }
  catch (_) { return new Set(); }
}
function saveUsers(set) {
  try { fs.writeFileSync(USERS_FILE, JSON.stringify([...set]), "utf8"); }
  catch (err) { console.error("save users:", err.message); }
}
function addUser(chatId) {
  if (!activeUsers.has(chatId)) {
    activeUsers.add(chatId);
    saveUsers(activeUsers);
    console.log(`[User] registered ${chatId} — total: ${activeUsers.size}`);
  }
}

const activeUsers = loadUsers();
console.log(`[User] loaded ${activeUsers.size} users`);

// ── Bot ───────────────────────────────────────────────────────────────────
const bot = new TelegramBot(TOKEN, {
  polling: {
    interval: 1000,
    autoStart: true,
    params: { timeout: 30, allowed_updates: ["message", "edited_message", "channel_post", "callback_query"] },
  },
});

// ── Message Store ─────────────────────────────────────────────────────────
const messageStore = new Map();
const MAX_MESSAGES = 10000;

function storeKey(chatId, messageId) { return `${chatId}:${messageId}`; }

function saveMessage(data) {
  if (messageStore.size >= MAX_MESSAGES) {
    messageStore.delete(messageStore.keys().next().value);
  }
  messageStore.set(storeKey(data.chatId, data.messageId), data);
}
function getStoredMessage(chatId, messageId) {
  return messageStore.get(storeKey(chatId, messageId));
}
function removeStoredMessage(chatId, messageId) {
  messageStore.delete(storeKey(chatId, messageId));
}

// ── Helpers ───────────────────────────────────────────────────────────────
function getDisplayName(user) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return name || user.username || `user#${user.id}`;
}
function getMediaType(msg) {
  if (msg.photo)      return "📷 រូបភាព";
  if (msg.video)      return "🎥 វីដេអូ";
  if (msg.audio)      return "🎵 ឯកសារសំឡេង";
  if (msg.voice)      return "🎤 សារសំឡេង";
  if (msg.document)   return "📎 ឯកសារ";
  if (msg.sticker)    return "🎭 រូបតំណាង";
  if (msg.animation)  return "🎞 GIF";
  if (msg.video_note) return "📹 វីដេអូចំណាំ";
  if (msg.location)   return "📍 ទីតាំង";
  if (msg.contact)    return "👤 ទំនាក់ទំនង";
  if (msg.poll)       return "📊 បោះឆ្នោត";
  return undefined;
}
function nowKH() {
  return new Date().toLocaleString("km-KH", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
}
async function typing(chatId) {
  try { await bot.sendChatAction(chatId, "typing"); } catch (_) {}
}

// ── Notify all active users ───────────────────────────────────────────────
async function notifyAll(text, opts = {}) {
  if (activeUsers.size === 0) {
    console.log("[notifyAll] no users — send /start first");
    return;
  }
  let removed = false;
  for (const chatId of activeUsers) {
    try {
      await bot.sendMessage(chatId, text, opts);
    } catch (err) {
      if (err.message && (
        err.message.includes("bot was blocked") ||
        err.message.includes("chat not found") ||
        err.message.includes("user is deactivated")
      )) {
        activeUsers.delete(chatId);
        removed = true;
        console.log(`[notifyAll] removed ${chatId}`);
      } else {
        console.error(`[notifyAll] failed ${chatId}: ${err.message}`);
      }
    }
  }
  if (removed) saveUsers(activeUsers);
}

// ── Secretary Mode ────────────────────────────────────────────────────────
const secretaryMode = new Map();
function isSecretaryOn(chatId) { return secretaryMode.get(chatId) !== false; }

// ── Handle deleted message notification ───────────────────────────────────
async function handleDeletedMessage(chatId, messageId, chatTitle) {
  if (!isSecretaryOn(chatId)) return;

  const stored = getStoredMessage(chatId, messageId);
  if (!stored) {
    console.log(`[delete] msg ${messageId} not in store (chat ${chatId})`);
    return;
  }

  const time = new Date(stored.date * 1000).toLocaleString("km-KH", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });

  const usernameStr = stored.fromUsername ? ` (@${esc(stored.fromUsername)})` : "";
  const chatStr     = chatTitle ? ` នៅក្នុង ${b(chatTitle)}` : "";

  let content = "";
  if (stored.text) {
    content = `\n\n📝 ${b("ខ្លឹមសារ:")}\n${esc(stored.text)}`;
  } else if (stored.caption && stored.mediaType) {
    content = `\n\n${esc(stored.mediaType)}\n📝 ${b("ចំណងជើង:")} ${esc(stored.caption)}`;
  } else if (stored.mediaType) {
    content = `\n\n${esc(stored.mediaType)} <i>(គ្មានអត្ថបទ)</i>`;
  } else {
    content = `\n\n<i>(មិនដឹងខ្លឹមសារ)</i>`;
  }

  const notification =
    `🚨 ${b("ការជូនដំណឹង — សារត្រូវបានលប់!")}${chatStr}\n\n` +
    `👤 ${b("ពី:")} ${esc(stored.fromName)}${usernameStr}\n` +
    `🕐 ${b("បានផ្ញើ:")} ${esc(time)}\n` +
    `🆔 ${b("លេខសារ:")} ${code(stored.messageId)}` +
    content;

  try {
    await notifyAll(notification, HTML);
    console.log(`[notify] deleted msg ${messageId} from ${stored.fromName}`);
  } catch (err) {
    console.error(`[notify] error: ${err.message}`);
  }

  removeStoredMessage(chatId, messageId);
}

// ── GramJS User Client (MTProto delete detection) ────────────────────────
async function startUserClient() {
  if (!SESSION) {
    console.log("[GramJS] TELEGRAM_SESSION not set — run: node generate-session.js");
    return;
  }

  const client = new TelegramClient(
    new StringSession(SESSION), API_ID, API_HASH,
    { connectionRetries: 5, useWSS: false }
  );

  try {
    await client.connect();
    const me = await client.getMe();
    console.log(`[GramJS] connected as: ${me.firstName} (@${me.username || me.id})`);

    // Store all incoming messages
    client.addEventHandler(async (event) => {
      const msg = event.message;
      if (!msg || !msg.peerId) return;
      const chatId = Number(msg.peerId.channelId || msg.peerId.chatId || msg.peerId.userId);
      const fromId = msg.fromId ? Number(msg.fromId.userId || msg.fromId.channelId || 0) : chatId;

      let fromName = "Unknown";
      try {
        const sender = await msg.getSender();
        if (sender) {
          fromName = [sender.firstName, sender.lastName].filter(Boolean).join(" ")
            || sender.username || `id:${fromId}`;
        }
      } catch (_) {}

      saveMessage({
        messageId: msg.id,
        chatId,
        fromId,
        fromName,
        fromUsername: null,
        text: msg.message || null,
        caption: msg.message || null,
        mediaType: msg.media ? "📎 មេឌៀ" : undefined,
        date: msg.date,
      });
    }, new NewMessage({}));

    // Detect deletions
    client.addEventHandler(async (event) => {
      const deletedIds = event.deletedIds;
      if (!deletedIds || deletedIds.length === 0) return;

      let chatId = null;
      let chatTitle = null;

      try {
        if (event.peer) {
          const peer = await client.getEntity(event.peer);
          chatId = Number(peer.id);
          chatTitle = peer.title || peer.username || null;
        }
      } catch (_) {}

      console.log(`[GramJS] delete event: ids=${deletedIds.join(",")} chat=${chatId}`);

      for (const msgId of deletedIds) {
        let resolvedChatId = chatId;
        if (!resolvedChatId) {
          for (const [, val] of messageStore) {
            if (val.messageId === msgId) { resolvedChatId = val.chatId; break; }
          }
        }
        if (resolvedChatId) {
          await handleDeletedMessage(resolvedChatId, msgId, chatTitle);
        }
      }
    }, new DeletedMessage({}));

    console.log("[GramJS] listening for delete events...");
  } catch (err) {
    console.error(`[GramJS] connect failed: ${err.message}`);
  }
}

// ── Bot Commands ──────────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  addUser(msg.chat.id);
  await typing(msg.chat.id);
  const name = msg.from ? getDisplayName(msg.from) : "មិត្ត";
  const modeStatus = isSecretaryOn(msg.chat.id) ? "🟢 បើក" : "🔴 បិទ";
  const sessionStatus = SESSION ? "✅ GramJS ភ្ជាប់" : "⚠️ SESSION_STRING មិនទាន់កំណត់";

  await bot.sendMessage(msg.chat.id,
    `👋 សួស្តី ${b(name)}!\n\n` +
    `ខ្ញុំជា ${b("Bot លេខាធិការ")} 🤖\n\n` +
    `ខ្ញុំតាមដានការសន្ទនា ហើយ ${b("ជូនដំណឹងភ្លាមៗ នៅពេលណាដែលនរណាម្នាក់លប់សារ")}។\n\n` +
    `📋 ${b("Secretary Mode:")} ${modeStatus}\n` +
    `🔌 ${b("Delete Detection:")} ${sessionStatus}\n\n` +
    `✅ បន្ថែមខ្ញុំទៅក្រុម ឬប្រើក្នុងការសន្ទនាឯកជន\n` +
    `🔔 ខ្ញុំជូនដំណឹងភ្លាមៗ នៅពេលមានការលប់សារ\n\n` +
    `វាយ /help ដើម្បីមើលពាក្យបញ្ជា`,
    HTML
  );
});

bot.onText(/\/help/, async (msg) => {
  await typing(msg.chat.id);
  await bot.sendMessage(msg.chat.id,
    `📖 ${b("Bot លេខាធិការ — ពាក្យបញ្ជា")}\n\n` +
    `▸ /start — សារស្វាគមន៍\n` +
    `▸ /help — មើលជំនួយ\n` +
    `▸ /status — ស្ថានភាព Bot\n` +
    `▸ /myid — មើល Chat ID របស់អ្នក\n` +
    `▸ /secretary_on — បើក Secretary Mode\n` +
    `▸ /secretary_off — បិទ Secretary Mode\n` +
    `▸ /test — សាកល្បង Secretary Mode\n\n` +
    `🔍 ${b("របៀបដំណើរការ:")}\n` +
    `Bot ប្រើ GramJS (MTProto) ដើម្បី detect deletion ពិតប្រាកដ។\n\n` +
    `⚠️ ${b("ចំណាំ:")} ក្នុងក្រុម សូមតែងតាំង Bot ជា ${b("Admin")}`,
    HTML
  );
});

bot.onText(/\/myid/, async (msg) => {
  addUser(msg.chat.id);
  await typing(msg.chat.id);
  const userId = msg.from ? msg.from.id : "មិនដឹង";
  const chatId = msg.chat.id;
  const chatType = msg.chat.type === "private" ? "ឯកជន" : msg.chat.type;

  await bot.sendMessage(msg.chat.id,
    `🪪 ${b("Chat ID របស់អ្នក")}\n\n` +
    `👤 ${b("User ID:")} ${code(userId)}\n` +
    `💬 ${b("Chat ID:")} ${code(chatId)}\n` +
    `📂 ${b("ប្រភេទ:")} ${esc(chatType)}\n\n` +
    `✅ អ្នកបានចុះឈ្មោះទទួល notification ហើយ!`,
    HTML
  );
});

bot.onText(/\/status/, async (msg) => {
  addUser(msg.chat.id);
  await typing(msg.chat.id);
  const modeStatus = isSecretaryOn(msg.chat.id) ? "🟢 បើក" : "🔴 បិទ";
  const sessionStatus = SESSION ? "✅ GramJS ភ្ជាប់" : "⚠️ SESSION_STRING មិនទាន់កំណត់";

  await bot.sendMessage(msg.chat.id,
    `🤖 ${b("ស្ថានភាព Bot លេខាធិការ")}\n\n` +
    `📋 Secretary Mode: ${b(modeStatus)}\n` +
    `🔌 Delete Detection: ${b(sessionStatus)}\n` +
    `📦 សារក្នុងស្តុក: ${b(messageStore.size)} សារ\n` +
    `👥 អ្នកប្រើ active: ${b(activeUsers.size)} នាក់\n` +
    `⚡ Polling: ${b("កំពុងដំណើរការ")}\n` +
    `🕐 Server: ${b("Online")}`,
    HTML
  );
});

bot.onText(/\/secretary_on/, async (msg) => {
  await typing(msg.chat.id);
  secretaryMode.set(msg.chat.id, true);
  await bot.sendMessage(msg.chat.id,
    `🟢 ${b("Secretary Mode បានបើក!")}\n\nខ្ញុំនឹងតាមដាន ហើយជូនដំណឹងភ្លាមៗ នៅពេលណាមានការលប់សារ។`,
    HTML
  );
});

bot.onText(/\/secretary_off/, async (msg) => {
  await typing(msg.chat.id);
  secretaryMode.set(msg.chat.id, false);
  await bot.sendMessage(msg.chat.id,
    `🔴 ${b("Secretary Mode បានបិទ!")}\n\nខ្ញុំនឹងមិនជូនដំណឹងអំពីការលប់សារទៀតទេ។`,
    HTML
  );
});

bot.onText(/\/secretary (.+)/, async (msg, match) => {
  await typing(msg.chat.id);
  const arg = (match[1] || "").trim().toLowerCase();
  if (arg === "on") {
    secretaryMode.set(msg.chat.id, true);
    await bot.sendMessage(msg.chat.id, `🟢 ${b("Secretary Mode បានបើក!")}`, HTML);
  } else if (arg === "off") {
    secretaryMode.set(msg.chat.id, false);
    await bot.sendMessage(msg.chat.id, `🔴 ${b("Secretary Mode បានបិទ!")}`, HTML);
  } else {
    await bot.sendMessage(msg.chat.id, `❓ សូមប្រើ: /secretary_on ឬ /secretary_off`, HTML);
  }
});

bot.onText(/\/test/, async (msg) => {
  await typing(msg.chat.id);
  if (!isSecretaryOn(msg.chat.id)) {
    await bot.sendMessage(msg.chat.id,
      `🔴 Secretary Mode បានបិទ។ វាយ /secretary_on ដើម្បីបើក។`, HTML);
    return;
  }
  const fromName = msg.from ? getDisplayName(msg.from) : "សាកល្បង";
  await bot.sendMessage(msg.chat.id,
    `🧪 ${b("ការសាកល្បង Secretary Mode")}\n\nBot ✅ ដំណើរការបានល្អ!\n\n` +
    `🔌 Delete Detection: ${SESSION ? "✅ GramJS ភ្ជាប់" : "⚠️ SESSION_STRING មិនទាន់កំណត់"}`,
    HTML
  );
  console.log(`[test] by ${fromName} in chat ${msg.chat.id}`);
});

// ── Store messages from polling ────────────────────────────────────────────
function storeMsg(msg, fromUser) {
  if (!fromUser) return;
  saveMessage({
    messageId: msg.message_id,
    chatId: msg.chat.id,
    fromId: fromUser.id,
    fromName: getDisplayName(fromUser),
    fromUsername: fromUser.username,
    text: msg.text,
    caption: msg.caption,
    mediaType: getMediaType(msg),
    date: msg.date,
  });
}

bot.on("message",        (msg) => storeMsg(msg, msg.from));
bot.on("edited_message", (msg) => storeMsg(msg, msg.from));
bot.on("channel_post",   (msg) => {
  saveMessage({
    messageId: msg.message_id,
    chatId: msg.chat.id,
    fromId: msg.chat.id,
    fromName: msg.chat.title || "ឆានែល",
    text: msg.text,
    caption: msg.caption,
    mediaType: getMediaType(msg),
    date: msg.date,
  });
});

bot.on("polling_error", (err) => {
  console.error(`[polling_error] ${err.message}`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────
let isShuttingDown = false;
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[shutdown] signal: ${signal}`);
  await notifyAll(
    `🔴 ${b("Bot លេខាធិការ បានផ្តាច់!")}\n\n` +
    `ពេលវេលា: ${esc(nowKH())}\n` +
    `Bot ត្រូវបានបិទ ឬចាប់ផ្ដើមឡើងវិញ។`,
    HTML
  );
  try { await bot.stopPolling(); } catch (_) {}
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  console.error(`[uncaughtException] ${err.message}`);
  if (!err.message.includes("ETELEGRAM")) process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(`[unhandledRejection] ${reason}`);
});

// ── Startup ───────────────────────────────────────────────────────────────
bot.getMe().then(async (me) => {
  console.log(`Bot started: @${me.username} (id: ${me.id})`);

  await bot.setMyCommands([
    { command: "start",         description: "👋 ចាប់ផ្ដើម / សារស្វាគមន៍" },
    { command: "help",          description: "📖 មើលជំនួយ និងពាក្យបញ្ជា" },
    { command: "status",        description: "📊 ស្ថានភាព Bot" },
    { command: "myid",          description: "🪪 មើល Chat ID របស់អ្នក" },
    { command: "secretary_on",  description: "🟢 បើក Secretary Mode" },
    { command: "secretary_off", description: "🔴 បិទ Secretary Mode" },
    { command: "test",          description: "🧪 សាកល្បង Secretary Mode" },
  ]);

  await startUserClient();

  const sessionStatus = SESSION ? "GramJS connected" : "SESSION not set";
  await notifyAll(
    `🟢 ${b("Bot លេខាធិការ បានភ្ជាប់!")}\n\n` +
    `Bot: @${esc(me.username)}\n` +
    `ពេលវេលា: ${esc(nowKH())}\n` +
    `Delete Detection: ${sessionStatus}\n\n` +
    `<i>Bot ដំណើរការ ហើយរួចរាល់ក្នុងការតាមដាន។</i>`,
    HTML
  );
  console.log("Startup complete.");
}).catch((err) => {
  console.error(`Bot connect failed: ${err.message}`);
  process.exit(1);
});
