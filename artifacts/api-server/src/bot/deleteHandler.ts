import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger";
import { getMessage, deleteMessage } from "./messageStore";
import { buildDeleteNotification } from "./bot";

export function setupDeleteHandler(bot: TelegramBot): void {
  bot.on("message", (msg) => {
    if (!msg.reply_to_message) return;
  });

  // Telegram sends a service message with `message_auto_delete_timer_changed`
  // but more importantly it fires a special update type for deleted messages.
  // The most reliable way with polling is to listen for the raw update.
  bot.on("message", (rawMsg) => {
    const msg = rawMsg as TelegramBot.Message & {
      pinned_message?: TelegramBot.Message;
    };

    // Handle pinned messages that reveal deleted content in some clients
    if (msg.pinned_message) {
      logger.debug({ chatId: msg.chat.id }, "Pinned message event");
    }
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
    logger.info({ chatId, messageId }, "Deleted message not in cache");
    return;
  }

  const notification = buildDeleteNotification(stored, chatId, chatTitle);

  try {
    await bot.sendMessage(chatId, notification, { parse_mode: "Markdown" });
    logger.info({ chatId, messageId, from: stored.fromName }, "Delete notification sent");
  } catch (err) {
    logger.error({ err, chatId, messageId }, "Failed to send delete notification");
  }

  deleteMessage(chatId, messageId);
}
