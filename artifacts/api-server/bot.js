const TelegramBot = require("node-telegram-bot-api");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage, DeletedMessage } = require("telegram/events");
const http = require("http");
const fs = require("fs");
const path = require("path");

// ── HTTP server សម្រាប់ health check ──────────────────────────────────────
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("✅ Bot លេខាធិការកំពុងដំណើរការ");
}).listen(PORT, () => console.log(`🌐 HTTP server បើក port ${PORT}`));

// ── Bot Init ──────────────────────────────────────────────────────────────
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_ID = parseInt(process.env.TELEGRAM_API_ID);
const API_HASH = process.env.TELEGRAM_API_HASH;
const SESSION = process.env.TELEGRAM_SESSION || "";

if (!TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN មិនត្រូវបានកំណត់!");
  process.exit(1);
}
if (!API_ID || !API_HASH) {
  console.error("❌ TELEGRAM_API_ID ឬ TELEGRAM_API_HASH មិនត្រូវបានកំណត់!");
  process.exit(1);
}

// ── Active Users ──────────────────────────────────────────────────────────
const USERS_FILE = path.join(__dirname, "users.json");

function loadUsers() {
  try {
    return new Set(JSON.parse(fs.readFileSync(USERS_FILE, "utf8")));
  } catch (_) {
    return new Set();
  }
}

function saveUsers(set) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify([...set]), "utf8");
  } catch (err) {
    console.error(`[កំហុស] save users: ${err.message}`);
  }
}

function addUser(chatId) {
  if (!activeUsers.has(chatId)) {
    activeUsers.add(chatId);
    saveUsers(activeUsers);
    console.log(`[User] ចុះឈ្មោះ chat ${chatId} — សរុប: ${activeUsers.size} នាក់`);
  }
}

const activeUsers = loadUsers();
console.log(`[User] load ${activeUsers.size} users ពី file`);

// ── Bot (for sending notifications) ──────────────────────────────────────
const bot = new TelegramBot(TOKEN, {
  polling: {
    interval: 1000,
    autoStart: true,
    params: {
      timeout: 30,
      allowed_updates: ["message", "edited_message", "channel_post", "callback_query"],
    },
  },
});

// ── Message Store ─────────────────────────────────────────────────────────
const messageStore = new Map();
const MAX_MESSAGES = 10000;

function storeKey(chatId, messageId) {
  return `${chatId}:${messageId}`;
}

