import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import { saveMessage, getMessage, deleteMessage, type StoredMessage } from "./messageStore";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
}

const bot = new TelegramBot(TOKEN, { polling: true });

function getMediaType(msg: TelegramBot.Message): string | undefined {
  if (msg.photo) return "📷 រូបភាព";
  if (msg.video) return "🎥 វីដេអូ";
  if (msg.audio) return "🎵 ឯកសារសំឡេង";
  if (msg.voice) return "🎤 សារសំឡេង";
  if (msg.document) return "📎 ឯកសារ";
  if (msg.sticker) return "🎭 រូបតំណាង";
  if (msg.animation) return "🎞 GIF";
  if (msg.video_note) return "📹 វីដេអូចំណាំ";
  if (msg.location) return "📍 ទីតាំង";
  if (msg.contact) return "👤 ទំនាក់ទំនង";
  if (msg.poll) return "📊 បោះឆ្នោត";
  return undefined;
}

function getDisplayName(user: TelegramBot.User): string {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return name || user.username || `អ្នកប្រើ#${user.id}`;
}

bot.on("message", (msg) => {
  if (!msg.from) return;

  const stored: StoredMessage = {
    messageId: msg.message_id,
    chatId: msg.chat.id,
    fromId: msg.from.id,
    fromName: getDisplayName(msg.from),
    fromUsername: msg.from.username,
    text: msg.text,
    caption: msg.caption,
    mediaType: getMediaType(msg),
    date: msg.date,
  };

  saveMessage(stored);
  logger.debug({ chatId: msg.chat.id, messageId: msg.message_id }, "Message stored");
});

bot.on("edited_message", (msg) => {
  if (!msg.from) return;

  const stored: StoredMessage = {
    messageId: msg.message_id,
    chatId: msg.chat.id,
    fromId: msg.from.id,
    fromName: getDisplayName(msg.from),
    fromUsername: msg.from.username,
    text: msg.text,
    caption: msg.caption,
    mediaType: getMediaType(msg),
    date: msg.date,
  };

  saveMessage(stored);
  logger.debug({ chatId: msg.chat.id, messageId: msg.message_id }, "Edited message updated in store");
});

bot.on("channel_post", (msg) => {
  const stored: StoredMessage = {
    messageId: msg.message_id,
    chatId: msg.chat.id,
    fromId: msg.chat.id,
    fromName: msg.chat.title ?? "ឆានែល",
    text: msg.text,
    caption: msg.caption,
    mediaType: getMediaType(msg),
    date: msg.date,
  };

  saveMessage(stored);
});

bot.on("message", (msg) => {
  if (!msg.text) return;
  const text = msg.text.trim();

  if (text === "/start") {
    const name = msg.from ? getDisplayName(msg.from) : "មិត្ត";
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
      `ខ្ញុំរក្សាទុកសារទាំងអស់ដែលឃើញ។ នៅពេលមានការលប់សារ ខ្ញុំនឹងស្ដារខ្លឹមសារដើម ហើយជូនដំណឹងភ្លាមៗ។`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (text === "/status") {
    bot.sendMessage(
      msg.chat.id,
      `✅ *Bot លេខាធិការកំពុងដំណើរការ*\n\nខ្ញុំកំពុងតាមដានការសន្ទនានេះ ដើម្បីស្វែងរកការលប់សារ។`,
      { parse_mode: "Markdown" }
    );
    return;
  }
});

function buildDeleteNotification(stored: StoredMessage, chatId: number, chatTitle?: string): string {
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

  return (
    `🚨 *ការជូនដំណឹង — សារត្រូវបានលប់!*${chatStr}\n\n` +
    `👤 *ពី:* ${stored.fromName}${usernameStr}\n` +
    `🕐 *បានផ្ញើ:* ${time}\n` +
    `🆔 *លេខសារ:* ${stored.messageId}` +
    content
  );
}

bot.on("polling_error", (err) => {
  logger.error({ err }, "Telegram polling error");
});

export { bot, buildDeleteNotification, getMessage, deleteMessage };
