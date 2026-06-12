import { Router } from "express";
import { type Request, type Response } from "express";
import { handleDeletedMessage } from "../bot/deleteHandler";

const router = Router();

// This endpoint can be called externally or via Telegram webhook
// to report a deleted message by chatId + messageId
router.post("/api/telegram/deleted", async (req: Request, res: Response) => {
  const { chatId, messageId, chatTitle } = req.body as {
    chatId?: number;
    messageId?: number;
    chatTitle?: string;
  };

  if (!chatId || !messageId) {
    res.status(400).json({ error: "chatId and messageId are required" });
    return;
  }

  // Lazy-load bot to avoid circular imports
  const { bot } = await import("../bot/bot");
  await handleDeletedMessage(bot, Number(chatId), Number(messageId), chatTitle);

  res.json({ ok: true });
});

export default router;
