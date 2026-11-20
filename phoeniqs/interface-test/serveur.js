#!/usr/bin/env node
/* Banc de test Phoeniqs : serveur pour l'hébergement Node.js.

   Même comportement que serveur.py (usage local sur Mac), pour les
   hébergeurs qui font tourner du Node.js, comme Infomaniak.
   Aucune dépendance : Node.js 18 ou plus récent suffit. */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DOSSIER = __dirname;
const STATIQUE = path.join(DOSSIER, "static");

const MAX_PROMPTS = 3;            // 1 prompt + 2 re-prompts par cas d'usage
const MAX_CARACTERES = 200000;    // taille maximale d'une demande
const DELAI_API_MS = 300000;
const MAX_ECHECS = 8;             // codes erronés tolérés par adresse…
const FENETRE_ECHECS_MS = 600000; // …sur dix minutes

// Modèles déjà évalués en novembre 2026 : proposés en tête de liste, et
// utilisés seuls si la liste de l'API n'est pas disponible.
const MODELES_TESTES = [
  "inference-glm5",
  "inference-glm5-flash",
  "inference-deepseek-v32",
  "inference-deepseek-v4-flash",
  "inference-gpt-oss-120b",
  "inference-apertus-v15-70b",
];

// Modèles qui ne répondent pas à un prompt texte (embeddings, classement,
// transcription audio, OCR, génération d'image) : retirés de la liste.
const HORS_CONVERSATION = /bge|rerank|emb|whisper|ocr|miner|image|flix/i;

const CADRAGE_PAR_DEFAUT =
  "Tu es un assistant pédagogique pour l'enseignement postobligatoire " +
  "vaudois. Tu réponds en français de Suisse romande.";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const ENTETES_SECURITE = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  // Les réponses des modèles peuvent contenir du HTML : aucun script ni
  // ressource externe ne doit se charger depuis la page.
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};

function lireFichier(nom) {
  try {
    return fs.readFileSync(path.join(DOSSIER, nom), "utf8");
  } catch (e) {
    return null;
  }
}

// Lit le fichier .env du dossier, sans écraser l'environnement existant.
function chargerEnv() {
  const texte = lireFichier(".env");
  if (!texte) return;
  for (let ligne of texte.split(/\r?\n/)) {
    ligne = ligne.trim();
    const i = ligne.indexOf("=");
    if (!ligne || ligne.startsWith("#") || i < 0) continue;
    const nom = ligne.slice(0, i).trim();
    const valeur = ligne.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!(nom in process.env)) process.env[nom] = valeur;
  }
}

chargerEnv();

const CLE = (process.env.PHOENIQS_API_KEY || "").trim();
const BASE = (process.env.PHOENIQS_BASE_URL || "https://maas.phoeniqs.com/v1").replace(/\/+$/, "");
// Chez un hébergeur, le port est imposé par la variable PORT : le serveur
// écoute alors sur toutes les interfaces, derrière le HTTPS de l'hébergeur.
const HOTE = process.env.HOTE || "0.0.0.0";
const PORT = parseInt(process.env.PORT || "8080", 10);
const DEMO = process.env.PHOENIQS_DEMO === "1";
const DERRIERE_PROXY = process.env.DERRIERE_PROXY !== "0";
const QUOTA_JOUR = parseInt(process.env.QUOTA_JOUR || "100", 10); // demandes par testeur et par jour
const LOCAL = ["127.0.0.1", "localhost", "::1"].includes(HOTE);

// Codes d'accès personnels : Map code -> nom du testeur.
// Sources : le fichier codes.txt (« Nom ; code ») et la variable CODES_ACCES
// (« Nom:code » séparés par des points-virgules).
function chargerCodes() {
  const paires = [];
  const texte = lireFichier("codes.txt");
  if (texte) {
    for (let ligne of texte.split(/\r?\n/)) {
      ligne = ligne.trim();
      const i = ligne.lastIndexOf(";");
      if (ligne && !ligne.startsWith("#") && i >= 0) paires.push([ligne.slice(0, i), ligne.slice(i + 1)]);
    }
  }
  for (const element of (process.env.CODES_ACCES || "").split(";")) {
    const i = element.lastIndexOf(":");
    if (i >= 0) paires.push([element.slice(0, i), element.slice(i + 1)]);
  }
  const codes = new Map();
  for (const [nom, code] of paires) {
    if (nom.trim() && code.trim().length >= 8) codes.set(code.trim(), nom.trim());
  }
  return codes;
}

