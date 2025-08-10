import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class DatabaseService {
  // User methods
  async createOrUpdateUser(telegramId: string, username?: string, chatId?: string) {
    return await prisma.user.upsert({
      where: { telegramId },
      update: {
        username: username || undefined,
        chatId: chatId || undefined,
      },
      create: {
        telegramId,
        username: username,
        chatId: chatId || telegramId,
      },
    });
  }

  async getUser(telegramId: string) {
    return await prisma.user.findUnique({
      where: { telegramId },
    });
  }

  async getAllUsers() {
    return await prisma.user.findMany();
  }

  // Meeting methods
  async createMeeting(time: string, description: string, createdBy: string) {
    return await prisma.meeting.create({
      data: {
        time,
        description,
        createdBy,
        status: 'voting',
      },
    });
  }

  async getMeeting(id: number) {
    return await prisma.meeting.findUnique({
      where: { id },
      include: {
        votes: {
          include: {
            user: true,
          },
        },
      },
    });
  }

  async getActiveMeetings() {
    return await prisma.meeting.findMany({
      where: {
        status: 'voting',
      },
      include: {
        votes: {
          include: {
            user: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async updateMeetingStatus(id: number, status: string) {
    return await prisma.meeting.update({
      where: { id },
      data: { status },
    });
  }

  // Vote methods
  async createOrUpdateVote(userId: number, meetingId: number, vote: boolean, preference?: string) {
    return await prisma.vote.upsert({
      where: {
        userId_meetingId: {
          userId,
          meetingId,
        },
      },
      update: {
        vote,
        preference: preference || null,
      },
      create: {
        userId,
        meetingId,
        vote,
        preference: preference || null,
      },
    });
  }

  async getVote(userId: number, meetingId: number) {
    return await prisma.vote.findUnique({
      where: {
        userId_meetingId: {
          userId,
          meetingId,
        },
      },
    });
  }

  async getMeetingVotes(meetingId: number) {
    return await prisma.vote.findMany({
      where: { meetingId },
      include: {
        user: true,
      },
    });
  }

  // Joke methods
  async getRandomShameJoke() {
    const jokes = await prisma.joke.findMany({
      where: { type: 'shame' },
    });

    if (jokes.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * jokes.length);
    return jokes[randomIndex];
  }

  async getAllJokes(type?: string) {
    return await prisma.joke.findMany({
      where: type ? { type } : undefined,
    });
  }

  async addJoke(text: string, type: string = 'shame') {
    return await prisma.joke.create({
      data: { text, type },
    });
  }

  // Statistics methods
  async getUserStats(telegramId: string) {
    const user = await this.getUser(telegramId);
    if (!user) return null;

    const totalVotes = await prisma.vote.count({
      where: { userId: user.id },
    });

    const positiveVotes = await prisma.vote.count({
      where: {
        userId: user.id,
        vote: true,
      },
    });

    const negativeVotes = totalVotes - positiveVotes;
    const participationRate = totalVotes > 0 ? (positiveVotes / totalVotes) * 100 : 0;

    return {
      user,
      totalVotes,
      positiveVotes,
      negativeVotes,
      participationRate: Math.round(participationRate * 100) / 100,
    };
  }

  async disconnect() {
    await prisma.$disconnect();
  }
}

export const db = new DatabaseService();
