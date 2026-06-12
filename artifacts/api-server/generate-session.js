const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

if (!apiId || !apiHash) {
  console.error("❌ TELEGRAM_API_ID ឬ TELEGRAM_API_HASH មិនត្រូវបានកំណត់!");
  process.exit(1);
}

(async () => {
  console.log("🔐 Telegram Session Generator");
  console.log("================================");

  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text("📱 បញ្ចូលលេខទូរស័ព្ទ (ឧ: +855xxxxxxxxx): "),
    password: async () => await input.text("🔑 បញ្ចូល 2FA Password (ចុច Enter បើគ្មាន): "),
    phoneCode: async () => await input.text("📩 បញ្ចូល OTP Code ពី Telegram: "),
    onError: (err) => console.error("❌ Error:", err.message),
  });

  const sessionString = client.session.save();

  console.log("\n✅ Session បានបង្កើតដោយជោគជ័យ!");
  console.log("=====================================");
  console.log("SESSION_STRING=");
  console.log(sessionString);
  console.log("=====================================");
  console.log("\n📋 ចម្លង SESSION_STRING ខាងលើ ហើយបញ្ចូលទៅ Replit Secrets");

  await client.disconnect();
  process.exit(0);
})();