const CODES = chargerCodes();
const echecs = new Map();     // adresse -> instants des codes erronés
const compteurs = new Map();  // « jour|testeur » -> nombre de demandes
let cacheModeles = { quand: 0, liste: null };

function journal(message) {
  const d = new Date();
  console.log(d.toISOString().replace("T", " ").slice(0, 19) + "  " + message);
}

class ErreurApi extends Error {}

// Appelle l'API Phoeniqs et renvoie le JSON décodé.
async function appelApi(chemin, corps) {
  let reponse;
  try {
    reponse = await fetch(BASE + chemin, {
      method: corps ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + CLE,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: corps ? JSON.stringify(corps) : undefined,
      signal: AbortSignal.timeout(DELAI_API_MS),
    });
  } catch (e) {
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      throw new ErreurApi(
        "Le modèle n'a pas répondu en " + DELAI_API_MS / 1000 + " secondes. Réessayez, ou choisissez un modèle plus rapide."
      );
    }
    const cause = (e.cause && (e.cause.code || e.cause.message)) || e.message;
    throw new ErreurApi("Impossible de joindre Phoeniqs (" + BASE + ") : " + cause);
  }
  const texte = await reponse.text();
  let contenu = null;
  try { contenu = JSON.parse(texte); } catch (e) { /* réponse non JSON */ }
  if (!reponse.ok) {
    let detail = texte.slice(0, 500);
    const erreur = contenu && (contenu.error !== undefined ? contenu.error : contenu);
    if (erreur && typeof erreur === "object" && erreur.message) detail = erreur.message;
    else if (typeof erreur === "string") detail = erreur;
    if (reponse.status === 401 || reponse.status === 403) {
      throw new ErreurApi(
        "Phoeniqs a refusé la clé d'API (erreur " + reponse.status + "). Vérifiez PHOENIQS_API_KEY. Détail : " + detail
      );
    }
    throw new ErreurApi("Phoeniqs a répondu par une erreur " + reponse.status + " : " + detail);
  }
  if (contenu === null) throw new ErreurApi("Phoeniqs a renvoyé une réponse illisible.");
  return contenu;
}

// Modèles déjà testés d'abord, puis les autres modèles de l'API.
async function listeModeles() {
  const parDefaut = { testes: MODELES_TESTES, autres: [], source: "liste par défaut" };
  if (DEMO || !CLE) return parDefaut;
  if (cacheModeles.liste && Date.now() - cacheModeles.quand < 600000) return cacheModeles.liste;
  let ids = null;
  for (let essai = 0; essai < 2 && ids === null; essai++) { // un second essai couvre une coupure passagère
    try {
      const d = await appelApi("/models");
      ids = (d.data || []).map((m) => m && m.id).filter((id) => typeof id === "string" && !HORS_CONVERSATION.test(id)).sort();
    } catch (e) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!ids || !ids.length) return parDefaut;
  const resultat = {
    testes: MODELES_TESTES.filter((m) => ids.includes(m)),
    autres: ids.filter((m) => !MODELES_TESTES.includes(m)),
    source: "API Phoeniqs",
  };
  cacheModeles = { quand: Date.now(), liste: resultat };
  return resultat;
}

// Réponse factice, pour essayer l'interface sans clé d'API.
async function reponseDemo(messages) {
  await new Promise((r) => setTimeout(r, 1200));
  const numero = messages.filter((m) => m.role === "user").length;
  const dernier = messages[messages.length - 1].content;
  return (
    "## Réponse de démonstration (échange " + numero + ")\n\n" +
    "Le **mode démonstration** est actif : aucun modèle n'a été appelé.\n\n" +
    "Votre demande faisait " + dernier.length + " caractères. Voici un exemple de mise en forme :\n\n" +
    "1. une liste numérotée ;\n2. avec *deux* éléments.\n\n" +
    "| Critère | Note |\n| --- | --- |\n| Exactitude | 4 |\n| Français | 5 |\n\n" +
    "```\n=B2/1,081\n```\n"
  );
}

class DemandeInvalide extends Error {}