function saveMessage(data) {
  if (messageStore.size >= MAX_MESSAGES) {
    const firstKey = messageStore.keys().next().value;
    messageStore.delete(firstKey);
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
  return name || user.username || `អ្នកប្រើ#${user.id}`;
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
async function notifyAll(text) {
  if (activeUsers.size === 0) {
    console.log("[ព័ត៌មាន] notifyAll — គ្មានអ្នកប្រើ");
    return;
  }
  let removed = false;
  for (const chatId of activeUsers) {
    try {
      await bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
    } catch (err) {
      if (err.message && (
        err.message.includes("bot was blocked") ||
        err.message.includes("chat not found") ||
        err.message.includes("user is deactivated")
      )) {
        activeUsers.delete(chatId);
        removed = true;
        console.log(`[ព័ត៌មាន] លុប chat ${chatId} — block/not found`);
      } else {
        console.error(`[កំហុស] មិនអាចផ្ញើជូន ${chatId}: ${err.message}`);
      }
    }
  }
  if (removed) saveUsers(activeUsers);
}

// ── Secretary Mode ────────────────────────────────────────────────────────
const secretaryMode = new Map();
function isSecretaryOn(chatId) {
  return secretaryMode.get(chatId) !== false;
}

// ── Handle deleted message ────────────────────────────────────────────────
async function handleDeletedMessage(chatId, messageId, chatTitle) {
  if (!isSecretaryOn(chatId)) return;

  const stored = getStoredMessage(chatId, messageId);
  if (!stored) {
    console.log(`[ព័ត៌មាន] សារ ${messageId} មិននៅក្នុងស្តុក (chatId: ${chatId})`);
    return;
  }

  const time = new Date(stored.date * 1000).toLocaleString("km-KH", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });

  const usernameStr = stored.fromUsername ? ` (@${stored.fromUsername})` : "";
  const chatStr = chatTitle ? ` នៅក្នុង *${chatTitle}*` : "";

  let content = "";
  if (stored.text) {
    content = `\n\n📝 *ខ្លឹមសារ:*\n${stored.text}`;
  } else if (stored.caption && stored.mediaType) {
    content = `\n\n${stored.mediaType}\n📝 *ចំណងជើង:* ${stored.caption}`;
  } else if (stored.mediaType) {
    content = `\n\n${stored.mediaType} _(គ្មានអត្ថបទ)_`;
  } else {
    content = `\n\n_(មិនដឹងខ្លឹមសារ)_`;
  }

  const notification =
    `🚨 *ការជូនដំណឹង — សារត្រូវបានលប់!*${chatStr}\n\n` +
    `👤 *ពី:* ${stored.fromName}${usernameStr}\n` +
    `🕐 *បានផ្ញើ:* ${time}\n` +
    `🆔 *លេខសារ:* ${stored.messageId}` +
    content;

  try {
    await notifyAll(notification);
    console.log(`[ជូនដំណឹង] សារ ${messageId} — ពី: ${stored.fromName}`);
  } catch (err) {
    console.error(`[កំហុស] មិនអាចផ្ញើការជូនដំណឹង: ${err.message}`);
  }

  removeStoredMessage(chatId, messageId);
}

// ── GramJS User Client (MTProto — detects deleted messages) ───────────────
async function startUserClient() {
  if (!SESSION) {
    console.log("[GramJS] ⚠️ TELEGRAM_SESSION មិនត្រូវបានកំណត់ — delete detection មិនដំណើរការ");
    console.log("[GramJS] ▶ សូម run: node generate-session.js ហើយបញ្ចូល TELEGRAM_SESSION");
    return;
  }

  const client = new TelegramClient(
    new StringSession(SESSION),
    API_ID,
    API_HASH,
    { connectionRetries: 5, useWSS: false }
  );

  try {
    await client.connect();
    const me = await client.getMe();
    console.log(`[GramJS] ✅ User client ភ្ជាប់ជាមួយ: ${me.firstName} (@${me.username || me.id})`);

    // Store messages via user client (catches all messages including those bot misses)
    client.addEventHandler(async (event) => {
      const msg = event.message;
      if (!msg || !msg.peerId) return;
      const chatId = Number(msg.peerId.channelId || msg.peerId.chatId || msg.peerId.userId);
      const fromId = msg.fromId ? Number(msg.fromId.userId || msg.fromId.channelId || 0) : chatId;

      let fromName = "មិនដឹង";
      try {
        const sender = await msg.getSender();
        if (sender) {
          fromName = [sender.firstName, sender.lastName].filter(Boolean).join(" ") || sender.username || `id:${fromId}`;
        }
      } catch (_) {}

      saveMessage({
        messageId: msg.id,
        chatId: chatId,
        fromId: fromId,
        fromName: fromName,
        fromUsername: null,
        text: msg.message || null,
        caption: msg.message || null,
        mediaType: msg.media ? "📎 មេឌៀ" : undefined,
        date: msg.date,
      });
    }, new NewMessage({}));

    // Detect deleted messages
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

      console.log(`[GramJS] 🗑 Delete event: IDs=${deletedIds.join(",")} chatId=${chatId}`);

      for (const msgId of deletedIds) {
        // ព្យាយាម find chatId ពី messageStore ប្រសិនបើ event.peer គ្មាន
        if (!chatId) {
          for (const [key, val] of messageStore) {
            if (val.messageId === msgId) {
              chatId = val.chatId;
              break;
            }
          }
        }
        if (chatId) {
          await handleDeletedMessage(chatId, msgId, chatTitle);
        }
      }
    }, new DeletedMessage({}));

    console.log("[GramJS] 👂 កំពុងស្តាប់ delete events...");
  } catch (err) {
    console.error(`[GramJS] ❌ មិនអាចភ្ជាប់: ${err.message}`);
  }
}

