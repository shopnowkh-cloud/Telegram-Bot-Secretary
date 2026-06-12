# Bot លេខាធិការ (Secretary Bot)

Bot Telegram សម្រាប់ជូនដំណឹងនៅពេលណាដែលនរណាម្នាក់លប់សារ។

## ឯកសារ

```
artifacts/api-server/
└── bot.js          ← ឯកសារ Bot តែមួយ (JavaScript)
```

## ដំណើរការ

```
node artifacts/api-server/bot.js
```

## Environment Variables

- `TELEGRAM_BOT_TOKEN` — Token ពី @BotFather

## ពាក្យបញ្ជា

- `/start` — ចាប់ផ្ដើម
- `/help` — ជំនួយ
- `/status` — ស្ថានភាព Bot
- `/secretary on` — បើក Secretary Mode
- `/secretary off` — បិទ Secretary Mode
- `/test` — សាកល្បង
