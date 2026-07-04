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

// URL de base
const TARGET_URL = "https://movix.online/";
let lastTrackedUrl = "";
let savedAfkChannelId = null;

// --- FONCTION DE TRACKING MOVIX ---
// --- FONCTION DE TRACKING MOVIX (CIBLAGE DU SPAN TRUNCATE) ---
async function checkMovixUrl() {
  let browser;
  try {
    console.log("\n[🔍 PUPPETEER] Lancement du navigateur pour vérifier Movix...");

    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--ignore-certificate-errors",
      ],
    });
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    );

    console.log(`[🔍 PUPPETEER] Connexion à l'adresse cible : ${TARGET_URL}...`);
    await page.goto(TARGET_URL, { waitUntil: "networkidle2", timeout: 60000 });

    console.log("[🔍 PUPPETEER] Attente du chargement complet (5s)...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log("[🔍 PUPPETEER] Extraction du domaine depuis le span du bouton...");

    // Ciblage précis basé sur image_9086c8.png
    const detectedUrl = await page.evaluate(() => {
      // On récupère spécifiquement les éléments span de la page
      const spans = document.querySelectorAll("span.truncate, span, button");
      
      for (let el of spans) {
        const text = el.textContent ? el.textContent.trim() : "";
        
        // On cherche "movix." à l'intérieur du texte (ex: "Accéder à movix.date")
        if (text.toLowerCase().includes("movix.")) {
          const match = text.match(/movix\.[a-zA-Z0-9]+/i);
          if (match) {
            const cleanMatch = match[0].toLowerCase().trim();
            // On ignore le domaine actuel pour ne prendre que le nouveau
            if (cleanMatch !== "movix.online") {
              return "https://" + cleanMatch;
            }
          }
        }
      }
      return null;
    });

    await browser.close();

    let currentUrl = detectedUrl;

    if (!currentUrl) {
      console.log("⚠️ [MOVIX] Impossible de trouver le nom du domaine alternatif dans les éléments de la page.");
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

client.once("clientReady", async () => {
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

  checkMovixUrl();

  setInterval(checkMovixUrl, 1800000); 
});

client.login(process.env.TOKEN);