// Vérifie la demande du navigateur ; renvoie { modele, messages }.
function valider(corps) {
  if (!corps || typeof corps !== "object" || Array.isArray(corps)) throw new DemandeInvalide("Demande invalide.");
  const { model: modele, messages } = corps;
  if (typeof modele !== "string" || !modele.trim()) throw new DemandeInvalide("Choisissez un modèle.");
  if (!Array.isArray(messages) || !messages.length) throw new DemandeInvalide("Le prompt est vide.");
  const propres = [];
  for (const m of messages) {
    if (!m || typeof m !== "object" || !["system", "user", "assistant"].includes(m.role) || typeof m.content !== "string") {
      throw new DemandeInvalide("Demande invalide.");
    }
    if (m.content.trim()) propres.push({ role: m.role, content: m.content });
  }
  if (!propres.length || propres[propres.length - 1].role !== "user") throw new DemandeInvalide("Le prompt est vide.");
  if (propres.filter((m) => m.role === "user").length > MAX_PROMPTS) {
    throw new DemandeInvalide(
      "Un cas d'usage est limité à " + MAX_PROMPTS + " prompts (1 prompt et " + (MAX_PROMPTS - 1) + " re-prompts)."
    );
  }
  if (propres.reduce((s, m) => s + m.content.length, 0) > MAX_CARACTERES) throw new DemandeInvalide("La demande est trop longue.");
  return { modele: modele.trim(), messages: propres };
}

function envoyerJson(res, code, objet) {
  const donnees = Buffer.from(JSON.stringify(objet), "utf8");
  res.writeHead(code, Object.assign({
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": donnees.length,
    "Cache-Control": "no-store",
  }, ENTETES_SECURITE));
  res.end(donnees);
}

function adresse(req) {
  if (DERRIERE_PROXY) {
    const transmis = String(req.headers["x-forwarded-for"] || "");
    if (transmis) return transmis.split(",").pop().trim();
  }
  return req.socket.remoteAddress || "";
}

