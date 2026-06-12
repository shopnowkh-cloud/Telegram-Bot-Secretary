import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import { getMessage, deleteMessage } from "./messageStore";
import { buildDeleteNotification } from "./bot";

export function setupDeleteHandler(bot: TelegramBot): void {
  bot.on("message", (msg) => {
    if (!msg.reply_to_message) return;
  });
}

export async function handleDeletedMessage(
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  chatTitle?: string
): Promise<void> {
  const stored = getMessage(chatId, messageId);

  if (!stored) {
    logger.info({ chatId, messageId }, "សារដែលលប់មិននៅក្នុង cache");
    return;
  }

  const notification = buildDeleteNotification(stored, chatId, chatTitle);

  try {
    await bot.sendMessage(chatId, notification, { parse_mode: "Markdown" });
    logger.info({ chatId, messageId, from: stored.fromName }, "បានផ្ញើការជូនដំណឹងការលប់សារ");
  } catch (err) {
    logger.error({ err, chatId, messageId }, "បរាជ័យក្នុងការផ្ញើការជូនដំណឹង");
  }

  deleteMessage(chatId, messageId);
}
