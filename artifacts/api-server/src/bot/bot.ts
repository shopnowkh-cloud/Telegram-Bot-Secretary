import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import { saveMessage, getMessage, deleteMessage, type StoredMessage } from "./messageStore";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
}

const bot = new TelegramBot(TOKEN, { polling: true });

function getMediaType(msg: TelegramBot.Message): string | undefined {
  if (msg.photo) return "📷 Photo";
  if (msg.video) return "🎥 Video";
  if (msg.audio) return "🎵 Audio";
  if (msg.voice) return "🎤 Voice message";
  if (msg.document) return "📎 Document";
  if (msg.sticker) return "🎭 Sticker";
  if (msg.animation) return "🎞 GIF";
  if (msg.video_note) return "📹 Video note";
  if (msg.location) return "📍 Location";
  if (msg.contact) return "👤 Contact";
  if (msg.poll) return "📊 Poll";
  return undefined;
}

function getDisplayName(user: TelegramBot.User): string {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return name || user.username || `User#${user.id}`;
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
    fromName: msg.chat.title ?? "Channel",
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
    const name = msg.from ? getDisplayName(msg.from) : "there";
    bot.sendMessage(
      msg.chat.id,
      `👋 Hello, *${name}*!\n\n` +
      `I'm your *Secretary Bot* 🤖\n\n` +
      `I silently watch this chat and *notify you whenever someone deletes a message*.\n\n` +
      `✅ Just add me to any group or keep me here in this private chat.\n` +
      `🔔 I'll alert you instantly when a deleted message is detected.\n\n` +
      `Type /help to see available commands.`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (text === "/help") {
    bot.sendMessage(
      msg.chat.id,
      `*Secretary Bot — Commands*\n\n` +
      `/start — Welcome message\n` +
      `/help — Show this help\n` +
      `/status — Bot status\n\n` +
      `*How it works:*\n` +
      `I cache every message I see. When Telegram fires a delete event, I recover the original content and send you a notification instantly.`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (text === "/status") {
    bot.sendMessage(
      msg.chat.id,
      `✅ *Secretary Bot is running*\n\nI'm actively monitoring this chat for deleted messages.`,
      { parse_mode: "Markdown" }
    );
    return;
  }
});

function buildDeleteNotification(stored: StoredMessage, chatId: number, chatTitle?: string): string {
  const time = new Date(stored.date * 1000).toLocaleString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const usernameStr = stored.fromUsername ? ` (@${stored.fromUsername})` : "";
  const chatStr = chatTitle ? ` in *${chatTitle}*` : "";

  let content = "";
  if (stored.text) {
    content = `\n\n📝 *Content:*\n${stored.text}`;
  } else if (stored.caption && stored.mediaType) {
    content = `\n\n${stored.mediaType}\n📝 *Caption:* ${stored.caption}`;
  } else if (stored.mediaType) {
    content = `\n\n${stored.mediaType} _(no text)_`;
  } else {
    content = `\n\n_(unknown content)_`;
  }

  return (
    `🚨 *Deleted Message Alert!*${chatStr}\n\n` +
    `👤 *From:* ${stored.fromName}${usernameStr}\n` +
    `🕐 *Sent at:* ${time} UTC\n` +
    `🆔 *Message ID:* ${stored.messageId}` +
    content
  );
}

bot.on("polling_error", (err) => {
  logger.error({ err }, "Telegram polling error");
});

export { bot, buildDeleteNotification, getMessage, deleteMessage };
