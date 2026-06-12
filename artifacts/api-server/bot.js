const TelegramBot = require("node-telegram-bot-api");
const http = require("http");

// HTTP server សម្រាប់ health check (ចាំបាច់ដើម្បីឱ្យ workflow ដំណើរការ)
const PORT = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("✅ Bot លេខាធិការកំពុងដំណើរការ");
});
server.listen(PORT, () => {
  console.log(`🌐 HTTP server បើក port ${PORT}`);
});

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN មិនត្រូវបានកំណត់!");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ស្តុកសាររបស់អ្នកប្រើ
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

// រក្សាទុកសារនៅពេលទទួល
bot.on("message", (msg) => {
  if (!msg.from) return;

  saveMessage({
    messageId: msg.message_id,
    chatId: msg.chat.id,
    fromId: msg.from.id,
    fromName: getDisplayName(msg.from),
    fromUsername: msg.from.username,
    text: msg.text,
    caption: msg.caption,
    mediaType: getMediaType(msg),
    date: msg.date,
  });

  // គ្រប់គ្រងពាក្យបញ្ជា
  const text = (msg.text || "").trim();

  if (text === "/start") {
    const name = getDisplayName(msg.from);
    bot.sendMessage(
      msg.chat.id,
      `👋 សួស្តី *${name}*!\n\n` +
      `ខ្ញុំជា *Bot លេខាធិការ* 🤖\n\n` +
      `ខ្ញុំតាមដានការសន្ទនា ហើយ *ជូនដំណឹងភ្លាមៗ នៅពេលណាដែលនរណាម្នាក់លប់សារ*។\n\n` +
      `✅ បន្ថែមខ្ញុំទៅក្រុម ឬប្រើប្រាស់ក្នុងការសន្ទនាឯកជន។\n` +
      `🔔 ខ្ញុំនឹងជូនដំណឹងអំពីសារដែលត្រូវបានលប់ភ្លាមៗ។\n\n` +
      `វាយ /help ដើម្បីមើលពាក្យបញ្ជា។`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (text === "/help") {
    bot.sendMessage(
      msg.chat.id,
      `*Bot លេខាធិការ — ពាក្យបញ្ជា*\n\n` +
      `/start — សារស្វាគមន៍\n` +
      `/help — មើលជំនួយ\n` +
      `/status — ស្ថានភាព Bot\n\n` +
      `*របៀបដំណើរការ:*\n` +
      `ខ្ញុំរក្សាទុកសារទាំងអស់ដែលឃើញ។ នៅពេលមានការលប់សារ ខ្ញុំនឹងស្ដារខ្លឹមសារដើម ហើយជូនដំណឹងភ្លាមៗ។\n\n` +
      `⚠️ *ចំណាំ:* ក្នុងក្រុម សូមតែងតាំងខ្ញុំជា Admin ដើម្បីឱ្យខ្ញុំដំណើរការបានល្អ។`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (text === "/status") {
    const total = messageStore.size;
    bot.sendMessage(
      msg.chat.id,
      `✅ *Bot លេខាធិការកំពុងដំណើរការ*\n\n` +
      `📦 សារក្នុងស្តុក: *${total}* សារ\n` +
      `🔔 កំពុងតាមដានការលប់សារ...`,
      { parse_mode: "Markdown" }
    );
    return;
  }
});

// រក្សាទុកនៅពេលមានការកែប្រែ
bot.on("edited_message", (msg) => {
  if (!msg.from) return;
  saveMessage({
    messageId: msg.message_id,
    chatId: msg.chat.id,
    fromId: msg.from.id,
    fromName: getDisplayName(msg.from),
    fromUsername: msg.from.username,
    text: msg.text,
    caption: msg.caption,
    mediaType: getMediaType(msg),
    date: msg.date,
  });
});

// រក្សាទុកសារ channel
bot.on("channel_post", (msg) => {
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

// ចាប់ការលប់សារ — Telegram ផ្ញើ service message ពិសេស
bot.on("message", (msg) => {
  // service message: message_auto_delete_timer_changed
  if (msg.message_auto_delete_timer_changed) {
    console.log(`[ព័ត៌មាន] ការលប់ស្វ័យប្រវត្តិត្រូវបានប្តូរ: chatId=${msg.chat.id}`);
  }
});

// ស្ដាប់ raw update ដើម្បីចាប់ deleted_message event
bot.on("raw_data", (rawData) => {
  try {
    const update = JSON.parse(rawData);

    // Telegram Bot API v6+ ផ្ញើ message_id array នៅពេលលប់
    if (update.message_reaction || update.deleted_messages) {
      const deleted = update.deleted_messages;
      if (deleted) {
        const chatId = deleted.chat.id;
        const chatTitle = deleted.chat.title;
        for (const msgId of deleted.message_ids || []) {
          handleDeletedMessage(chatId, msgId, chatTitle);
        }
      }
    }
  } catch (_) {
    // ignore parse errors
  }
});

async function handleDeletedMessage(chatId, messageId, chatTitle) {
  const stored = getStoredMessage(chatId, messageId);
  if (!stored) {
    console.log(`[ព័ត៌មាន] សារ ${messageId} មិននៅក្នុងស្តុក`);
    return;
  }

  const time = new Date(stored.date * 1000).toLocaleString("km-KH", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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
    await bot.sendMessage(chatId, notification, { parse_mode: "Markdown" });
    console.log(`[ជូនដំណឹង] សារ ${messageId} ត្រូវបានបញ្ជូន — ពី: ${stored.fromName}`);
  } catch (err) {
    console.error(`[កំហុស] មិនអាចផ្ញើការជូនដំណឹង: ${err.message}`);
  }

  removeStoredMessage(chatId, messageId);
}

bot.on("polling_error", (err) => {
  console.error(`[កំហុស] Polling: ${err.message}`);
});

bot.getMe().then((me) => {
  console.log(`✅ Bot បានចាប់ផ្ដើម: @${me.username} (id: ${me.id})`);
  console.log(`🔔 កំពុងតាមដានការលប់សារ...`);
}).catch((err) => {
  console.error(`❌ មិនអាចភ្ជាប់ Bot: ${err.message}`);
  process.exit(1);
});
