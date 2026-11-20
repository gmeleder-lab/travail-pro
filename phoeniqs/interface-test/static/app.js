"use strict";

const CLE_STOCKAGE = "banc-test-phoeniqs-v1";
const $ = (id) => document.getElementById(id);

const el = {
  bandeau: $("bandeau"), intitule: $("intitule"), testeur: $("testeur"),
  modele: $("modele"), noteModele: $("note-modele"), cadrage: $("cadrage"),
  brut: $("brut"), echanges: $("echanges"), saisie: $("saisie"),
  libelle: $("libelle-prompt"), prompt: $("prompt"), erreur: $("erreur"),
  envoyer: $("envoyer"), etat: $("etat"), termine: $("termine"),
  pdf: $("pdf"), nouveau: $("nouveau"), rapport: $("rapport"),
};

let maxPrompts = 3;
let enCours = false;
// Une séquence = un cas d'usage : jusqu'à 3 échanges {prompt, reponse, secondes, heure}.
let seq = sequenceVide();

function sequenceVide() {
  return { intitule: "", testeur: "", modele: "", cadrage: "", debut: null, echanges: [] };
}

function sauvegarder() {
  try { localStorage.setItem(CLE_STOCKAGE, JSON.stringify({ seq, brouillon: el.prompt.value })); } catch (e) { /* stockage indisponible */ }
}

function restaurer() {
  try {
    const d = JSON.parse(localStorage.getItem(CLE_STOCKAGE) || "null");
    if (d && d.seq && Array.isArray(d.seq.echanges)) {
      seq = Object.assign(sequenceVide(), d.seq);
      el.prompt.value = d.brouillon || "";
      return true;
    }
  } catch (e) { /* données illisibles : on repart de zéro */ }
  return false;
}

function nomEchange(i) {
  return i === 0 ? "Prompt" : "Re-prompt " + i;
}

function nomCourt(modele) {
  return modele.replace(/^inference-/, "");
}

function rendreMarkdown(texte) {
  const html = marked.parse(texte, { gfm: true, breaks: true });
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ["style", "form", "input", "button"] });
}

function blocReponse(texte, brut) {
  const div = document.createElement("div");
  if (brut) {
    div.className = "bulle-reponse brut";
    div.textContent = texte;
  } else {
    div.className = "bulle-reponse rendu";
    div.innerHTML = rendreMarkdown(texte);
  }
  return div;
}

function blocEchange(e, i, brut) {
  const frag = document.createDocumentFragment();
  const t1 = document.createElement("p");
  t1.className = "etiquette";
  t1.textContent = nomEchange(i);
  const p = document.createElement("div");
  p.className = "bulle-prompt";
  p.textContent = e.prompt;
  const t2 = document.createElement("p");
  t2.className = "etiquette";
  t2.textContent = "Réponse de " + nomCourt(seq.modele) + " (" + String(e.secondes).replace(".", ",") + " s)";
  frag.append(t1, p, t2, blocReponse(e.reponse, brut));
  return frag;
}

function afficher() {
  const n = seq.echanges.length;
  const fini = n >= maxPrompts;

  el.echanges.replaceChildren(...seq.echanges.map((e, i) => {
    const li = document.createElement("li");
    li.append(blocEchange(e, i, el.brut.checked));
    return li;
  }));

  el.saisie.hidden = fini;
  el.termine.hidden = !fini;
  el.libelle.textContent = nomEchange(n) + " (échange " + Math.min(n + 1, maxPrompts) + " sur " + maxPrompts + ")";
  el.prompt.placeholder = n === 0
    ? "Écrivez votre consigne, avec le texte ou les données à traiter."
    : "Précisez, corrigez ou relancez le modèle à partir de sa réponse.";

  // Le modèle et le cadrage sont figés dès le premier envoi.
  const fige = n > 0 || enCours;
  el.modele.disabled = fige;
  el.cadrage.disabled = fige;
  el.noteModele.textContent = fige
    ? "Modèle figé pour cette séquence. Cliquez sur « Nouveau test » pour en changer."
    : "Le modèle reste le même pour toute la séquence.";

  el.envoyer.disabled = enCours;
  el.prompt.disabled = enCours;
  el.pdf.disabled = n === 0 || enCours;
  el.nouveau.disabled = enCours;
}

