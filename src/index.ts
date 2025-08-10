import { Hono } from 'hono';
import { BotService } from './services/bot';
import { initDatabase } from './database/init';

// Environment variables
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID || '';
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const PORT = process.env.PORT || 5005;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN environment variable is required');
  process.exit(1);
}

if (!GROUP_CHAT_ID) {
  console.error('❌ GROUP_CHAT_ID environment variable is required');
  process.exit(1);
}

// Initialize Hono app
const app = new Hono();

// Bot service instance
let botService: BotService;

// Health check endpoint
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    message: 'Boar Bot is running!',
    timestamp: new Date().toISOString()
  });
});

// Bot status endpoint
app.get('/status', async (c) => {
  try {
    const webhookInfo = await botService.getWebhookInfo();
    const botInfo = await botService.getBotInfo();

    return c.json({
      bot: 'Кабан',
      status: 'active',
      mode: 'webhook',
      webhook: {
        url: webhookInfo.url,
        has_custom_certificate: webhookInfo.has_custom_certificate,
        pending_update_count: webhookInfo.pending_update_count,
        last_error_date: webhookInfo.last_error_date,
        last_error_message: webhookInfo.last_error_message,
        max_connections: webhookInfo.max_connections,
        allowed_updates: webhookInfo.allowed_updates
      },
      bot_info: {
        id: botInfo.id,
        username: botInfo.username,
        first_name: botInfo.first_name,
        can_join_groups: botInfo.can_join_groups,
        can_read_all_group_messages: botInfo.can_read_all_group_messages,
        supports_inline_queries: botInfo.supports_inline_queries
      }
    });
  } catch (error) {
    return c.json({
      bot: 'Кабан',
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Webhook endpoint for Telegram updates
app.post('/webhook', async (c) => {
  try {
    // Проверяем секретный токен если он установлен
    // if (WEBHOOK_SECRET) {
    //   const secretHeader = c.req.header('X-Telegram-Bot-Api-Secret-Token');
    //   if (secretHeader !== WEBHOOK_SECRET) {
    //     console.warn('❌ Неверный секретный токен webhook');
    //     return c.text('Unauthorized', 401);
    //   }
    // }

    // Получаем webhook callback и передаем ему контекст Hono
    const webhookCallback = botService.getWebhookCallback();
    return await webhookCallback(c);
  } catch (error) {
    console.error('❌ Ошибка обработки webhook:', error);
    return c.text('Internal Server Error', 500);
  }
});

// Endpoint для установки webhook
app.post('/webhook/set', async (c) => {
  try {
    const webhookUrl = WEBHOOK_URL || `https://${c.req.header('host')}/webhook`;
    await botService.setWebhook(webhookUrl);

    return c.json({
      success: true,
      message: 'Webhook установлен успешно',
      webhook_url: webhookUrl
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Endpoint для удаления webhook
app.post('/webhook/delete', async (c) => {
  try {
    await botService.deleteWebhook();

    return c.json({
      success: true,
      message: 'Webhook удален успешно'
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Endpoint для получения информации о webhook
app.get('/webhook/info', async (c) => {
  try {
    const info = await botService.getWebhookInfo();
    return c.json(info);
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

async function startApplication() {
  try {
    console.log('🚀 Starting Boar Bot application...');

    // Initialize database
    await initDatabase();

    // Create bot service
    botService = new BotService(BOT_TOKEN, GROUP_CHAT_ID);

    // Start bot (готовим к работе)
    botService.start();

    // Автоматически устанавливаем webhook если указан WEBHOOK_URL
    if (WEBHOOK_URL) {
      try {
        await botService.setWebhook(WEBHOOK_URL);
        console.log(`✅ Webhook автоматически установлен: ${WEBHOOK_URL}`);
      } catch (error) {
        console.warn('⚠️ Не удалось автоматически установить webhook:', error);
        console.log('💡 Используйте POST /webhook/set для ручной установки');
      }
    } else {
      console.log('💡 WEBHOOK_URL не указан. Используйте POST /webhook/set для установки webhook');
    }

    console.log('✅ Bot готов к работе через webhooks');
    console.log(`🌐 HTTP server running on port ${PORT}`);
    console.log(`📡 Webhook endpoint: /webhook`);
    console.log(`🔧 Management endpoints:`);
    console.log(`   POST /webhook/set - установить webhook`);
    console.log(`   POST /webhook/delete - удалить webhook`);
    console.log(`   GET /webhook/info - информация о webhook`);
    console.log(`   GET /status - статус бота`);

  } catch (error) {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  if (botService) {
    try {
      // При желании можно удалить webhook при остановке
      // await botService.deleteWebhook();
      botService.stop();
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  if (botService) {
    try {
      // При желании можно удалить webhook при остановке
      // await botService.deleteWebhook();
      botService.stop();
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }
  process.exit(0);
});

// Start the application
startApplication();

export default {
  port: PORT,
  fetch: app.fetch,
};
