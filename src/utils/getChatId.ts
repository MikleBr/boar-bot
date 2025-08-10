import { Bot } from 'grammy';

// Temporary script to get chat ID
// Run this script and send any message to the bot in your group

const BOT_TOKEN = process.env.BOT_TOKEN || '';

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN environment variable is required');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

bot.on('message', (ctx) => {
  console.log('ctx', ctx)
  const chatId = ctx.chat.id;
  const chatType = ctx.chat.type;
  const chatTitle = 'title' in ctx.chat ? ctx.chat.title : 'N/A';

  console.log('📨 Received message:');
  console.log(`  Chat ID: ${chatId}`);
  console.log(`  Chat Type: ${chatType}`);
  console.log(`  Chat Title: ${chatTitle}`);
  console.log(`  From: ${ctx.from?.username || ctx.from?.first_name || 'Unknown'}`);
  console.log('---');

  if (chatType === 'group' || chatType === 'supergroup') {
    console.log(`🎯 Use this GROUP_CHAT_ID in your .env file: ${chatId}`);
  }
});

console.log('🤖 Bot started. Send a message in your group to get the chat ID...');
console.log('Press Ctrl+C to stop');

bot.start();
