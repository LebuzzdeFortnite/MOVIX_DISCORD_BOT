import { Client, GatewayIntentBits, ChannelType, Partials } from "discord.js";
import puppeteer from "puppeteer";
import "dotenv/config";

console.log("=== DÉMARRAGE DU BOT ===");
if (!process.env.TOKEN) {
  console.error("❌ ERREUR : La variable TOKEN n'est pas détectée.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  partials: [Partials.Channel],
});

// Configuration de la surveillance
const TARGET_URL = "https://movix.online/";
let lastTrackedUrl = "";
let savedAfkChannelId = null;

// --- FONCTION DE TRACKING MOVIX (COMPATIBLE SERVEUR SANS INTERFACE) ---
async function checkMovixUrl() {
  let browser;
  try {
    console.log("\n[🔍 PUPPETEER] Lancement du navigateur en mode serveur...");

    browser = await puppeteer.launch({
      headless: "shell", // Évite l'erreur "Missing X server" sur les VPS Linux
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled", // Masque l'empreinte du bot
        "--ignore-certificate-errors",
      ],
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );

    console.log(`[🔍 PUPPETEER] Connexion à l'adresse cible : ${TARGET_URL}...`);
    await page.goto(TARGET_URL, { waitUntil: "networkidle2", timeout: 60000 });

    console.log("[🔍 PUPPETEER] Attente du chargement complet (5s)...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log("[🔍 PUPPETEER] Extraction du code source complet...");

    // On récupère le contenu HTML complet généré et le titre pour le débug
    const content = await page.content();
    const pageTitle = await page.title();
    console.log(`[🔍 PUPPETEER] Titre de la page lue : "${pageTitle}"`);

    await browser.close();

    // Analyse par Regex globale de toute la structure HTML obtenue
    let currentUrl = "";
    const matches = content.match(/movix\.[a-zA-Z0-9-]+/gi);

    if (matches) {
      // Nettoyage et filtrage pour éliminer la racine et les domaines inactifs/bloqués
      const cleanDomains = matches
        .map(d => d.toLowerCase().trim().replace(/[^a-z0-9.]/g, ""))
        .filter(d => 
          d !== "movix.online" && 
          d !== "movix.health" && 
          d !== "movix.help" && 
          d !== "movix.tax" && 
          d !== "movix"
        );

      // Si un ou plusieurs domaines valides restent (ex: movix.date), on prend le premier
      if (cleanDomains.length > 0) {
        currentUrl = "https://" + cleanDomains[0];
      }
    }

    if (!currentUrl) {
      console.log("⚠️ [MOVIX] Impossible de trouver le nom du domaine alternatif dans la page.");
      return;
    }

    console.log(`[MOVIX] URL trouvée sur le site : ${currentUrl}`);
    console.log(`[MOVIX] Dernière URL enregistrée par le bot : ${lastTrackedUrl || "Aucune (Premier scan)"}`);

    if (currentUrl !== lastTrackedUrl) {
      console.log(`🚨 [MOVIX] NOUVELLE URL DÉTECTÉE ! Envoi du message sur Discord...`);

      const channel = await client.channels.fetch(process.env.CHANNEL).catch(() => null);
      if (channel) {
        await channel.send(
          `🚨 **Mise à jour de l'adresse Movix !**\nLe nouveau domaine actif est disponible ici : ${currentUrl}`,
        );
        lastTrackedUrl = currentUrl;
        console.log("✅ [MOVIX] Message envoyé avec succès.");
      } else {
        console.error("❌ [MOVIX] Erreur : Impossible de trouver le salon Discord configuré.");
      }
    } else {
      console.log(`ℹ️ [MOVIX] L'URL n'a pas changé. Rien à envoyer.`);
    }
  } catch (error) {
    console.error("❌ [PUPPETEER] Erreur critique lors du tracking :", error.message);
    if (browser) await browser.close();
  }
}

// === SÉCURITÉ ANTI-SUPPRESSION SALON AFK ===
client.on("channelDelete", async (channel) => {
  console.log(`\n[🚫 SUPPRESSION] Un salon vient d'être supprimé : ${channel.name} (${channel.id})`);

  if (channel.id === savedAfkChannelId) {
    console.log(`🎯 [AFK] Le salon supprimé correspond à notre salon AFK sauvegardé ! Récréation...`);

    try {
      const guild = channel.guild;

      const newAfkChannel = await guild.channels.create({
        name: channel.name || "afk",
        type: ChannelType.GuildVoice,
        parent: channel.parentId,
        reason: "Récréation automatique du salon AFK",
      });

      console.log(`✅ [AFK] Nouveau salon vocal créé avec succès.`);

      await guild.edit({
        afkChannel: newAfkChannel,
        afkTimeout: 300,
      });

      savedAfkChannelId = newAfkChannel.id;
      console.log(`⚙️ [AFK] Serveur reconfiguré. Nouvel ID AFK en mémoire : ${savedAfkChannelId}`);
    } catch (error) {
      console.error("❌ [AFK] Erreur pendant la reconstruction :", error.message);
    }
  } else {
    console.log(`ℹ️ [AFK] Ce salon n'était pas le salon AFK officiel. Le bot ne fait rien.`);
  }
});

// === READY EVENT ===
client.once("ready", async () => {
  console.log(`🤖 Bot connecté en tant que : ${client.user.tag}`);

  console.log("\n--- [MINI-DEBUG AFK AU DÉMARRAGE] ---");
  client.guilds.cache.forEach((guild) => {
    if (guild.afkChannelId) {
      savedAfkChannelId = guild.afkChannelId;
      console.log(`💾 ID AFK mis en cache : ${savedAfkChannelId} (Serveur: ${guild.name})`);
    } else {
      console.log(`⚠️ Attention : Aucun salon AFK configuré pour "${guild.name}".`);
    }
  });
  console.log("---------------------------------------\n");

  // Première exécution instantanée au démarrage
  checkMovixUrl();
  
  // Planification de la vérification toutes les 30 minutes (1800000 ms)
  setInterval(checkMovixUrl, 1800000); 
});

client.login(process.env.TOKEN);