function montrerErreur(message) {
  el.erreur.textContent = message;
  el.erreur.hidden = !message;
}

function messagesPourApi(nouveauPrompt) {
  const messages = [];
  if (seq.cadrage.trim()) messages.push({ role: "system", content: seq.cadrage.trim() });
  for (const e of seq.echanges) {
    messages.push({ role: "user", content: e.prompt });
    messages.push({ role: "assistant", content: e.reponse });
  }
  messages.push({ role: "user", content: nouveauPrompt });
  return messages;
}

async function envoyer(evenement) {
  evenement.preventDefault();
  if (enCours || seq.echanges.length >= maxPrompts) return;
  const texte = el.prompt.value.trim();
  if (!texte) { montrerErreur("Écrivez un prompt avant d'envoyer."); el.prompt.focus(); return; }
  if (!el.modele.value) { montrerErreur("Choisissez un modèle."); el.modele.focus(); return; }
  montrerErreur("");

  if (seq.echanges.length === 0) {
    seq.modele = el.modele.value;
    seq.cadrage = el.cadrage.value;
    seq.debut = new Date().toISOString();
  }

  enCours = true;
  afficher();
  const depart = Date.now();
  const tic = () => { el.etat.textContent = "Le modèle répond… " + Math.round((Date.now() - depart) / 1000) + " s"; };
  tic();
  const minuterie = setInterval(tic, 1000);

  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: seq.modele, messages: messagesPourApi(texte) }),
    });
    let d = null;
    try { d = await r.json(); } catch (e) { /* réponse non JSON */ }
    if (!r.ok || !d || typeof d.contenu !== "string") {
      throw new Error((d && d.erreur) || "Le serveur a répondu par une erreur " + r.status + ".");
    }
    seq.echanges.push({ prompt: texte, reponse: d.contenu, secondes: d.secondes, heure: new Date().toISOString() });
    el.prompt.value = "";
  } catch (e) {
    // Le prompt reste dans le champ : un échec ne consomme pas d'échange.
    montrerErreur(e instanceof TypeError
      ? "Le serveur local ne répond pas. Vérifiez qu'il est toujours lancé, puis réessayez."
      : e.message);
  } finally {
    clearInterval(minuterie);
    el.etat.textContent = "";
    enCours = false;
    sauvegarder();
    afficher();
    if (seq.echanges.length < maxPrompts) el.prompt.focus();
  }
}

function formaterDate(iso) {
  return new Date(iso).toLocaleString("fr-CH", { dateStyle: "long", timeStyle: "short" });
}

function nomFichier() {
  const d = new Date(seq.debut || Date.now());
  const p = (x) => String(x).padStart(2, "0");
  const date = d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "_" + p(d.getHours()) + p(d.getMinutes());
  const sujet = (seq.intitule || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40).toLowerCase();
  return ["test-phoeniqs", nomCourt(seq.modele), sujet, date].filter(Boolean).join("_");
}

function construireRapport() {
  const r = el.rapport;
  r.replaceChildren();
  const h1 = document.createElement("h1");
  h1.textContent = "Test Phoeniqs : " + (seq.intitule.trim() || "cas d'usage sans intitulé");
  r.append(h1);

  const total = seq.echanges.reduce((s, e) => s + (Number(e.secondes) || 0), 0);
  const lignes = [
    ["Cas d'usage", seq.intitule.trim() || "(non renseigné)"],
    ["Modèle", seq.modele],
    ["Testeur·euse", seq.testeur.trim() || "(non renseigné)"],
    ["Date du test", formaterDate(seq.debut)],
    ["Nombre d'échanges", seq.echanges.length + " sur " + maxPrompts + " (1 prompt, " + (seq.echanges.length - 1) + " re-prompt" + (seq.echanges.length > 2 ? "s" : "") + ")"],
    ["Temps de réponse cumulé", total.toFixed(1).replace(".", ",") + " s"],
    ["Consigne de cadrage", seq.cadrage.trim() || "(aucune)"],
  ];
  const table = document.createElement("table");
  table.className = "fiche";
  for (const [k, v] of lignes) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = k;
    const td = document.createElement("td");
    td.textContent = v;
    tr.append(th, td);
    table.append(tr);
  }
  r.append(table);

  seq.echanges.forEach((e, i) => {
    const h2 = document.createElement("h2");
    h2.textContent = "Échange " + (i + 1) + " : " + nomEchange(i).toLowerCase();
    r.append(h2, blocEchange(e, i, el.brut.checked));
  });

  const mention = document.createElement("p");
  mention.className = "mention";
  mention.textContent = "Réponses générées par un modèle d'IA via Phoeniqs, reproduites sans retouche. À relire avant tout usage.";
  r.append(mention);
}

