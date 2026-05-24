import { Client, GatewayIntentBits, ChannelType, Partials } from 'discord.js';
import puppeteer from 'puppeteer';
import 'dotenv/config';

console.log("=== DÉMARRAGE DU BOT ===");
if (!process.env.TOKEN) {
    console.error("❌ ERREUR : La variable TOKEN n'est pas détectée.");
    process.exit(1); 
}

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Channel]
});

const TARGET_URL = 'https://movix.health'; 
let lastTrackedUrl = ''; 

// On crée une variable globale pour garder l'ID du salon AFK en mémoire cache
let savedAfkChannelId = null;

// --- FONCTION DE TRACKING MOVIX ---
async function checkMovixUrl() {
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(resolve => setTimeout(resolve, 5000));

        const pageContent = await page.content();
        await browser.close();

        const matches = pageContent.match(/https?:\/\/[a-zA-Z0-9.-]*movix\.[a-zA-Z0-9-]+/gi);
        let currentUrl = '';

        if (matches) {
            const cleanUrls = matches.map(url => url.toLowerCase()).filter(url => !url.includes('movix.health'));
            if (cleanUrls.length > 0) currentUrl = cleanUrls[0];
        }

        if (!currentUrl) return;
        currentUrl = currentUrl.replace(/['"; ]+$/, '');

        if (currentUrl !== lastTrackedUrl) {
            const channel = await client.channels.fetch(process.env.CHANNEL).catch(() => null);
            if (channel) {
                await channel.send(`🚨 **Mise à jour de l'adresse Movix !**\nLe nouveau domaine actif est disponible ici : ${currentUrl}`);
                lastTrackedUrl = currentUrl; 
            }
        }
    } catch (error) {
        if (browser) await browser.close();
    }
}

// === SÉCURITÉ ANTI-SUPPRESSION SALON AFK ===
client.on('channelDelete', async (channel) => {
    console.log(`\n[SUPPRESSION] Salon supprimé : ${channel.name} (${channel.id})`);
    
    // On compare l'ID supprimé avec l'ID qu'on avait sauvegardé en mémoire
    if (channel.id === savedAfkChannelId) {
        console.log(`🎯 Le salon AFK a été supprimé ! Lancement de la restauration automatique...`);

        try {
            const guild = channel.guild;
            
            // 1. Recréer le salon vocal
            const newAfkChannel = await guild.channels.create({
                name: channel.name || 'afk',
                type: ChannelType.GuildVoice,
                parent: channel.parentId,
                reason: 'Récréation automatique du salon AFK'
            });

            console.log(`✅ Nouveau salon vocal créé.`);

            // 2. Le réassigner comme salon AFK officiel du serveur (Timeout: 5 min)
            await guild.edit({
                afkChannel: newAfkChannel,
                afkTimeout: 300 
            });

            // 3. IMPORTANT : On met à jour notre variable avec le NOUVEL ID du salon créé
            savedAfkChannelId = newAfkChannel.id;
            console.log(`⚙️ Serveur reconfiguré. Nouvel ID AFK sauvegardé : ${savedAfkChannelId}`);

        } catch (error) {
            console.error("❌ Erreur pendant la reconstruction :", error.message);
        }
    }
});

// Utilisation de clientReady recommandé par le message d'avertissement de l'image_651dea.png
client.once('clientReady', async () => {
    console.log(`🤖 Bot connecté en tant que : ${client.user.tag}`);
    
    // Au démarrage, on va chercher l'ID du salon AFK et on le garde précieusement en mémoire
    client.guilds.cache.forEach((guild) => {
        if (guild.afkChannelId) {
            savedAfkChannelId = guild.afkChannelId;
            console.log(`💾 ID AFK sauvegardé au démarrage : ${savedAfkChannelId} (Serveur: ${guild.name})`);
        } else {
            console.log(`⚠️ Attention : Aucun salon AFK n'est configuré dans les options de Discord pour le serveur "${guild.name}".`);
        }
    });

    checkMovixUrl();
    setInterval(checkMovixUrl, 1800000); 
});

client.login(process.env.TOKEN);