function memeTexte(a, b) { // comparaison à temps constant
  const x = crypto.createHash("sha256").update(a).digest();
  const y = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

// Renvoie le nom du testeur, "" en accès libre, ou null après avoir refusé.
function testeur(req, res) {
  if (!CODES.size) return "";
  const ou = adresse(req);
  const maintenant = Date.now();
  const recents = (echecs.get(ou) || []).filter((t) => maintenant - t < FENETRE_ECHECS_MS);
  echecs.set(ou, recents);
  if (recents.length >= MAX_ECHECS) {
    envoyerJson(res, 429, { erreur: "Trop de codes erronés. Réessayez dans dix minutes." });
    return null;
  }
  const recu = String(req.headers["x-code-acces"] || "").trim();
  let nom = null;
  for (const [code, candidat] of CODES) {
    if (memeTexte(code, recu)) nom = candidat;
  }
  if (nom === null) {
    if (recu) {
      recents.push(maintenant);
      journal("code d'accès refusé pour " + ou);
    }
    envoyerJson(res, 401, {
      accesRequis: true,
      erreur: recu ? "Ce code d'accès n'est pas reconnu." : "Un code d'accès est nécessaire.",
    });
    return null;
  }
  return nom;
}

function quotaDepasse(nom) {
  if (!nom || QUOTA_JOUR <= 0) return false;
  const jour = new Date().toISOString().slice(0, 10);
  for (const cle of compteurs.keys()) {
    if (!cle.startsWith(jour + "|")) compteurs.delete(cle);
  }
  const cle = jour + "|" + nom;
  const deja = compteurs.get(cle) || 0;
  if (deja >= QUOTA_JOUR) return true;
  compteurs.set(cle, deja + 1);
  return false;
}

function lireCorps(req) {
  return new Promise((resolve, reject) => {
    const morceaux = [];
    let taille = 0;
    req.on("data", (m) => {
      taille += m.length;
      if (taille > 4 * MAX_CARACTERES) {
        reject(new DemandeInvalide("La demande est trop longue."));
        req.destroy();
        return;
      }
      morceaux.push(m);
    });
    req.on("end", () => resolve(Buffer.concat(morceaux).toString("utf8")));
    req.on("error", reject);
  });
}

function servirFichier(res, chemin) {
  if (chemin === "/") chemin = "/index.html";
  let fichier;
  try {
    fichier = path.resolve(STATIQUE, "." + decodeURIComponent(chemin));
  } catch (e) {
    fichier = "";
  }
  if (!fichier.startsWith(STATIQUE + path.sep) || !fs.existsSync(fichier) || !fs.statSync(fichier).isFile()) {
    res.writeHead(404, Object.assign({ "Content-Type": "text/plain; charset=utf-8" }, ENTETES_SECURITE));
    res.end("Page introuvable");
    return;
  }
  const donnees = fs.readFileSync(fichier);
  res.writeHead(200, Object.assign({
    "Content-Type": TYPES[path.extname(fichier)] || "application/octet-stream",
    "Content-Length": donnees.length,
    "Cache-Control": "no-cache",
  }, ENTETES_SECURITE));
  res.end(donnees);
}

async function traiterChat(req, res) {
  // Refuse les demandes venues d'un autre site ouvert dans le navigateur.
  const origine = req.headers.origin;
  if (origine && origine.split("//").pop() !== req.headers.host) {
    envoyerJson(res, 403, { erreur: "Demande refusée." });
    return;
  }
  const nom = testeur(req, res);
  if (nom === null) return;

  let demande;
  try {
    const texte = await lireCorps(req);
    let corps;
    try { corps = JSON.parse(texte); } catch (e) { throw new DemandeInvalide("Demande invalide."); }
    demande = valider(corps);
  } catch (e) {
    envoyerJson(res, 400, { erreur: e instanceof DemandeInvalide ? e.message : "Demande invalide." });
    return;
  }

  if (quotaDepasse(nom)) {
    envoyerJson(res, 429, {
      erreur: "Vous avez atteint la limite de " + QUOTA_JOUR + " demandes pour aujourd'hui. Vous pourrez reprendre demain.",
    });
    return;
  }

  const debut = Date.now();
  let texte;
  let usage = null;
  if (DEMO) {
    texte = await reponseDemo(demande.messages);
  } else if (!CLE) {
    envoyerJson(res, 503, { erreur: "La clé d'API Phoeniqs n'est pas configurée." });
    return;
  } else {
    try {
      const resultat = await appelApi("/chat/completions", { model: demande.modele, messages: demande.messages });
      texte = resultat.choices[0].message.content || "";
      usage = resultat.usage || null;
    } catch (e) {
      envoyerJson(res, 502, { erreur: e instanceof ErreurApi ? e.message : "Phoeniqs a renvoyé une réponse inattendue." });
      return;
    }
    if (!String(texte).trim()) {
      envoyerJson(res, 502, { erreur: "Le modèle a renvoyé une réponse vide. Réessayez." });
      return;
    }
  }
  const secondes = Math.round((Date.now() - debut) / 100) / 10;
  journal("réponse de " + demande.modele + " en " + secondes.toFixed(1) + " s pour " + (nom || "accès libre"));
  envoyerJson(res, 200, { contenu: texte, secondes, usage });
}

async function traiter(req, res) {
  const chemin = (req.url || "/").split("?")[0];
  if (req.method === "GET" || req.method === "HEAD") {
    if (chemin === "/api/sante") {
      envoyerJson(res, 200, { etat: "ok" });
    } else if (chemin === "/api/config") {
      const nom = testeur(req, res);
      if (nom === null) return;
      envoyerJson(res, 200, {
        testeur: nom,
        modeles: await listeModeles(),
        cadrage: CADRAGE_PAR_DEFAUT,
        maxPrompts: MAX_PROMPTS,
        demo: DEMO,
        cleAbsente: !CLE && !DEMO,
      });
    } else {
      servirFichier(res, chemin);
    }
  } else if (req.method === "POST" && chemin === "/api/chat") {
    await traiterChat(req, res);
  } else {
    res.writeHead(404, Object.assign({ "Content-Type": "text/plain; charset=utf-8" }, ENTETES_SECURITE));
    res.end("Page introuvable");
  }
}

function main() {
  if (!LOCAL && !CODES.size && !DEMO && process.env.ACCES_LIBRE !== "1") {
    console.error(
      "Le serveur est ouvert au réseau mais aucun code d'accès n'est défini : " +
      "n'importe qui pourrait consommer les crédits de la clé.\n" +
      "Définissez CODES_ACCES (voir DEPLOIEMENT.md), ou ACCES_LIBRE=1 pour un réseau de confiance."
    );
    process.exit(1);
  }
  const serveur = http.createServer((req, res) => {
    traiter(req, res).catch((e) => {
      journal("erreur interne : " + (e && e.message));
      if (!res.headersSent) envoyerJson(res, 500, { erreur: "Erreur interne du serveur." });
      else res.end();
    });
  });
  // Les réponses des modèles lents dépassent une minute.
  serveur.requestTimeout = DELAI_API_MS + 30000;
  serveur.listen(PORT, HOTE, () => {
    journal("Banc de test Phoeniqs à l'écoute sur le port " + PORT);
    if (DEMO) journal("Mode démonstration : aucun modèle n'est appelé.");
    else if (!CLE) journal("Attention : PHOENIQS_API_KEY est absente.");
    if (CODES.size) journal("Accès par code personnel : " + CODES.size + " testeur(s), " + QUOTA_JOUR + " demandes par jour chacun.");
  });
}

main();
