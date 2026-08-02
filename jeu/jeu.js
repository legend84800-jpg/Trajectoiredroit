/* Cassation, le rituel de révision des étudiants en droit.
   Moteur complet côté client : audiences, Arrêt du jour, duels par lien,
   répétition espacée (les questions ratées « font appel »), série, cote.
   Aucune donnée personnelle ne quitte le téléphone, sauf l'email si le
   joueur le laisse volontairement. */
(function () {
  "use strict";

  var CLE = "cassation-v1";
  var EPOQUE = "2026-08-01"; /* jour 1 du compteur public de l'Arrêt du jour */

  /* ===================== État ===================== */
  function etatDefaut() {
    return {
      serie: 0, dernierJour: null, gels: 1, semaineGel: null,
      niveau: "L1", matiere: "intro-droit-l1s1",
      cotes: {}, leitner: {}, piegesVus: [],
      arrets: {}, serieArret: 0, dernierArret: null,
      nbAudiences: 0, nom: "", emailOk: false,
      lacunes: {}
    };
  }
  var etat;
  try { etat = Object.assign(etatDefaut(), JSON.parse(localStorage.getItem(CLE) || "{}")); }
  catch (e) { etat = etatDefaut(); }
  function sauve() { try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch (e) {} }

  /* ===================== Dates (heure de Paris) ===================== */
  function jourParis() {
    return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
  }
  function numJour(iso) {
    var p = iso.split("-");
    return Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
  }
  function joursDepuisEpoque() { return numJour(jourParis()) - numJour(EPOQUE); }

  /* ===================== Aléatoire avec graine ===================== */
  function graine(s) {
    var h = 1779033703 ^ s.length;
    for (var i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
  }
  function melange(tab, rnd) {
    var a = tab.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ===================== Données ===================== */
  var matieres = [], cacheMatiere = {}, arretsBase = null, piegesBase = null;
  function chargeJSON(u) {
    return fetch(u).then(function (r) { if (!r.ok) throw new Error(u); return r.json(); });
  }
  function chargeMatiere(slug) {
    if (cacheMatiere[slug]) return Promise.resolve(cacheMatiere[slug]);
    return chargeJSON("data/" + slug + ".json").then(function (d) { cacheMatiere[slug] = d; return d; });
  }
  function chargeArrets() {
    if (arretsBase) return Promise.resolve(arretsBase);
    return chargeJSON("data/arrets.json").then(function (d) { arretsBase = d; return d; });
  }
  function chargePieges() {
    if (piegesBase) return Promise.resolve(piegesBase);
    return chargeJSON("data/pieges.json").then(function (d) { piegesBase = d; return d; })
      .catch(function () { piegesBase = []; return piegesBase; });
  }

  /* ===================== Raccourcis DOM ===================== */
  function $(id) { return document.getElementById(id); }
  function montre(id) {
    document.querySelectorAll(".ecran").forEach(function (e) { e.classList.remove("actif"); });
    $(id).classList.add("actif");
    window.scrollTo(0, 0);
  }

  /* ===================== Série d'audiences ===================== */
  function majSerie() {
    var jour = jourParis();
    /* recharge de la mise en délibéré chaque lundi */
    var lundi = numJour(jour) - ((numJour(jour) + 3) % 7); /* jeudi 1970-01-01 : décalage pour tomber sur lundi */
    if (etat.semaineGel !== lundi) { etat.semaineGel = lundi; if (etat.gels < 1) etat.gels = 1; }
    if (etat.dernierJour === jour) return;
    var ecart = etat.dernierJour ? numJour(jour) - numJour(etat.dernierJour) : null;
    if (ecart === 1) etat.serie += 1;
    else if (ecart === 2 && etat.gels > 0) { etat.gels -= 1; etat.serie += 1; }
    else etat.serie = 1;
    etat.dernierJour = jour;
    sauve();
    $("serie-val").textContent = etat.serie;
  }

  /* ===================== Cote et paliers ===================== */
  var PALIERS = [
    [1350, "Assemblée plénière"],
    [1200, "Cour de cassation"],
    [1080, "Cour d'appel"],
    [0, "Tribunal judiciaire"]
  ];
  function cote(slug) { return etat.cotes[slug] || 1000; }
  function palier(c) {
    for (var i = 0; i < PALIERS.length; i++) if (c >= PALIERS[i][0]) return PALIERS[i][1];
    return PALIERS[3][1];
  }

  /* ===================== Répétition espacée (Leitner) ===================== */
  var DELAIS = [1, 3, 7]; /* jours avant retour selon la boîte */
  function noteReponse(qid, slug, juste) {
    var l = etat.leitner[qid] || { b: 0, m: slug };
    if (juste) {
      l.b = Math.min(l.b + 1, 3);
      l.due = numJour(jourParis()) + DELAIS[Math.min(l.b - 1, 2)];
      if (l.b >= 3) l.due = null; /* consolidée, elle sort du circuit */
    } else {
      l.b = 1;
      l.due = numJour(jourParis()) + 1;
    }
    etat.leitner[qid] = l;
  }
  function questionsEnAppel(slug) {
    var auj = numJour(jourParis()), ids = [];
    for (var k in etat.leitner) {
      var l = etat.leitner[k];
      if (l.m === slug && l.due !== null && l.due !== undefined && l.due <= auj && l.b < 3) ids.push(k);
    }
    return ids;
  }
  function nbMaitrisees() {
    var n = 0;
    for (var k in etat.leitner) if (etat.leitner[k].b >= 3) n++;
    return n;
  }

  /* ===================== Construction des questions jouables ===================== */
  var TROU_RE = /\{\{c(\d+)::(.*?)\}\}/g;
  function trouve(data, id) {
    var liste = id.charAt(0) === "c" ? data.cloze : data.qcm;
    for (var i = 0; i < liste.length; i++) if (liste[i].id === id) return liste[i];
    return null;
  }
  function titreFiche(data, num) {
    for (var i = 0; i < data.fiches.length; i++)
      if (data.fiches[i].num === num) return data.fiches[i].titre.replace(/^Fiche n°\d+\s*[·:]\s*/, "");
    return "";
  }
  function faitQCM(q, format) {
    var ordre = melange([0, 1, 2, 3].slice(0, q.o ? q.o.length : q.options.length), Math.random.bind(Math));
    var opts = q.o || q.options, bonne = (q.c !== undefined ? q.c : q.correct);
    return {
      id: q.id || null, fiche: q.f, format: format || "QCM",
      texte: q.q, options: ordre.map(function (i) { return opts[i]; }),
      bonne: ordre.indexOf(bonne), justif: q.j || q.justif || ""
    };
  }
  function faitTrous(c, data, rnd) {
    rnd = rnd || Math.random.bind(Math);
    var blancs = [], m;
    TROU_RE.lastIndex = 0;
    while ((m = TROU_RE.exec(c.t)) !== null) blancs.push(m[2]);
    var cible = Math.floor(rnd() * blancs.length), n = -1;
    var texte = c.t.replace(TROU_RE, function (_, num, mot) {
      n += 1;
      return n === cible ? "███" : mot;
    });
    var bonne = blancs[cible];
    /* distracteurs : mots des autres trous de la même fiche, puis de la matière */
    var pool = [];
    data.cloze.forEach(function (autre) {
      var mm; TROU_RE.lastIndex = 0;
      while ((mm = TROU_RE.exec(autre.t)) !== null) {
        var mot = mm[2];
        if (mot.toLowerCase() !== bonne.toLowerCase() && pool.indexOf(mot) === -1)
          pool.push(autre.f === c.f ? mot : mot);
      }
    });
    var numerique = /\d/.test(bonne);
    var candidats = pool.filter(function (p) { return /\d/.test(p) === numerique && Math.abs(p.length - bonne.length) < 18; });
    if (candidats.length < 3) candidats = pool;
    var distracteurs = melange(candidats, rnd).slice(0, 3);
    var options = melange([bonne].concat(distracteurs), rnd);
    return {
      id: c.id, fiche: c.f, format: "Texte à trous",
      texte: texte, remplir: true, options: options,
      bonne: options.indexOf(bonne), justif: c.j || ""
    };
  }
  function faitPiege(p) {
    var q = faitQCM({ q: p.q, options: p.options, correct: p.correct, justif: p.justif, id: null, f: null }, "Piège, une vraie erreur d'étudiant");
    q.piege = true;
    return q;
  }

  function composeAudience(data, pieges) {
    var questions = [];
    /* 1. les questions qui ont fait appel, 3 au plus */
    var appel = melange(questionsEnAppel(data.slug), Math.random.bind(Math)).slice(0, 3);
    appel.forEach(function (id) {
      var src = trouve(data, id);
      if (!src) return;
      questions.push(id.charAt(0) === "c" ? faitTrous(src, data) : faitQCM(src));
    });
    /* 2. un piège jamais vu si la matière en a */
    var dispo = pieges.filter(function (p, i) {
      return p.matiere === data.slug && etat.piegesVus.indexOf(data.slug + ":" + i) === -1;
    });
    if (dispo.length && questions.length < 8) {
      var idx = Math.floor(Math.random() * dispo.length);
      var num = pieges.indexOf(dispo[idx]);
      etat.piegesVus.push(data.slug + ":" + num);
      questions.push(faitPiege(dispo[idx]));
    }
    /* 3. deux textes à trous neufs */
    var vus = etat.leitner;
    var clozeNeufs = data.cloze.filter(function (c) { return !vus[c.id]; });
    melange(clozeNeufs, Math.random.bind(Math)).slice(0, 2).forEach(function (c) {
      if (questions.length < 8) questions.push(faitTrous(c, data));
    });
    /* 4. complément en QCM neufs */
    var qcmNeufs = data.qcm.filter(function (q) { return !vus[q.id]; });
    if (qcmNeufs.length < 8) qcmNeufs = data.qcm;
    melange(qcmNeufs, Math.random.bind(Math)).forEach(function (q) {
      if (questions.length < 8) questions.push(faitQCM(q));
    });
    return melange(questions, Math.random.bind(Math)).slice(0, 8);
  }

  function composeDuel(data, seed) {
    var rnd = graine(seed);
    var ids = melange(data.qcm.map(function (q) { return q.id; }), rnd).slice(0, 7);
    return ids.map(function (id) {
      var src = trouve(data, id), q = src ? fixeQCM(src, rnd) : null;
      return q;
    }).filter(Boolean);
  }
  /* QCM à ordre d'options déterministe (le même pour les deux joueurs) */
  function fixeQCM(q, rnd) {
    var ordre = melange(q.o.map(function (_, i) { return i; }), rnd);
    return {
      id: q.id, fiche: q.f, format: "QCM",
      texte: q.q, options: ordre.map(function (i) { return q.o[i]; }),
      bonne: ordre.indexOf(q.c), justif: q.j || ""
    };
  }

  /* ===================== Attendus du juge ===================== */
  function attenduAudience(pct, nomMatiere) {
    var listes;
    if (pct === 100) listes = [
      "Attendu que le plaideur a fait un sans-faute en " + nomMatiere + ", la cour lui décerne les félicitations du jury et ordonne l'affichage du présent verdict dans le groupe de la promo.",
      "Attendu que la copie ne souffre d'aucun grief, la cour prononce un sans-faute et invite le plaideur à défendre son rang dès demain."
    ];
    else if (pct >= 70) listes = [
      "Attendu que le plaideur maîtrise l'essentiel de la matière, la cour le déclare admis et renvoie les questions ratées à une prochaine audience.",
      "Attendu que la copie l'emporte sur la plupart des points, la cour confirme la progression et ordonne la consolidation du reste."
    ];
    else if (pct >= 40) listes = [
      "Attendu que la copie alterne le meilleur et le moins bon, la cour ordonne un complément d'instruction sur les notions ratées, qui reviendront d'office.",
      "Attendu que le plaideur connaît la matière sans encore la tenir, la cour l'invite à revenir demain, les questions ratées ayant fait appel."
    ];
    else listes = [
      "Attendu que la matière demande encore du travail, la cour renvoie l'affaire en révision et rappelle que chaque question ratée reviendra jusqu'à consolidation.",
      "Attendu que la séance a surtout servi à repérer les points faibles, la cour constate que c'est exactement le rôle d'une audience et fixe la prochaine à demain."
    ];
    return listes[Math.floor(Math.random() * listes.length)];
  }
  function attenduDuel(monScore, sonScore, sonNom) {
    if (monScore > sonScore) return "Attendu que tu l'emportes " + monScore + " à " + sonScore + " face à " + sonNom + ", la cour t'adjuge la victoire et condamne la partie adverse à demander sa revanche.";
    if (monScore < sonScore) return "Attendu que " + sonNom + " l'emporte " + sonScore + " à " + monScore + ", la cour t'accorde le droit de faire appel, c'est-à-dire de prendre ta revanche immédiatement.";
    return "Attendu que les deux parties finissent à égalité parfaite, la cour ordonne un nouveau duel pour départager les plaideurs.";
  }

  /* ===================== Session de jeu ===================== */
  var session = null, chronoTimer = null;

  function lanceAudience() {
    var slug = etat.matiere;
    Promise.all([chargeMatiere(slug), chargePieges()]).then(function (res) {
      var questions = composeAudience(res[0], res[1]);
      session = {
        mode: "audience", slug: slug, data: res[0], questions: questions,
        index: 0, score: 0, multi: 1, resultats: [], objection: 0, objectionArmee: false,
        erreursFiche: {}
      };
      montreQuestion();
      montre("ecran-partie");
    }).catch(erreurChargement);
  }

  function lanceDuelCreation() {
    var slug = etat.matiere;
    chargeMatiere(slug).then(function (data) {
      var seed = Math.random().toString(36).slice(2, 10);
      session = {
        mode: "duel-creation", slug: slug, data: data, seed: seed,
        questions: composeDuel(data, seed),
        index: 0, score: 0, multi: 1, resultats: [], objection: 0, objectionArmee: false,
        erreursFiche: {}
      };
      montreQuestion();
      montre("ecran-partie");
    }).catch(erreurChargement);
  }

  function lanceDuelReponse(defi) {
    chargeMatiere(defi.m).then(function (data) {
      session = {
        mode: "duel-reponse", slug: defi.m, data: data, seed: defi.g, defi: defi,
        questions: composeDuel(data, defi.g),
        index: 0, score: 0, multi: 1, resultats: [], objection: 0, objectionArmee: false,
        erreursFiche: {}
      };
      montreQuestion();
      montre("ecran-partie");
    }).catch(erreurChargement);
  }

  function erreurChargement() {
    alert("Le chargement des questions a échoué. Vérifie ta connexion puis réessaie.");
    montre("ecran-accueil");
  }

  function estDuel() { return session.mode !== "audience"; }

  function montreQuestion() {
    var q = session.questions[session.index];
    $("compteur").textContent = (session.index + 1) + "/" + session.questions.length;
    $("barre-prog").style.width = (session.index / session.questions.length * 100) + "%";
    var badge = $("badge-format");
    badge.textContent = q.format;
    badge.classList.toggle("piege", !!q.piege);
    var qt = $("texte-question");
    if (q.remplir) {
      qt.innerHTML = "";
      var morceaux = q.texte.split("███");
      morceaux.forEach(function (part, i) {
        qt.appendChild(document.createTextNode(part));
        if (i < morceaux.length - 1) {
          var s = document.createElement("span");
          s.className = "trou"; s.textContent = "______";
          qt.appendChild(s);
        }
      });
    } else {
      qt.textContent = q.texte;
    }
    var zone = $("zone-options");
    zone.innerHTML = "";
    q.options.forEach(function (opt, i) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = opt;
      b.addEventListener("click", function () { repond(i); });
      zone.appendChild(b);
    });
    $("zone-justif").hidden = true;
    $("mention-appel").hidden = true;
    $("score-partie").textContent = session.score + " pt";
    $("multi-partie").textContent = session.multi > 1 ? "sans-faute ×" + session.multi.toFixed(2).replace(".", ",").replace(/,?0+$/, "") : "";
    var bo = $("btn-objection");
    bo.disabled = session.objection >= 1 && !session.objectionArmee;
    bo.classList.toggle("armee", session.objectionArmee);
    /* chrono en duel */
    if (estDuel()) {
      $("zone-chrono").hidden = false;
      demarreChrono(20, function () { repond(-1); });
    } else {
      $("zone-chrono").hidden = true;
    }
  }

  function demarreChrono(secondes, fin) {
    arreteChrono();
    var debut = Date.now(), duree = secondes * 1000;
    session.chronoDebut = debut; session.chronoDuree = duree;
    var barre = $("chrono-barre");
    barre.classList.remove("urgent");
    chronoTimer = setInterval(function () {
      var reste = duree - (Date.now() - debut);
      if (reste <= 0) { arreteChrono(); barre.style.width = "0%"; fin(); return; }
      barre.style.width = (reste / duree * 100) + "%";
      if (reste < 5000) barre.classList.add("urgent");
    }, 100);
    barre.style.width = "100%";
  }
  function arreteChrono() { if (chronoTimer) { clearInterval(chronoTimer); chronoTimer = null; } }

  function repond(i) {
    arreteChrono();
    var q = session.questions[session.index];
    var juste = i === q.bonne;
    var boutons = $("zone-options").querySelectorAll("button");
    boutons.forEach(function (b, k) {
      b.disabled = true;
      if (k === q.bonne) b.classList.add("bonne");
      else if (k === i) b.classList.add("mauvaise");
    });
    /* points */
    var pts = 0;
    if (juste) {
      pts = 100;
      if (estDuel()) {
        var reste = Math.max(0, session.chronoDuree - (Date.now() - session.chronoDebut));
        pts += Math.round(reste / 1000 * 5);
      } else {
        pts = Math.round(pts * session.multi);
      }
      if (session.objectionArmee) pts *= 2;
      session.score += pts;
      if (!estDuel()) session.multi = Math.min(2, session.multi + 0.25);
    } else {
      session.multi = 1;
      if (q.fiche) session.erreursFiche[q.fiche] = (session.erreursFiche[q.fiche] || 0) + 1;
    }
    if (session.objectionArmee) { session.objectionArmee = false; $("btn-objection").classList.remove("armee"); $("btn-objection").disabled = true; }
    session.resultats.push(juste ? 1 : 0);
    /* répétition espacée, hors pièges et duels reçus */
    if (q.id) noteReponse(q.id, session.slug, juste);
    sauve();
    /* justification */
    $("texte-justif").textContent = q.justif || (juste ? "Bonne réponse." : "La bonne réponse est en vert.");
    $("mention-appel").hidden = juste || !q.id || session.mode !== "audience";
    $("zone-justif").hidden = false;
    $("score-partie").textContent = session.score + " pt";
    $("zone-justif").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function questionSuivante() {
    session.index += 1;
    if (session.index >= session.questions.length) return finPartie();
    montreQuestion();
  }

  /* ===================== Verdict ===================== */
  function finPartie() {
    arreteChrono();
    var justes = session.resultats.reduce(function (a, b) { return a + b; }, 0);
    var total = session.resultats.length;
    var pct = Math.round(justes / total * 100);
    majSerie();
    $("verdict-score").textContent = session.score + " points";
    $("verdict-grille").textContent = session.resultats.map(function (r) { return r ? "🟩" : "🟥"; }).join("");
    var nomMatiere = session.data.nom + " " + session.data.niveau;
    var duelBloc = $("verdict-duel");
    duelBloc.hidden = true;
    if (session.mode === "audience") {
      etat.nbAudiences += 1;
      /* cote */
      var avant = cote(session.slug);
      var delta = Math.max(-15, Math.min(15, Math.round((pct - 65) / 3)));
      var apres = Math.max(800, avant + delta);
      etat.cotes[session.slug] = apres;
      $("verdict-attendu").textContent = attenduAudience(pct, nomMatiere);
      $("verdict-cote").textContent = "Ta cote en " + nomMatiere + " passe de " + avant + " à " + apres + " (" + palier(apres) + ").";
      var monte = palier(apres) !== palier(avant) && apres > avant;
      if (monte) $("verdict-cote").textContent += " Tu montes de juridiction.";
    } else if (session.mode === "duel-creation") {
      $("verdict-attendu").textContent = "Attendu que ton score de " + session.score + " points est enregistré, la cour t'invite à envoyer le défi. Ton adversaire jouera exactement les mêmes questions, avec le même chrono.";
      $("verdict-cote").textContent = "";
      duelBloc.hidden = false;
      duelBloc.textContent = "Ton défi est prêt. Le lien contient tes réponses, personne ne peut le rejouer à ta place.";
    } else {
      var d = session.defi;
      $("verdict-attendu").textContent = attenduDuel(session.score, d.p, d.n || "ton adversaire");
      $("verdict-cote").textContent = "";
      duelBloc.hidden = false;
      duelBloc.textContent = "Toi " + session.score + " pt · " + (d.n || "L'adversaire") + " " + d.p + " pt (" + d.s.reduce(function (a, b) { return a + b; }, 0) + "/" + d.s.length + " bonnes réponses).";
    }
    sauve();
    /* point faible et fiche recommandée */
    var pire = null, max = 0;
    for (var f in session.erreursFiche) if (session.erreursFiche[f] > max) { max = session.erreursFiche[f]; pire = f; }
    var carte = $("carte-lacune");
    var totalErreurs = total - justes;
    if (pire && session.data.page) {
      var titre = titreFiche(session.data, +pire);
      if (max >= 2)
        $("lacune-texte").textContent = "Tu as raté " + max + " questions sur le chapitre « " + titre + " ». C'est le chapitre à revoir en priorité, et la fiche complète " + nomMatiere + " le couvre en entier, avec le cours, les définitions et les pièges classiques.";
      else if (totalErreurs >= 2)
        $("lacune-texte").textContent = "Tes erreurs du jour touchent plusieurs chapitres, dont « " + titre + " ». La fiche complète " + nomMatiere + " reprend tout le programme chapitre par chapitre, donc tu révises une fois pour de bon.";
      else
        $("lacune-texte").textContent = "Ta seule hésitation porte sur le chapitre « " + titre + " ». La fiche complète " + nomMatiere + " te permet de le reprendre en entier avant le partiel.";
      $("lacune-lien").href = "../" + session.data.page;
      carte.hidden = false;
    } else {
      carte.hidden = true;
    }
    $("btn-defi-verdict").textContent = session.mode === "audience" ? "Défier quelqu'un sur cette matière" : "Envoyer le défi (copier le lien)";
    $("partage-verdict-ok").hidden = true;
    montre("ecran-verdict");
    majAccueil();
  }

  /* ===================== Duels, encodage du lien ===================== */
  function encodeDefi(obj) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodeDefi(s) {
    try {
      s = s.replace(/-/g, "+").replace(/_/g, "/");
      while (s.length % 4) s += "=";
      return JSON.parse(decodeURIComponent(escape(atob(s))));
    } catch (e) { return null; }
  }
  function lienDuel() {
    var nom = etat.nom;
    if (!nom) {
      nom = (prompt("Ton prénom, pour que ton adversaire sache qui le défie :") || "").trim().slice(0, 20);
      if (nom) { etat.nom = nom; sauve(); }
    }
    var charge = {
      m: session.slug, g: session.seed, p: session.score,
      s: session.resultats, n: nom || "Quelqu'un"
    };
    var url = location.origin + location.pathname + "#d=" + encodeDefi(charge);
    var justes = session.resultats.reduce(function (a, b) { return a + b; }, 0);
    var texte = (nom || "Quelqu'un") + " t'a mis " + justes + "/" + session.resultats.length + " en " + session.data.nom + " " + session.data.niveau + ". Revanche ?\n" + url;
    return partage(texte, "partage-verdict-ok");
  }
  function partage(texte, idOk) {
    if (navigator.share) {
      return navigator.share({ text: texte }).catch(function () { copie(texte, idOk); });
    }
    return copie(texte, idOk);
  }
  function copie(texte, idOk) {
    var fini = function () { if (idOk) { $(idOk).hidden = false; } };
    if (navigator.clipboard) return navigator.clipboard.writeText(texte).then(fini, fini);
    fini();
    return Promise.resolve();
  }

  /* ===================== Arrêt du jour ===================== */
  var arretCourant = null;
  function indexArretDuJour(n) {
    var j = joursDepuisEpoque();
    var pas = [17, 13, 11, 7, 3, 1].find(function (p) { return pgcd(p, n) === 1; }) || 1;
    return ((j * pas) % n + n) % n;
  }
  function pgcd(a, b) { return b ? pgcd(b, a % b) : a; }

  function lanceArret() {
    chargeArrets().then(function (base) {
      var jour = jourParis();
      arretCourant = base[indexArretDuJour(base.length)];
      $("arret-histoire").textContent = arretCourant.histoire;
      $("arret-question").textContent = arretCourant.question;
      var zone = $("arret-options");
      zone.innerHTML = "";
      var rnd = graine("arret-" + jour);
      var ordre = melange(arretCourant.options.map(function (_, i) { return i; }), rnd);
      ordre.forEach(function (orig) {
        var b = document.createElement("button");
        b.type = "button"; b.textContent = arretCourant.options[orig];
        b.addEventListener("click", function () { repondArret(orig, b, ordre); });
        zone.appendChild(b);
      });
      $("arret-revelation").hidden = true;
      montre("ecran-arret");
    }).catch(erreurChargement);
  }

  function repondArret(orig, bouton, ordre) {
    var jour = jourParis();
    var juste = orig === arretCourant.correct;
    var zone = $("arret-options");
    zone.querySelectorAll("button").forEach(function (b, k) {
      b.disabled = true;
      if (ordre[k] === arretCourant.correct) b.classList.add("bonne");
    });
    if (!juste) bouton.classList.add("mauvaise");
    /* série de l'Arrêt du jour + série générale */
    if (etat.dernierArret !== jour) {
      var ecart = etat.dernierArret ? numJour(jour) - numJour(etat.dernierArret) : null;
      etat.serieArret = ecart === 1 ? etat.serieArret + 1 : 1;
      etat.dernierArret = jour;
      etat.arrets[jour] = juste;
      majSerie();
      sauve();
    }
    var bandeau = $("arret-resultat");
    bandeau.textContent = juste ? "Bien vu, c'était la vraie solution." : "Les juges ont tranché autrement.";
    bandeau.className = "resultat-bandeau " + (juste ? "gagne" : "perdu");
    $("arret-reponse").textContent = arretCourant.revelation;
    $("arret-lien").href = ".." + arretCourant.url;
    $("partage-ok").hidden = true;
    $("arret-revelation").hidden = false;
    $("arret-revelation").scrollIntoView({ behavior: "smooth", block: "start" });
    majAccueil();
  }

  function partageArret() {
    var jour = jourParis();
    var num = joursDepuisEpoque() + 1;
    var carre = etat.arrets[jour] ? "🟩" : "🟥";
    var texte = "L'Arrêt du jour n°" + num + " ⚖️ " + carre + "\nSérie 🔥 " + etat.serieArret + "\nhttps://trajectoiredroit.com/jeu/";
    partage(texte, "partage-ok");
  }

  function partageVerdict() {
    var grille = session.resultats.map(function (r) { return r ? "🟩" : "🟥"; }).join("");
    var texte = "Cassation ⚖️ " + session.data.nom + " " + session.data.niveau + "\n" + grille + " · " + session.score + " pts\nhttps://trajectoiredroit.com/jeu/";
    partage(texte, "partage-verdict-ok");
  }

  /* ===================== Accueil ===================== */
  function majAccueil() {
    $("serie-val").textContent = etat.serie;
    /* niveaux */
    var niveaux = [];
    matieres.forEach(function (m) {
      var n = m.niveau.split(" ")[0];
      if (niveaux.indexOf(n) === -1) niveaux.push(n);
    });
    var zone = $("choix-niveau");
    zone.innerHTML = "";
    niveaux.forEach(function (n) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = n;
      b.setAttribute("role", "tab");
      if (n === etat.niveau) b.classList.add("actif");
      b.addEventListener("click", function () {
        etat.niveau = n;
        var premiere = matieres.find(function (m) { return m.niveau.indexOf(n) === 0; });
        if (premiere) etat.matiere = premiere.slug;
        sauve(); majAccueil();
      });
      zone.appendChild(b);
    });
    /* matières du niveau */
    var sel = $("select-matiere");
    sel.innerHTML = "";
    matieres.filter(function (m) { return m.niveau.indexOf(etat.niveau) === 0; }).forEach(function (m) {
      var o = document.createElement("option");
      o.value = m.slug; o.textContent = m.nom + " · " + m.niveau + " (" + m.nq + " questions)";
      sel.appendChild(o);
    });
    if (!sel.querySelector('option[value="' + etat.matiere + '"]')) {
      etat.matiere = sel.options.length ? sel.options[0].value : etat.matiere;
    }
    sel.value = etat.matiere;
    /* cote de la matière */
    var c = cote(etat.matiere);
    $("palier-nom").textContent = palier(c);
    $("cote-val").textContent = "cote " + c;
    /* questions en appel */
    var enAppel = questionsEnAppel(etat.matiere).length;
    var la = $("ligne-appel");
    if (enAppel > 0) {
      la.hidden = false;
      la.textContent = enAppel === 1
        ? "1 question a fait appel. Elle t'attend dans ta prochaine audience."
        : enAppel + " questions ont fait appel. Elles t'attendent dans ta prochaine audience.";
    } else la.hidden = true;
    /* arrêt du jour déjà joué */
    var dejaFait = etat.dernierArret === jourParis();
    $("btn-arret").hidden = dejaFait;
    $("arret-fait").hidden = !dejaFait;
    $("arret-numero").textContent = "n°" + (joursDepuisEpoque() + 1);
    /* stats */
    var stats = $("bloc-stats");
    stats.innerHTML = "";
    [[etat.serie, "jours de série"], [etat.nbAudiences, "audiences jouées"], [nbMaitrisees(), "questions maîtrisées"]].forEach(function (s) {
      var d = document.createElement("div");
      d.className = "stat";
      var b = document.createElement("b"); b.textContent = s[0];
      var sp = document.createElement("span"); sp.textContent = s[1];
      d.appendChild(b); d.appendChild(sp);
      stats.appendChild(d);
    });
    /* email déjà donné */
    $("carte-email").hidden = etat.emailOk;
  }

  /* ===================== Défi reçu au chargement ===================== */
  function traiteHash() {
    var m = location.hash.match(/#d=([A-Za-z0-9_-]+)/);
    if (!m) return false;
    var defi = decodeDefi(m[1]);
    history.replaceState(null, "", location.pathname);
    if (!defi || !defi.m || !defi.g || !defi.s) return false;
    var justes = defi.s.reduce(function (a, b) { return a + b; }, 0);
    var nomMat = (matieres.find(function (x) { return x.slug === defi.m; }) || { nom: "droit", niveau: "" });
    $("defi-texte").textContent = (defi.n || "Quelqu'un") + " t'a mis " + justes + "/" + defi.s.length + " (" + defi.p + " points) en " + nomMat.nom + " " + nomMat.niveau + ". Mêmes questions, même chrono de 20 secondes par question. À toi de faire mieux.";
    $("btn-accepter-defi").onclick = function () { lanceDuelReponse(defi); };
    montre("ecran-defi");
    return true;
  }

  /* ===================== Événements ===================== */
  document.querySelectorAll("[data-retour]").forEach(function (b) {
    b.addEventListener("click", function () { arreteChrono(); session = null; majAccueil(); montre("ecran-accueil"); });
  });
  document.querySelectorAll("[data-abandon]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (confirm("Abandonner l'audience en cours ?")) { arreteChrono(); session = null; majAccueil(); montre("ecran-accueil"); }
    });
  });
  $("btn-audience").addEventListener("click", lanceAudience);
  $("btn-duel").addEventListener("click", lanceDuelCreation);
  $("btn-arret").addEventListener("click", lanceArret);
  $("btn-suivant").addEventListener("click", questionSuivante);
  $("btn-objection").addEventListener("click", function () {
    if (session && session.objection < 1) {
      session.objection = 1;
      session.objectionArmee = true;
      this.classList.add("armee");
    }
  });
  $("btn-encore").addEventListener("click", function () {
    if (session && session.mode !== "audience") lanceDuelCreation(); else lanceAudience();
  });
  $("btn-defi-verdict").addEventListener("click", function () {
    if (!session) return;
    if (session.mode === "audience") lanceDuelCreation();
    else lienDuel();
  });
  $("btn-partage-verdict").addEventListener("click", partageVerdict);
  $("btn-partage-arret").addEventListener("click", partageArret);
  $("select-matiere").addEventListener("change", function () {
    etat.matiere = this.value; sauve(); majAccueil();
  });
  $("form-email").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var email = $("champ-email").value.trim();
    if (!email) return;
    fetch("../api/inscrire-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, source: "jeu-cassation" })
    }).then(function () {
      etat.emailOk = true; sauve();
      $("email-ok").hidden = false;
      $("form-email").hidden = true;
    }).catch(function () { $("email-ok").hidden = false; });
  });

  /* ===================== Démarrage ===================== */
  chargeJSON("data/matieres.json").then(function (liste) {
    matieres = liste;
    majAccueil();
    if (!traiteHash()) montre("ecran-accueil");
  }).catch(function () {
    document.body.insertAdjacentHTML("beforeend", "<p style='padding:20px;text-align:center'>Le jeu ne parvient pas à charger ses données. Recharge la page.</p>");
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
