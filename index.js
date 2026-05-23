const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Events,
    EmbedBuilder
} = require('discord.js');

const Database = require('better-sqlite3');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const db = new Database('./database.sqlite');

db.prepare(`
CREATE TABLE IF NOT EXISTS users (
    userId TEXT PRIMARY KEY,
    username TEXT,
    totalTime INTEGER DEFAULT 0,
    startTime INTEGER DEFAULT 0,
    active INTEGER DEFAULT 0
)
`).run();

client.once(Events.ClientReady, () => {
    console.log(`Bot přihlášen jako ${client.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {

    if (message.author.bot) return;

    if (message.content === '!panel') {

        const row = new ActionRowBuilder().addComponents(

            new ButtonBuilder()
                .setCustomId('online')
                .setLabel('🟢 Online')
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId('offline')
                .setLabel('🔴 Offline')
                .setStyle(ButtonStyle.Danger),

            new ButtonBuilder()
                .setCustomId('leaderboard')
                .setLabel('🏆 TOP 10')
                .setStyle(ButtonStyle.Primary)
        );

        await message.channel.send({
            content: 'Status panel',
            components: [row]
        });
    }
});

client.on(Events.InteractionCreate, async (interaction) => {

    if (!interaction.isButton()) return;

    const member = interaction.member;

    if (!member || !member.voice) {

        return interaction.reply({
            content: '❌ Nepodařilo se načíst voice.',
            ephemeral: true
        });
    }

    const voiceChannel = member.voice.channel;

    if (!voiceChannel && interaction.customId !== 'leaderboard') {

        return interaction.reply({
            content: '❌ Musíš být ve voice roomce.',
            ephemeral: true
        });
    }

    // ONLINE
    if (interaction.customId === 'online') {

        const row = db
            .prepare('SELECT * FROM users WHERE userId = ?')
            .get(member.id);

        const now = Math.floor(Date.now() / 1000);

        if (row && row.active === 1) {

            return interaction.reply({
                content: '⏳ Timer už běží.',
                ephemeral: true
            });
        }

        db.prepare(`
            INSERT OR REPLACE INTO users
            (userId, username, totalTime, startTime, active)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            member.id,
            member.user.username,
            row ? row.totalTime : 0,
            now,
            1
        );

        return interaction.reply({
            content: '🟢 Timer zapnut.',
            ephemeral: true
        });
    }

    // OFFLINE
    if (interaction.customId === 'offline') {

        const row = db
            .prepare('SELECT * FROM users WHERE userId = ?')
            .get(member.id);

        if (!row || row.active === 0) {

            return interaction.reply({
                content: '❌ Timer neběží.',
                ephemeral: true
            });
        }

        const now = Math.floor(Date.now() / 1000);
        const sessionTime = now - row.startTime;
        const newTotal = row.totalTime + sessionTime;

        db.prepare(`
            UPDATE users
            SET totalTime = ?, active = 0, startTime = 0
            WHERE userId = ?
        `).run(newTotal, member.id);

        return interaction.reply({
            content: `🔴 Timer vypnut. Přidáno ${formatTime(sessionTime)}`,
            ephemeral: true
        });
    }

    // LEADERBOARD
    if (interaction.customId === 'leaderboard') {

        const rows = db.prepare(`
            SELECT * FROM users
            ORDER BY totalTime DESC
            LIMIT 10
        `).all();

        if (!rows.length) {

            return interaction.reply({
                content: 'Žádná data.',
                ephemeral: true
            });
        }

        let text = '';

        rows.forEach((user, index) => {
            text += `${index + 1}. ${user.username} - ${formatTime(user.totalTime)}\n`;
        });

        const embed = new EmbedBuilder()
            .setTitle('🏆 TOP 10')
            .setDescription(text);

        return interaction.reply({
            embeds: [embed]
        });
    }
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {

    if (oldState.channel && !newState.channel) {

        const userId = oldState.member.id;

        const row = db
            .prepare('SELECT * FROM users WHERE userId = ?')
            .get(userId);

        if (!row || row.active === 0) return;

        const now = Math.floor(Date.now() / 1000);
        const sessionTime = now - row.startTime;
        const newTotal = row.totalTime + sessionTime;

        db.prepare(`
            UPDATE users
            SET totalTime = ?, active = 0, startTime = 0
            WHERE userId = ?
        `).run(newTotal, userId);

        console.log(`${oldState.member.user.username} automaticky odpojen.`);
    }
});

function formatTime(seconds) {

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    return `${h}h ${m}m ${s}s`;
}

client.login(process.env.TOKEN);