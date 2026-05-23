FROM ghcr.io/puppeteer/puppeteer:22.6.0

# Définir le dossier de travail dans le conteneur
WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances
RUN npm ci

# Copier le reste du code de ton bot
COPY . .

# Lancer le bot (pas besoin de PM2 ici, Docker gère le statut "toujours actif")
CMD ["node", "index.js"]
