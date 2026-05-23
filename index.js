import { Client, GatewayIntentBits } from "discord.js";
import puppeteer from "puppeteer";
import "dotenv/config";

console.log("=== DÉMARRAGE DU BOT ===");
if (!process.env.TOKEN) {
  console.error("❌ ERREUR : La variable TOKEN n'est pas détectée.");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const TARGET_URL = "https://movix.health";
let lastTrackedUrl = "";

async function checkMovixUrl() {
  let browser;
  try {
    console.log("Vérification globale du contenu avec Puppeteer...");

    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    );

    // On va sur le site et on attend 5 secondes pour être SÛR que tout le Javascript est exécuté
    await page.goto(TARGET_URL, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // On récupère TOUT le texte visible et invisible de la page (le HTML complet généré)
    const pageContent = await page.content();
    await browser.close();

    // On cherche toutes les chaînes de caractères qui ressemblent à un lien contenant "movix"
    // Ça va attraper les domaines comme movix.tax, movix.cash, etc.
    const matches = pageContent.match(
      /https?:\/\/[a-zA-Z0-9.-]*movix\.[a-zA-Z0-9-]+/gi,
    );

    let currentUrl = "";

    if (matches) {
      // On filtre les résultats trouvés pour éliminer movix.health
      const cleanUrls = matches
        .map((url) => url.toLowerCase())
        .filter((url) => !url.includes("movix.health"));

      if (cleanUrls.length > 0) {
        // On prend la première URL de la liste (ex: https://movix.tax)
        currentUrl = cleanUrls[0];
      }
    }

    if (!currentUrl) {
      console.log(
        "⚠️ Aucun domaine Movix alternatif trouvé dans le texte de la page.",
      );
      return;
    }

    // Nettoyage final
    currentUrl = currentUrl.replace(/['"; ]+$/, "");

    // Envoi sur Discord
    if (currentUrl !== lastTrackedUrl) {
      console.log(`🔗 Nouvelle URL détectée : ${currentUrl}`);

      const channel = await client.channels.fetch(process.env.CHANNEL);
      if (channel) {
        await channel.send(
          `🚨 **Mise à jour de l'adresse Movix !**\nLe nouveau domaine actif est disponible ici : ${currentUrl}`,
        );
        lastTrackedUrl = currentUrl;
      } else {
        console.error("❌ Erreur : Le salon Discord est introuvable.");
      }
    } else {
      console.log(`ℹ️ L'URL n'a pas changé (${currentUrl}).`);
    }
  } catch (error) {
    console.error("❌ Erreur lors du tracking :", error.message);
    if (browser) await browser.close();
  }
}

// Correction définitive de l'événement de démarrage Discord.js v14/v15
client.once("ready", () => {
  console.log(`🤖 Bot connecté en tant que : ${client.user.tag}`);
  checkMovixUrl();
  setInterval(checkMovixUrl, 1800000);
});

client.login(process.env.TOKEN);
