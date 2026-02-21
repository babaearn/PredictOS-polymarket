/**
 * Telegram Bot handler for PredictOS
 *
 * Features:
 * - /start   → welcome message + Open App button (Mini App)
 * - /help    → list available commands
 * - /status  → server health check
 * - Webhook handler for receiving updates from Telegram
 * - sendAlert() — used by the arb scanner cron to push alerts
 */

import TelegramBot from "node-telegram-bot-api";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MINI_APP_URL = process.env.MINI_APP_URL; // e.g. https://your-app.railway.app
const ALERT_CHAT_ID = process.env.TELEGRAM_ALERT_CHAT_ID; // optional: specific chat/channel for alerts

let bot: TelegramBot | null = null;

export function getBot(): TelegramBot {
  if (!bot) {
    if (!TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not set");
    bot = new TelegramBot(TOKEN);
  }
  return bot;
}

/**
 * Register bot commands and set up the webhook handler
 * Call this once at server startup
 */
export async function setupBot(webhookUrl: string): Promise<void> {
  const b = getBot();

  // Register webhook so Telegram sends updates to our Express server
  await b.setWebHook(`${webhookUrl}/telegram/webhook`);
  console.log(`Telegram webhook set to: ${webhookUrl}/telegram/webhook`);

  // Set commands visible in the chat menu
  await b.setMyCommands([
    { command: "start", description: "Open PredictOS" },
    { command: "help", description: "Show available commands" },
    { command: "status", description: "Server health check" },
  ]);
}

/**
 * Handle a raw Telegram update (called by the Express webhook route)
 */
export function handleUpdate(update: TelegramBot.Update): void {
  const b = getBot();
  b.processUpdate(update);
  attachHandlers(b);
}

let handlersAttached = false;

function attachHandlers(b: TelegramBot): void {
  if (handlersAttached) return;
  handlersAttached = true;

  b.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const name = msg.from?.first_name ?? "Trader";

    const opts: TelegramBot.SendMessageOptions = {
      parse_mode: "Markdown",
      reply_markup: MINI_APP_URL
        ? {
            inline_keyboard: [
              [{ text: "Open PredictOS App", web_app: { url: MINI_APP_URL } }],
            ],
          }
        : undefined,
    };

    b.sendMessage(
      chatId,
      `*Welcome to PredictOS, ${name}!* 📊\n\n` +
        `Your AI-powered prediction market terminal.\n\n` +
        `*Features:*\n` +
        `• Market Analysis (Grok / Gemini / GPT)\n` +
        `• Arbitrage Scanner (Polymarket ↔ Kalshi)\n` +
        `• Wallet Tracking\n` +
        `• Betting Bot Terminal\n\n` +
        (MINI_APP_URL ? `Tap *Open PredictOS App* to launch the full UI inside Telegram.` : `Use /help to see available commands.`),
      opts,
    );
  });

  b.onText(/\/help/, (msg) => {
    b.sendMessage(
      msg.chat.id,
      `*PredictOS Commands* 🤖\n\n` +
        `/start — Launch the app\n` +
        `/status — Check server status\n` +
        `/help — Show this message\n\n` +
        `_Arbitrage alerts are sent automatically when opportunities are detected._`,
      { parse_mode: "Markdown" },
    );
  });

  b.onText(/\/status/, (msg) => {
    b.sendMessage(
      msg.chat.id,
      `✅ *PredictOS Server Online*\n\`${new Date().toISOString()}\``,
      { parse_mode: "Markdown" },
    );
  });
}

/**
 * Send an arbitrage alert to the configured chat
 * Used by the arb scanner cron job
 */
export async function sendArbAlert(alert: {
  marketName: string;
  buyYesOn: string;
  buyNoOn: string;
  yesPrice: number;
  noPrice: number;
  profitPercent: number;
  instructions: string;
}): Promise<void> {
  const chatId = ALERT_CHAT_ID;
  if (!chatId) {
    console.warn("TELEGRAM_ALERT_CHAT_ID not set — skipping alert");
    return;
  }

  const b = getBot();

  const message =
    `🚨 *Arbitrage Opportunity Detected!*\n\n` +
    `📌 *Market:* ${alert.marketName}\n\n` +
    `🟢 Buy YES on *${alert.buyYesOn.toUpperCase()}* @ ${alert.yesPrice.toFixed(1)}¢\n` +
    `🔴 Buy NO on *${alert.buyNoOn.toUpperCase()}* @ ${alert.noPrice.toFixed(1)}¢\n\n` +
    `💰 *Expected profit: ${alert.profitPercent.toFixed(2)}%* regardless of outcome\n\n` +
    `📋 *Instructions:*\n${alert.instructions}\n\n` +
    `_Review carefully before executing. Slippage may reduce profit._`;

  await b.sendMessage(chatId, message, { parse_mode: "Markdown" });
}

/**
 * Send a plain notification message
 */
export async function sendNotification(text: string): Promise<void> {
  const chatId = ALERT_CHAT_ID;
  if (!chatId) return;
  const b = getBot();
  await b.sendMessage(chatId, text, { parse_mode: "Markdown" });
}
