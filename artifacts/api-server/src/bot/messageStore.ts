interface StoredMessage {
  messageId: number;
  chatId: number;
  fromId: number;
  fromName: string;
  fromUsername?: string;
  text?: string;
  caption?: string;
  mediaType?: string;
  date: number;
}

const store = new Map<string, StoredMessage>();

const MAX_MESSAGES = 10000;

function key(chatId: number, messageId: number): string {
  return `${chatId}:${messageId}`;
}

export function saveMessage(msg: StoredMessage): void {
  if (store.size >= MAX_MESSAGES) {
    const firstKey = store.keys().next().value;
    if (firstKey) store.delete(firstKey);
  }
  store.set(key(msg.chatId, msg.messageId), msg);
}

export function getMessage(chatId: number, messageId: number): StoredMessage | undefined {
  return store.get(key(chatId, messageId));
}

export function deleteMessage(chatId: number, messageId: number): void {
  store.delete(key(chatId, messageId));
}

export type { StoredMessage };