function telechargerPdf() {
  if (seq.echanges.length === 0) return;
  construireRapport();
  // Le titre de la page sert de nom de fichier proposé par le navigateur.
  const titre = document.title;
  document.title = nomFichier();
  const retablir = () => { document.title = titre; window.removeEventListener("afterprint", retablir); };
  window.addEventListener("afterprint", retablir);
  window.print();
}

function nouveauTest() {
  if (seq.echanges.length > 0 && !confirm("Commencer un nouveau test ? La séquence actuelle sera effacée. Téléchargez d'abord le PDF si vous voulez la garder.")) return;
  const testeur = seq.testeur;
  const cadrage = el.cadrage.value;
  const modele = el.modele.value;
  seq = sequenceVide();
  seq.testeur = testeur;
  el.intitule.value = "";
  el.prompt.value = "";
  el.cadrage.value = cadrage;
  el.modele.value = modele;
  montrerErreur("");
  sauvegarder();
  afficher();
  el.intitule.focus();
}

function remplirModeles(modeles, choisi) {
  el.modele.replaceChildren();
  const groupe = (titre, ids) => {
    if (!ids.length) return;
    const g = document.createElement("optgroup");
    g.label = titre;
    for (const id of ids) {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = nomCourt(id);
      g.append(o);
    }
    el.modele.append(g);
  };
  const tous = modeles.testes.concat(modeles.autres);
  // Un modèle d'une séquence restaurée reste affiché même s'il a quitté la liste.
  if (choisi && !tous.includes(choisi)) groupe("Séquence en cours", [choisi]);
  groupe("Déjà évalués en novembre 2026", modeles.testes);
  groupe("Autres modèles Phoeniqs", modeles.autres);
  if (choisi) el.modele.value = choisi;
}

async function demarrer() {
  const restaure = restaurer();
  let config;
  try {
    const r = await fetch("/api/config");
    config = await r.json();
  } catch (e) {
    el.bandeau.textContent = "Le serveur local ne répond pas. Relancez-le, puis rechargez cette page.";
    el.bandeau.hidden = false;
    el.envoyer.disabled = true;
    return;
  }
  maxPrompts = config.maxPrompts || 3;
  remplirModeles(config.modeles, seq.modele);
  el.cadrage.value = restaure && seq.echanges.length ? seq.cadrage : config.cadrage;
  el.intitule.value = seq.intitule;
  el.testeur.value = seq.testeur;

  if (config.demo) {
    el.bandeau.textContent = "Mode démonstration : aucun modèle n'est appelé, les réponses sont factices.";
    el.bandeau.hidden = false;
  } else if (config.cleAbsente) {
    el.bandeau.innerHTML = "La clé d'API Phoeniqs n'est pas configurée. Copiez <code>.env.example</code> en <code>.env</code>, collez-y votre clé, puis relancez le serveur.";
    el.bandeau.hidden = false;
  }
  afficher();
}

el.saisie.addEventListener("submit", envoyer);
el.prompt.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) el.saisie.requestSubmit();
});
el.prompt.addEventListener("input", sauvegarder);
el.intitule.addEventListener("input", () => { seq.intitule = el.intitule.value; sauvegarder(); });
el.testeur.addEventListener("input", () => { seq.testeur = el.testeur.value; sauvegarder(); });
el.brut.addEventListener("change", afficher);
el.pdf.addEventListener("click", telechargerPdf);
el.nouveau.addEventListener("click", nouveauTest);

demarrer();
