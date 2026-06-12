import { logger } from "../lib/logger";

export function startBot(): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not set — Telegram bot will not start");
    return;
  }

  try {
    // Dynamically import to avoid crashing the server if token is missing
    import("./bot").then(({ bot }) => {
      logger.info("Telegram Secretary Bot started (polling)");

      bot.getMe().then((me) => {
        logger.info({ username: me.username, id: me.id }, "Bot identity confirmed");
      }).catch((err) => {
        logger.error({ err }, "Failed to get bot identity");
      });
    }).catch((err) => {
      logger.error({ err }, "Failed to load bot module");
    });
  } catch (err) {
    logger.error({ err }, "Failed to start Telegram bot");
  }
}
