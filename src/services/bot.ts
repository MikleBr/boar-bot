import { Bot, Context, InlineKeyboard, webhookCallback } from 'grammy';
import { DatabaseService } from './database';

const db = new DatabaseService();

export class BotService {
  private bot: Bot;
  private groupChatId: string;

  constructor(token: string, groupChatId: string) {
    this.bot = new Bot(token);
    this.groupChatId = groupChatId;
    this.setupHandlers();
  }

  private setupHandlers() {
    this.bot.use(async (ctx, next) => {
      if (!ctx.from) return ctx.reply('Как ты это сделал?');

      const isMessagePrivate = ctx.chat?.type === 'private';

      const user = await db.getUser(String(ctx.from.id));

      const isUserRegistered = user !== null;

      const isKabanCommand = ctx.message?.text?.startsWith('/kaban');

      if (isKabanCommand && isUserRegistered){
         await next();
      } else {
        // try to call command from group
        if (!isMessagePrivate){
          return ctx.reply('Нахуй ты меня в чате пингуешь');
        }

        const isStartCommand = ctx.message?.text?.startsWith('/start');
        // try to call unregistered
        if (!user && !isStartCommand) {
          return ctx.reply('Пошел в пизду! Тут серьезные люди пароль поставили');
        }

        await next();

      }
    });

    this.bot.command('start', async (ctx) => {
      const password = ctx.message?.text?.split(' ')[1];
      if (!password) {
        await ctx.reply('А пароль то знать надо');
        return;
      }
      if (password !== process.env.BOT_PASSWORD){
        await ctx.reply('Гондонам вход запрещен');
        return;
      }
      await this.handleStart(ctx);
    });

    // Create meeting command
    this.bot.command('kaban', async (ctx) => {
      await this.handleCreateMeeting(ctx);
    });

    // Stats command
    this.bot.command('stats', async (ctx) => {
      await this.handleStats(ctx);
    });

    this.bot.command('meetings', async (ctx) => {
      await this.handleActiveMeetings(ctx);
    });

    this.bot.on('callback_query', async (ctx) => {
      const callbackData = ctx.callbackQuery?.data;
      if (!callbackData) return;

      const actionType = callbackData.split('/')[0];
      const actionPayload = callbackData.split('/')[1];
      switch (actionType) {
        case 'vote':
          await this.handleVoting(actionPayload, ctx);
          break;
        case 'meeting':
          await this.handleMeetingButtonCallback(actionPayload, ctx);
          break;
      }
    });

    // Error handler
    this.bot.catch((err) => {
      console.error('Bot error:', err);
    });
  }

  // payload type ${meeting.id}_[end|cancel]
  private async handleMeetingButtonCallback(actionPayload: string, ctx: Context) {
    const [meetingIdString, action] = actionPayload.split('_');
    const meetingId = Number(meetingIdString);
    const meeting = await db.getMeeting(meetingId);

    if (!meeting || !action) return;

    const user = ctx.from;
    if (!user) return;

    try {
        const meeting = await db.getMeeting(meetingId);
        if (!meeting) {
          await ctx.reply('❌ Встреча с таким ID не найдена!');
          return;
        }

        if (meeting.status !== 'voting') {
          await ctx.reply('❌ Голосование по этой встрече уже завершено!');
          return;
        }

        // Check if user is the creator or admin (you can add admin check here)
        if (meeting.createdBy !== user.id.toString()) {
          await ctx.reply('❌ Только создатель встречи может завершить голосование!');
          return;
        }

        if (action === 'end') {
          await this.sendFinalSummary(meetingId, 'ended');
          await ctx.reply(`✅ Голосование по встрече "${meeting.description}" завершено! Итоги отправлены в группу.`);
        }

        if (action === 'cancel') {
          await this.sendFinalSummary(meetingId, 'cancelled');
          await ctx.reply(`❌ Кабан в "${meeting.time}" отменен!`);
        }

    } catch (error) {
      console.error('Error finishing voting:', error);
      await ctx.reply('❌ Ошибка при завершении голосования.');
    }
  }

  private async handleStart(ctx: Context) {
    const user = ctx.from;
    if (!user) return;

    await db.createOrUpdateUser(
      user.id.toString(),
      user.username,
      ctx.chat?.id.toString()
    );

    const welcomeMessage = `
🐗 Привет! Я бот Кабан!

Я помогу организовать встречи и собрать статистику участия.

Команды:
/kaban <время> <описание> - создать встречу
/meetings - показать активные встречи
/stats - показать статистику участия

Пример: /kaban 19:00 ВПН шоп
    `;

    await ctx.reply(welcomeMessage.trim());
  }

