import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const shameJokes = [
  "Говорят, что {username} так часто сливается с кабанов, что его уже включили в Красную книгу как исчезающий вид участника.",
  "{username} снова сливается? Наверное, думает, что «кабан» — это название нового фильма ужасов.",
  "Статистика показывает: {username} участвует в кабанах реже, чем появляются затмения солнца.",
  "{username} опять не идет? Может, стоит переименовать кабана в «встречу для всех, кроме {username}»?",
  "Если бы сливы с кабанов были олимпийским видом спорта, {username} точно получил бы золото.",
  "{username} сливается так мастерски, что даже водопроводчики завидуют его навыкам.",
  "Легенда гласит: {username} когда-то пришел на кабана, но это было так давно, что свидетели уже забыли, как он выглядит.",
  "Кабан без {username} — как борщ без сметаны: можно есть, но чего-то не хватает. Впрочем, мы привыкли.",
  "{username} настолько редко приходит на кабаны, что его фотографию уже повесили в музее как экспонат «Участник, которого мы потеряли».",
  "Если {username} когда-нибудь придет на кабана, это станет историческим событием, достойным отдельного праздника."
];

async function initDatabase() {
  try {
    console.log('🗄️ Initializing database...');

    // Add shame jokes if they don't exist
    const existingJokes = await prisma.joke.count();

    if (existingJokes === 0) {
      console.log('📝 Adding shame jokes...');

      for (const joke of shameJokes) {
        await prisma.joke.create({
          data: {
            text: joke,
            type: 'shame'
          }
        });
      }

      console.log(`✅ Added ${shameJokes.length} shame jokes to database`);
    } else {
      console.log(`📋 Database already contains ${existingJokes} jokes`);
    }

    console.log('✅ Database initialization completed');

  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  initDatabase()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { initDatabase };