// ── Bot Commands ──────────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  addUser(msg.chat.id);
  await typing(msg.chat.id);
  const name = msg.from ? getDisplayName(msg.from) : "មិត្ត";
  const modeStatus = isSecretaryOn(msg.chat.id) ? "🟢 បើក" : "🔴 បិទ";
  const sessionStatus = SESSION ? "✅ GramJS ភ្ជាប់" : "⚠️ SESSION_STRING មិនទាន់កំណត់";

  await bot.sendMessage(
    msg.chat.id,
    `👋 សួស្តី *${name}*!\n\n` +
    `ខ្ញុំជា *Bot លេខាធិការ* 🤖\n\n` +
    `ខ្ញុំតាមដានការសន្ទនា ហើយ *ជូនដំណឹងភ្លាមៗ នៅពេលណាដែលនរណាម្នាក់លប់សារ*។\n\n` +
    `📋 *Secretary Mode:* ${modeStatus}\n` +
    `🔌 *Delete Detection:* ${sessionStatus}\n\n` +
    `✅ បន្ថែមខ្ញុំទៅក្រុម ឬប្រើក្នុងការសន្ទនាឯកជន\n` +
    `🔔 ខ្ញុំជូនដំណឹងភ្លាមៗ នៅពេលមានការលប់សារ\n\n` +
    `វាយ /help ដើម្បីមើលពាក្យបញ្ជា`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/help/, async (msg) => {
  await typing(msg.chat.id);
  await bot.sendMessage(
    msg.chat.id,
    `*📖 Bot លេខាធិការ — ពាក្យបញ្ជា*\n\n` +
    `▸ /start — សារស្វាគមន៍\n` +
    `▸ /help — មើលជំនួយ\n` +
    `▸ /status — ស្ថានភាព Bot\n` +
    `▸ /myid — មើល Chat ID របស់អ្នក\n` +
    `▸ /secretary_on — បើក Secretary Mode\n` +
    `▸ /secretary_off — បិទ Secretary Mode\n` +
    `▸ /test — សាកល្បង Secretary Mode\n\n` +
    `*🔍 របៀបដំណើរការ:*\n` +
    `Bot ប្រើ GramJS (MTProto) ដើម្បី detect deletion ពិតប្រាកដ។\n\n` +
    `⚠️ *ចំណាំ:* ក្នុងក្រុម សូមតែងតាំង Bot ជា *Admin*`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/myid/, async (msg) => {
  addUser(msg.chat.id);
  await typing(msg.chat.id);
  const userId = msg.from ? msg.from.id : "មិនដឹង";
  const chatId = msg.chat.id;
  const chatType = msg.chat.type === "private" ? "ឯកជន" : msg.chat.type;

  await bot.sendMessage(
    msg.chat.id,
    `🪪 *Chat ID របស់អ្នក*\n\n` +
    `👤 *User ID:* \`${userId}\`\n` +
    `💬 *Chat ID:* \`${chatId}\`\n` +
    `📂 *ប្រភេទ:* ${chatType}\n\n` +
    `✅ អ្នកបានចុះឈ្មោះទទួល notification ហើយ!`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/status/, async (msg) => {
  addUser(msg.chat.id);
  await typing(msg.chat.id);
  const total = messageStore.size;
  const modeStatus = isSecretaryOn(msg.chat.id) ? "🟢 បើក" : "🔴 បិទ";
  const sessionStatus = SESSION ? "✅ GramJS ភ្ជាប់" : "⚠️ SESSION_STRING មិនទាន់កំណត់";

  await bot.sendMessage(
    msg.chat.id,
    `*🤖 ស្ថានភាព Bot លេខាធិការ*\n\n` +
    `📋 Secretary Mode: *${modeStatus}*\n` +
    `🔌 Delete Detection: *${sessionStatus}*\n` +
    `📦 សារក្នុងស្តុក: *${total}* សារ\n` +
    `👥 អ្នកប្រើ active: *${activeUsers.size}* នាក់\n` +
    `⚡ Polling: *កំពុងដំណើរការ*\n` +
    `🕐 Server: *Online*`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/secretary_on/, async (msg) => {
  await typing(msg.chat.id);
  secretaryMode.set(msg.chat.id, true);
  await bot.sendMessage(
    msg.chat.id,
    `🟢 *Secretary Mode បានបើក!*\n\nខ្ញុំនឹងតាមដាន ហើយជូនដំណឹងភ្លាមៗ នៅពេលណាមានការលប់សារ។`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/secretary_off/, async (msg) => {
  await typing(msg.chat.id);
  secretaryMode.set(msg.chat.id, false);
  await bot.sendMessage(
    msg.chat.id,
    `🔴 *Secretary Mode បានបិទ!*\n\nខ្ញុំនឹងមិនជូនដំណឹងអំពីការលប់សារទៀតទេ។`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/secretary (.+)/, async (msg, match) => {
  await typing(msg.chat.id);
  const arg = (match[1] || "").trim().toLowerCase();
  if (arg === "on") {
    secretaryMode.set(msg.chat.id, true);
    await bot.sendMessage(msg.chat.id, `🟢 *Secretary Mode បានបើក!*`, { parse_mode: "Markdown" });
  } else if (arg === "off") {
    secretaryMode.set(msg.chat.id, false);
    await bot.sendMessage(msg.chat.id, `🔴 *Secretary Mode បានបិទ!*`, { parse_mode: "Markdown" });
  } else {
    await bot.sendMessage(msg.chat.id, `❓ សូមប្រើ: /secretary_on ឬ /secretary_off`, { parse_mode: "Markdown" });
  }
});

bot.onText(/\/test/, async (msg) => {
  await typing(msg.chat.id);
  if (!isSecretaryOn(msg.chat.id)) {
    await bot.sendMessage(msg.chat.id, `🔴 Secretary Mode បានបិទ។ វាយ /secretary_on ដើម្បីបើក។`, { parse_mode: "Markdown" });
    return;
  }
  const fromName = msg.from ? getDisplayName(msg.from) : "សាកល្បង";
  await bot.sendMessage(
    msg.chat.id,
    `🧪 *ការសាកល្បង Secretary Mode*\n\nBot ✅ ដំណើរការបានល្អ!\n\n` +
    `🔌 Delete Detection: ${SESSION ? "✅ GramJS ភ្ជាប់ — អាចឮ deletion events" : "⚠️ SESSION_STRING មិនទាន់កំណត់"}`,
    { parse_mode: "Markdown" }
  );
  console.log(`[សាកល្បង] test by ${fromName} in chat ${msg.chat.id}`);
});

// ── Store messages from Bot polling ──────────────────────────────────────
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
  console.error(`[កំហុស] Polling: ${err.message}`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────
let isShuttingDown = false;
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[🔴 Disconnect] ទទួលបាន ${signal} — Bot កំពុងបិទ...`);
  await notifyAll(
    `🔴 *Bot លេខាធិការ — Disconnected!*\n\n` +
    `🕐 *ពេលវេលា:* ${nowKH()}\n` +
    `⚙️ *សញ្ញា:* ${signal}\n\n` +
    `_Bot ត្រូវបានបិទ ឬចាប់ផ្ដើមឡើងវិញ។_`
  );
  try { await bot.stopPolling(); } catch (_) {}
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("uncaughtException", async (err) => {
  console.error(`[កំហុស] uncaughtException: ${err.message}`);
  process.exit(1);
});

// ── Startup ───────────────────────────────────────────────────────────────
bot.getMe().then(async (me) => {
  console.log(`✅ Bot បានចាប់ផ្ដើម: @${me.username} (id: ${me.id})`);

  await bot.setMyCommands([
    { command: "start",         description: "👋 ចាប់ផ្ដើម / សារស្វាគមន៍" },
    { command: "help",          description: "📖 មើលជំនួយ និងពាក្យបញ្ជា" },
    { command: "status",        description: "📊 ស្ថានភាព Bot" },
    { command: "myid",          description: "🪪 មើល Chat ID របស់អ្នក" },
    { command: "secretary_on",  description: "🟢 បើក Secretary Mode" },
    { command: "secretary_off", description: "🔴 បិទ Secretary Mode" },
    { command: "test",          description: "🧪 សាកល្បង Secretary Mode" },
  ]);
  console.log(`📋 Command menu បានកំណត់ក្នុង Telegram ✅`);

  // Start GramJS user client
  await startUserClient();

  await notifyAll(
    `🟢 *Bot លេខាធិការ — Connected!*\n\n` +
    `🤖 *Bot:* @${me.username}\n` +
    `🕐 *ពេលវេលា:* ${nowKH()}\n` +
    `🔌 *Delete Detection:* ${SESSION ? "✅ GramJS ភ្ជាប់" : "⚠️ SESSION_STRING មិនទាន់កំណត់"}\n\n` +
    `_Bot ដំណើរការ ហើយរួចរាល់ក្នុងការតាមដាន។_`
  );
}).catch((err) => {
  console.error(`❌ មិនអាចភ្ជាប់ Bot: ${err.message}`);
  process.exit(1);
});