  private async handleCreateMeeting(ctx: Context) {
    const telegramUser = ctx.from;
    if (!telegramUser) return;

    // Ensure user exists in database
    const user = await db.getUser(telegramUser.id.toString());

    if (!user) {
      await ctx.reply('Зарегестрируйся, умник');
      return;
    }

    const args = ctx.message?.text?.split(' ').slice(1);
    if (!args || args.length < 2) {
      await ctx.reply(
        '❌ Неправильный формат команды!\n\n' +
        'Используй: /kaban <время> <описание>\n' +
        'Пример: /kaban 19:00 Финский'
      );
      return;
    }

    const time = args[0];
    const description = args.slice(1).join(' ');

    // Validate time format (HH:MM)
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      await ctx.reply('❌ Неправильный формат времени! Используй HH:MM (например, 19:00)');
      return;
    }

    try {
      // Create meeting
      const meeting = await db.createMeeting(time, description, telegramUser.id.toString());

      const keyboard = new InlineKeyboard()
        .text('Завершить', `meeting/${meeting.id}_end`)
        .text('Отменить', `meeting/${meeting.id}_cancel`);
      const isMessagePrivate = ctx.chat?.type === 'private';

      if (isMessagePrivate) {
        await ctx.reply(
          `✅ Кабан создан! Уведомление отправлено в группу.`,
          {
            reply_to_message_id: ctx.message?.message_id,
            reply_markup: keyboard
          }
        )
      } else {
        await ctx.api.sendMessage(
          user.chatId,
          `✅ Кабан создан! Уведомление отправлено в группу.`,
          {  reply_to_message_id: ctx.message?.message_id, reply_markup: keyboard }
        )
      }

      const commonMeetingMessage = `🐗 Покабанимся в ${time}? Предлагает @${telegramUser.username || telegramUser.first_name}\n📝 ${description}`;

      await Promise.all([
        await this.bot.api.sendMessage(
          this.groupChatId,
          `${commonMeetingMessage.trim()}.\n\nОтмечайтесь в личке 🐗`,
        ),
        await this.notifyAllUsers(meeting.id, commonMeetingMessage.trim()),
      ]);

    } catch (error) {
      console.error('Error creating meeting:', error);
      await ctx.reply('❌ Ошибка при создании встречи. Попробуй еще раз.');
    }
  }

  private async handleStats(ctx: Context) {
    const user = ctx.from;
    if (!user) return;

    try {
      const stats = await db.getUserStats(user.id.toString());

      if (!stats) {
        await ctx.reply('❌ Статистика не найдена. Сначала проголосуй за какую-нибудь встречу!');
        return;
      }

      const statsMessage = `
📊 Твоя статистика участия:

👤 Пользователь: @${user.username || user.first_name}
🗳️ Всего голосований: ${stats.totalVotes}
✅ Участвовал: ${stats.positiveVotes}
❌ Сливал: ${stats.negativeVotes}
📈 Процент участия: ${stats.participationRate}%

${stats.participationRate < 50 ? '🙈 Слишком часто сливаешься!' : '🎉 Отличная активность!'}
      `;

      await ctx.reply(statsMessage.trim());
    } catch (error) {
      console.error('Error getting stats:', error);
      await ctx.reply('❌ Ошибка при получении статистики.');
    }
  }

  private async handleActiveMeetings(ctx: Context) {
    try {
      const meetings = await db.getActiveMeetings();

      if (meetings.length === 0) {
        await ctx.reply('📋 Нет активных встреч');
        return;
      }

      let message = '📋 Активные встречи:\n\n';

      for (const meeting of meetings) {
        const participants = meeting.votes.filter(v => v.vote === true);
        const declined = meeting.votes.filter(v => v.vote === false);

        message += `🐗 ID: ${meeting.id}\n`;
        message += `⏰ Время: ${meeting.time}\n`;
        message += `📝 Описание: ${meeting.description}\n`;
        message += `✅ Участвуют (${participants.length}): ${participants.map(v => '@' + (v.user.username || 'unknown')).join(', ') || 'никто'}\n`;
        message += `❌ Сливают (${declined.length}): ${declined.map(v => '@' + (v.user.username || 'unknown')).join(', ') || 'никто'}\n\n`;
      }

      await ctx.reply(message.trim());
    } catch (error) {
      console.error('Error getting active meetings:', error);
      await ctx.reply('❌ Ошибка при получении списка встреч.');
    }
  }

  private async handleVoting(payload: string, ctx: Context) {
    const user = ctx.from;

    if (!user) return;

    const [vote, meetingIdStr] = payload.split('_');

    const meetingId = parseInt(meetingIdStr);
    const voteValue = vote === 'yes';

    try {
      // Ensure user exists
      const dbUser = await db.createOrUpdateUser(
        user.id.toString(),
        user.username,
        ctx.chat?.id.toString()
      );

      // Record vote
      await db.createOrUpdateVote(dbUser.id, meetingId, voteValue);

      // Get meeting details
      const meeting = await db.getMeeting(meetingId);
      if (!meeting) {
        await ctx.answerCallbackQuery('❌ Встреча не найдена');
        return;
      }

      const voteText = voteValue ? `В ${meeting.time} снюхаемся` : 'Да и пошел ты нахуй ;)';
      await ctx.answerCallbackQuery(voteText);

      if (voteValue){
        await this.bot.api.sendMessage(this.groupChatId, `✅ @${user.username || user.first_name} идет на кабана в ${meeting.time}`);
      } else {
        const joke = await db.getRandomShameJoke();
        if (joke) {
          const shameText = joke.text.replace(/{username}/g, user.first_name);
          const fullText = `❌ @${user.username || user.first_name} сливается с кабана\n\n${shameText}`;
          await this.bot.api.sendMessage(this.groupChatId, `${fullText}`);
        }
      }
    } catch (error) {
      console.error('Error handling vote:', error);
      await ctx.answerCallbackQuery('❌ Ошибка при записи голоса');
    }
  }

  private async notifyAllUsers(meetingId: number, message: string) {
    try {
      const users = await db.getAllUsers();

      for (const user of users) {
        if (user.chatId) {
          try {
            // Create voting keyboard
            const keyboard = new InlineKeyboard()
              .text('✅ Участвую', `vote/yes_${meetingId}_`)
              .text('❌ Сливаю', `vote/no_${meetingId}`);

            await this.bot.api.sendMessage(
              user.chatId,
              `${message}\n\nТы идешь?`,
              { reply_markup: keyboard }
            );
          } catch (error) {
            console.error(`Failed to send message to user ${user.telegramId}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error notifying users:', error);
    }
  }

  async sendFinalSummary(meetingId: number, resolution: string) {
    try {
      const meeting = await db.getMeeting(meetingId);
      if (!meeting) return;

      const participants = meeting.votes.filter(v => v.vote === true);
      const declined = meeting.votes.filter(v => v.vote === false);

      let summaryMessage = resolution === 'ended' ? `🏁 Итоги кабана в ${meeting.time}` : `❌ Кабан в ${meeting.time} отменен`;
      summaryMessage += `📝 Описание: ${meeting.description}\n\n`;

      if (participants.length > 0 && resolution === 'ended') {
        summaryMessage += `✅ Участвуют (${participants.length}):\n`;
        participants.forEach(v => {
          summaryMessage += `• @${v.user.username || 'unknown'}\n`;
        });
        summaryMessage += '\n';
      }

      if (declined.length > 0) {
        summaryMessage += `❌ Слиты (${declined.length}):\n`;
        declined.forEach(v => {
          summaryMessage += `• @${v.user.username || 'unknown'}\n`;
        });
        summaryMessage += '\n';

        // Add shame for those who declined
        summaryMessage += `Общепризнанные пидорасы:\n`;
        for (const vote of declined) {
          const joke = await db.getRandomShameJoke();
          if (joke) {
            const shameText = joke.text.replace(/{username}/g, vote.user.username || 'unknown');
            summaryMessage += `• ${shameText}\n`;
          }
        }
      }

      await this.bot.api.sendMessage(this.groupChatId, summaryMessage);

      // Update meeting status
      await db.updateMeetingStatus(meetingId, 'completed');

    } catch (error) {
      console.error('Error sending final summary:', error);
    }
  }

  // Получаем webhook callback для обработки обновлений
  getWebhookCallback() {
    return webhookCallback(this.bot, 'hono');
  }

  // Устанавливаем веб-хук
  async setWebhook(webhookUrl: string) {
    try {
      await this.bot.api.setWebhook(webhookUrl, {
        secret_token: process.env.WEBHOOK_SECRET,
      });
      console.log(`✅ Webhook установлен: ${webhookUrl}`);
    } catch (error) {
      console.error('❌ Ошибка установки webhook:', error);
      throw error;
    }
  }

  // Удаляем веб-хук
  async deleteWebhook() {
    try {
      await this.bot.api.deleteWebhook();
      console.log('✅ Webhook удален');
    } catch (error) {
      console.error('❌ Ошибка удаления webhook:', error);
      throw error;
    }
  }

  // Получаем информацию о веб-хуке
  async getWebhookInfo() {
    try {
      const info = await this.bot.api.getWebhookInfo();
      console.log('📊 Информация о webhook:', info);
      return info;
    } catch (error) {
      console.error('❌ Ошибка получения информации о webhook:', error);
      throw error;
    }
  }

  // Получаем информацию о боте
  async getBotInfo() {
    try {
      const me = await this.bot.api.getMe();
      console.log('🤖 Информация о боте:', me);
      return me;
    } catch (error) {
      console.error('❌ Ошибка получения информации о боте:', error);
      throw error;
    }
  }

  // Для веб-хуков не нужны start/stop, но оставляем для совместимости
  start() {
    console.log('🐗 Boar bot готов к работе через webhooks!');
  }

  stop() {
    console.log('🐗 Boar bot остановлен');
  }
}
