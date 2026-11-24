  (function(){
    var SUPABASE_URL = "https://ksqkhktcdgwrmzfcfjoe.supabase.co";
    var SUPABASE_ANON_KEY = "sb_publishable_Ahl2DDtcburQJZl1h2NHZQ_5eKh-isk";

    var cleSession = "sb-ksqkhktcdgwrmzfcfjoe-auth-token";
    var clePreference = "tjd-compte-rester-connecte";
    var stockageMemoire = {};
    function lireStockage(type, cle){
      try { return window[type].getItem(cle); } catch (_) { return null; }
    }
    function retirerStockage(type, cle){
      try { window[type].removeItem(cle); } catch (_) {}
    }
    var connexionConservee = lireStockage("localStorage", clePreference) === "1";
    // Une ancienne session enregistrée automatiquement ne vaut pas un choix.
    if (!connexionConservee) retirerStockage("localStorage", cleSession);
    var stockageCompte = {
      getItem: function(cle){
        return stockageMemoire[cle]
          || lireStockage(connexionConservee ? "localStorage" : "sessionStorage", cle) || null;
      },
      setItem: function(cle, valeur){
        try {
          window[connexionConservee ? "localStorage" : "sessionStorage"].setItem(cle, valeur);
          delete stockageMemoire[cle];
        } catch (_) { stockageMemoire[cle] = valeur; }
        retirerStockage(connexionConservee ? "sessionStorage" : "localStorage", cle);
      },
      removeItem: function(cle){
        delete stockageMemoire[cle];
        retirerStockage("sessionStorage", cle);
        retirerStockage("localStorage", cle);
      }
    };
    function choisirPersistence(conserver){
      var valeur = stockageCompte.getItem(cleSession);
      connexionConservee = conserver;
      if (conserver){
        try { window.localStorage.setItem(clePreference, "1"); } catch (_) {}
      } else retirerStockage("localStorage", clePreference);
      if (valeur) stockageCompte.setItem(cleSession, valeur);
    }
    var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storageKey: cleSession, storage: stockageCompte, persistSession: true }
    });

    var etatChargement = document.getElementById("etatChargement");
    var etatConnexion  = document.getElementById("etatConnexion");
    var etatConnecte   = document.getElementById("etatConnecte");

    var connexionForm    = document.getElementById("connexionForm");
    var connexionEmail   = document.getElementById("connexionEmail");
    var connexionSubmit  = document.getElementById("connexionSubmit");
    var connexionError   = document.getElementById("connexionError");
    var connexionSuccess = document.getElementById("connexionSuccess");
    var resterConnecte   = document.getElementById("resterConnecte");
    var codeForm         = document.getElementById("codeForm");
    var connexionCode    = document.getElementById("connexionCode");
    var codeSubmit       = document.getElementById("codeSubmit");
    var codeDestinataire = document.getElementById("codeDestinataire");
    var renvoyerCode     = document.getElementById("renvoyerCode");
    var changerEmail     = document.getElementById("changerEmail");
    var libelleRenvoi = renvoyerCode.textContent;
    var minuteurRenvoi = null;
    var emailEnAttente = "";
    var conserverEnAttente = false;
    var prochainEnvoi = 0;
    var generationConnexion = 0;
    var deconnexionEnCours = false;
    resterConnecte.checked = false;

    var compteEmail       = document.getElementById("compteEmail");
    var deconnexionBtn    = document.getElementById("deconnexionBtn");
    var achatsListe        = document.getElementById("achatsListe");
    var achatsVide         = document.getElementById("achatsVide");
    var achatsReessayer    = document.getElementById("achatsReessayer");
    var achatsAide         = document.getElementById("achatsAide");
    var generationSession = 0;
    var achatsOutils       = document.getElementById("achatsOutils");
    var achatsRecherche    = document.getElementById("achatsRecherche");
    var achatsProduit      = document.getElementById("achatsProduit");
    var achatsSemestre     = document.getElementById("achatsSemestre");
    var achatsReinitialiser = document.getElementById("achatsReinitialiser");
    var achatsResultat     = document.getElementById("achatsResultat");
    var achatsCourants = [];
    var relancerAchats = null;
    var titulaireVerifie = null;
    var lecteursSuspendus = null;
    var jetonAchats = null;
    var pdfAffiches = [];
    var pdfEnCours = null;
    var relancerPdf = null;
    var messageChargementAchats = "Chargement des documents…";
    var messageErreurAchats = "Le chargement de tes documents a échoué.";

    function lecteursAchats(){
      return Array.from(achatsListe.querySelectorAll?.("audio, video") || []);
    }

    function effacerAchats(){
      lecteursAchats().forEach(function(lecteur){
        lecteur.pause();
        lecteur.replaceChildren();
        lecteur.load();
      });
      achatsListe.innerHTML = "";
      achatsCourants = [];
      lecteursSuspendus = null;
      jetonAchats = null;
      pdfAffiches = [];
      pdfEnCours = null;
      relancerPdf = null;
      if (achatsOutils) achatsOutils.hidden = true;
      if (achatsRecherche) achatsRecherche.value = "";
      if (achatsProduit) { achatsProduit.innerHTML = ""; achatsProduit.value = ""; }
      if (achatsSemestre) { achatsSemestre.innerHTML = ""; achatsSemestre.value = ""; }
      if (achatsResultat) achatsResultat.textContent = "";
      achatsVide.textContent = "";
      achatsVide.style.display = "none";
      if (achatsAide) achatsAide.hidden = true;
      relancerAchats = null;
      if (achatsReessayer) {
        achatsReessayer.hidden = true;
        achatsReessayer.disabled = false;
      }
      var boite = document.getElementById("complementsBox");
      if (boite) boite.hidden = true;
      afficherParrainage(null);
    }

    function afficherEtat(id){
      [etatChargement, etatConnexion, etatConnecte].forEach(function(el){ el.classList.remove("is-active"); });
      document.getElementById(id).classList.add("is-active");
    }

    function texteRecherche(valeur){
      return String(valeur || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }
    function echapperFiltre(valeur){
      return String(valeur).replace(/[&<>"']/g, function(c){
        return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];
      });
    }
    function semestresExplicites(produit, fichier){
      var texte = texteRecherche([produit.id, produit.nom, fichier && fichier.nom, fichier && fichier.groupe].join(" "));
      var semestres = [];
      var motif = /(?:^|[^a-z0-9])s(?:emestre)?[ _-]*([12])(?=$|[^0-9])/g;
      var trouve;
      while ((trouve = motif.exec(texte)) !== null) {
        if (semestres.indexOf(trouve[1]) === -1) semestres.push(trouve[1]);
      }
      return semestres;
    }
    function preparerFiltresAchats(){
      if (!achatsOutils) return;
      var noms = [];
      var semestres = [];
      var sansSemestre = false;
      var nombreRessources = 0;
      achatsCourants.forEach(function(achat){
        (achat.produits || []).forEach(function(produit){
          if (produit.nom && noms.indexOf(produit.nom) === -1) noms.push(produit.nom);
          var fichiers = produit.fichiers && produit.fichiers.length ? produit.fichiers : [null];
          nombreRessources += fichiers.length;
          fichiers.forEach(function(fichier){
            if (fichier && fichier.groupe && noms.indexOf(fichier.groupe) === -1) noms.push(fichier.groupe);
            var explicites = semestresExplicites(produit, fichier);
            if (!explicites.length) sansSemestre = true;
            explicites.forEach(function(semestre){ if (semestres.indexOf(semestre) === -1) semestres.push(semestre); });
          });
        });
      });
      noms.sort(function(a,b){ return a.localeCompare(b,"fr"); });
      if (achatsProduit) achatsProduit.innerHTML = '<option value="">Tous les produits et matières</option>' + noms.map(function(nom){
        return '<option value="' + echapperFiltre(nom) + '">' + echapperFiltre(nom) + '</option>';
      }).join("");
      if (achatsSemestre) achatsSemestre.innerHTML = '<option value="">Tous les semestres</option>' + semestres.sort().map(function(semestre){
        return '<option value="' + semestre + '">Semestre ' + semestre + '</option>';
      }).join("") + (sansSemestre ? '<option value="non-precise">Sans semestre indiqué</option>' : "");
      achatsOutils.hidden = nombreRessources < 2;
    }
    function afficherAchatsFiltres(){
      var outilsMasques = achatsOutils && achatsOutils.hidden;
      var mots = texteRecherche(!outilsMasques && achatsRecherche && achatsRecherche.value).trim().split(/\s+/).filter(Boolean);
      var choixProduit = !outilsMasques && achatsProduit && achatsProduit.value || "";
      var choixSemestre = !outilsMasques && achatsSemestre && achatsSemestre.value || "";
      var nombreFichiers = 0;
      var achats = achatsCourants.reduce(function(resultat, achat){
        var produits = (achat.produits || []).reduce(function(liste, produit){
          function correspond(fichier){
            if (choixProduit && choixProduit !== produit.nom && (!fichier || choixProduit !== fichier.groupe)) return false;
            var semestres = semestresExplicites(produit, fichier);
            if (choixSemestre === "non-precise" && semestres.length) return false;
            if (choixSemestre && choixSemestre !== "non-precise" && semestres.indexOf(choixSemestre) === -1) return false;
            var texte = texteRecherche([produit.id, produit.nom, fichier && fichier.nom, fichier && fichier.groupe].join(" "));
            return mots.every(function(mot){ return texte.indexOf(mot) !== -1; });
          }
          var fichiers = (produit.fichiers || []).filter(correspond);
          nombreFichiers += fichiers.length;
          if (fichiers.length || (!(produit.fichiers || []).length && correspond(null))) {
            liste.push(Object.assign({}, produit, { fichiers: fichiers }));
          }
          return liste;
        }, []);
        if (produits.length) resultat.push(Object.assign({}, achat, { produits: produits }));
        return resultat;
      }, []);
      if (achatsResultat) achatsResultat.textContent = !outilsMasques && achatsCourants.length
        ? achats.length + (achats.length === 1 ? " achat affiché sur " : " achats affichés sur ") + achatsCourants.length
        : "";
      afficherAchats(achats, nombreFichiers === 1 && (outilsMasques || mots.length > 0));
    }
    [achatsRecherche, achatsProduit, achatsSemestre].forEach(function(champ){
      if (champ) champ.addEventListener(champ === achatsRecherche ? "input" : "change", afficherAchatsFiltres);
    });
    if (achatsReinitialiser) achatsReinitialiser.addEventListener("click", function(){
      if (achatsRecherche) achatsRecherche.value = "";
      if (achatsProduit) achatsProduit.value = "";
      if (achatsSemestre) achatsSemestre.value = "";
      afficherAchatsFiltres();
    });

    // Compléments et code de 15 % (14/10/2026) : le code est aussi mémorisé dans ce
    // navigateur, pour s'appliquer tout seul au paiement suivant (voir achat.js).
    var LIBELLES_RAISON = {
      "pack": "Le pack de la matière",
      "meme-matiere": "Même matière",
      "autre-matiere": "Même format, autre matière",
      "semestre-suivant": "Semestre suivant"
    };
    function afficherComplements(suggestions, remise){
      var boite = document.getElementById("complementsBox");
      var liste = document.getElementById("complementsListe");
      if (!boite || !liste) return;
      if (!suggestions || !suggestions.length){ boite.hidden = true; return; }
      function euros(c){ return (c / 100).toFixed(2).replace(".", ",") + " €"; }
      function echapper(t){ return String(t).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
      var pct = remise && remise.pourcentage ? remise.pourcentage : 0;
      if (remise && remise.code){
        try { localStorage.setItem("tjd_code_promo", JSON.stringify({ code: remise.code, expire: remise.expireLe * 1000 })); } catch (_) {}
        document.getElementById("compteRemiseCode").textContent = remise.code;
        document.getElementById("compteRemiseDate").textContent = remise.dateFin || "";
        document.getElementById("compteRemise").hidden = false;
      }
      liste.innerHTML = suggestions.map(function(s){
        var prix = pct ? "<s style=\"opacity:.7; font-weight:400\">" + euros(s.prix) + "</s> " + euros(Math.round(s.prix * (100 - pct) / 100)) : euros(s.prix);
        var libelle = LIBELLES_RAISON[s.raison] || "";
        var codeBouton = remise && remise.code ? " data-tjd-code=\"" + echapper(remise.code) + "\"" : "";
        return "<div style=\"display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; padding:12px 0; border-top:1px solid var(--blue-100)\">" +
          "<span style=\"flex:1 1 100%; font-size:.92rem\">" + (libelle ? "<span style=\"display:block; font-size:.75rem; text-transform:uppercase; letter-spacing:.04em; color:var(--muted)\">" + libelle + "</span>" : "") + echapper(s.nom) + (s.explication ? "<span style=\"display:block; margin-top:4px; font-size:.86rem; line-height:1.5; color:var(--muted)\">" + echapper(s.explication) + "</span>" : "") + "</span>" +
          "<button type=\"button\" class=\"btn btn--primary btn--sm\" style=\"white-space:nowrap\" data-tjd-produit=\"" + echapper(s.id) + "\"" + codeBouton + ">Acheter · " + prix + "</button>" +
        "</div>";
      }).join("");
      boite.hidden = false;
    }

    var parrainageBouton = document.getElementById("parrainageCopier");
    var parrainageLien = document.getElementById("parrainageLien");
    var parrainageStatut = document.getElementById("parrainageStatut");
    var parrainageCopieManuelle = document.getElementById("parrainageCopieManuelle");
    var libelleCopieParrainage = parrainageBouton && parrainageBouton.textContent;

    if (parrainageBouton) parrainageBouton.addEventListener("click", async function(){
      var lien = parrainageLien.value;
      if (!lien) return;
      var generation = generationSession;
      var copie = false;
      try {
        if (window.navigator.clipboard) {
          await window.navigator.clipboard.writeText(lien);
          copie = true;
        }
      } catch (_) {}
      if (generation !== generationSession || parrainageLien.value !== lien) return;
      parrainageCopieManuelle.hidden = copie;
      parrainageBouton.textContent = copie ? "Lien copié" : libelleCopieParrainage;
      parrainageStatut.textContent = copie ? "Lien copié" : "";
      if (!copie) {
        parrainageLien.focus();
        parrainageLien.select();
      }
    });

    function afficherParrainage(parrainage){
      var boite = document.getElementById("parrainageBox");
      if (!boite || !parrainageBouton) return;
      var liste = document.getElementById("parrainageBons");
      boite.hidden = true;
      parrainageLien.value = "";
      parrainageCopieManuelle.hidden = true;
      parrainageBouton.textContent = libelleCopieParrainage;
      parrainageStatut.textContent = "";
      liste.replaceChildren();
      if (!parrainage || !/^PARRAIN[A-Z0-9]{3,32}$/.test(parrainage.code)) return;
      parrainageLien.value = "https://trajectoiredroit.com/?code=" + encodeURIComponent(parrainage.code);
      var bons = Array.isArray(parrainage.bons) ? parrainage.bons : [];
      bons.filter(function(code){ return /^BON[A-F0-9]{20}$/.test(code); }).forEach(function(code){
        var element = document.createElement("li");
        var utilisation = document.createElement("a");
        utilisation.href = "/formations.html?code=" + encodeURIComponent(code);
        utilisation.textContent = "Utiliser mon bon de 10 €";
        element.appendChild(utilisation);
        liste.appendChild(element);
      });
      document.getElementById("parrainageSolde").textContent = liste.children.length * 10 + " € en bons d’achat disponibles";
      boite.hidden = false;
    }

    // Accès à vie en self-service : régénère des liens de téléchargement signés
    // à la demande (15 min) plutôt que de dépendre du lien 48h envoyé par email.
    async function demanderAchats(accessToken, generation){
      var rep = await fetch("/api/mes-telechargements", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessToken: accessToken })
      });
      if (generation !== generationSession) return null;
      if (rep.status === 401){
        actualiserSession(null);
        connexionError.textContent = "Ta session a expiré. Tu peux demander un nouveau code de connexion.";
        connexionError.style.display = "block";
        return null;
      }
      if (!rep.ok) throw new Error("Achats indisponibles");
      var data = await rep.json();
      if (generation !== generationSession) return null;
      if (!Array.isArray(data?.achats)) throw new Error("Réponse des achats invalide");
      return data;
    }

    async function chargerAchats(accessToken, generation, reprise){
      if (generation !== generationSession) return;
      relancerAchats = null;
      if (achatsAide) achatsAide.hidden = true;
      if (achatsReessayer) achatsReessayer.disabled = true;
      achatsVide.textContent = messageChargementAchats;
      achatsVide.style.display = "block";
      var data;
      try {
        data = await demanderAchats(accessToken, generation);
        if (!data || generation !== generationSession) return;
      } catch (e){
        if (generation !== generationSession) return;
        effacerAchats();
        afficherEtat("etatConnecte");
        achatsVide.textContent = messageErreurAchats;
        achatsVide.style.display = "block";
        if (achatsReessayer) {
          relancerAchats = function(){ return chargerAchats(accessToken, generation); };
          achatsReessayer.hidden = false;
          achatsReessayer.disabled = false;
        }
        return;
      }
      var achatsConserves = reprise && actualiserLiensAchats(data.achats);
      if (reprise && !achatsConserves) effacerAchats();
      lecteursSuspendus = null;
      if (achatsReessayer) {
        achatsReessayer.hidden = true;
        achatsReessayer.disabled = false;
      }
      jetonAchats = accessToken;
      afficherComplements(data && data.suggestions, data && data.remise);
      afficherParrainage(data && data.parrainage);
      if (achatsConserves) {
        afficherEtatDesAchats(!achatsListe.innerHTML);
      } else {
        achatsCourants = data.achats;
        preparerFiltresAchats();
        afficherAchatsFiltres();
      }
      afficherEtat("etatConnecte");
      if (achatsConserves) {
        lecteursAchats().forEach(function(lecteur){
          restaurerLecteur(lecteur, reprise.indexOf(lecteur) !== -1, generation);
        });
      }
    }

    achatsReessayer?.addEventListener("click", function(){
      if (relancerPdf) return relancerPdf();
      if (relancerAchats) return relancerAchats();
    });

    function referenceDocument(commande, produit, fichier){
      if (!produit.id) return null;
      var url;
      try {
        url = new URL(fichier.url);
      } catch (_) {
        return null;
      }
      if (url.origin !== "https://trajectoiredroit.com" || url.pathname !== "/api/telecharger"
          || url.username || url.password || url.hash) return null;
      var parametres = url.searchParams;
      var index = parametres.get("b");
      var expiration = parametres.get("exp");
      if (parametres.get("id") !== produit.id
          || (parametres.get("sid") || "") !== (commande.sessionId || "")
          || !/^\d+$/.test(index) || !/^\d{1,12}$/.test(expiration)
          || !/^[a-f0-9]{64}$/.test(parametres.get("sig"))) return null;
      return {
        // Le même libellé peut apparaître pour plusieurs commandes, produits ou fichiers.
        identite: JSON.stringify([commande.sessionId || "", commande.date, produit.id, index, fichier.groupe, fichier.nom, fichier.type, fichier.format]),
        fichier: fichier,
        expiration: Number(expiration)
      };
    }

    function referencePdf(commande, produit, fichier){
      return fichier.type === "pdf" && !fichier.format ? referenceDocument(commande, produit, fichier) : null;
    }

    function decrireAchats(achats, documents){
      return JSON.stringify(achats.map(function(commande){
        var produits = commande.produits.map(function(produit){
          var fichiers = produit.fichiers.map(function(fichier){
            var document = referenceDocument(commande, produit, fichier);
            if (!document) throw new Error("Document non reconnu");
            documents.push(document);
            return document.identite;
          });
          return [produit.id, produit.nom, fichiers];
        });
        return [commande.sessionId, commande.date, produits];
      }));
    }

    function actualiserLiensAchats(nouveauxAchats){
      var precedents = [];
      var nouveaux = [];
      try {
        if (decrireAchats(achatsCourants, precedents) !== decrireAchats(nouveauxAchats, nouveaux)) return false;
      } catch (_) {
        return false;
      }
      var nouveauxLiens = new Map(precedents.map(function(reference, index){
        return [reference.fichier.url, nouveaux[index]];
      }));
      achatsListe.querySelectorAll?.("a[href], source[src]").forEach(function(element){
        var attribut = element.tagName === "SOURCE" ? "src" : "href";
        var nouveau = nouveauxLiens.get(element.getAttribute(attribut));
        if (nouveau) element.setAttribute(attribut, nouveau.fichier.url);
      });
      pdfAffiches.forEach(function(reference){
        reference.expiration = nouveauxLiens.get(reference.fichier.url).expiration;
      });
      precedents.forEach(function(reference, index){
        reference.fichier.url = nouveaux[index].fichier.url;
      });
      return true;
    }

    function restaurerLecteur(lecteur, reprendre, generation){
      function reprendreLecture(){
        // Un navigateur peut demander un nouveau geste. La position reste en place.
        if (reprendre && lecteur.isConnected) lecteur.play().catch(function(){});
      }
      var expiration = new URLSearchParams(lecteur.currentSrc?.split("?")[1]).get("exp");
      var source = expiration && lecteur.querySelector("source[src]");
      if (source && source.src !== lecteur.currentSrc && Number(expiration) <= Date.now() / 1000) {
        var position = lecteur.currentTime;
        var vitesse = lecteur.playbackRate;
        lecteur.addEventListener("loadedmetadata", function(){
          if (generation !== generationSession || !lecteur.isConnected) return;
          lecteur.currentTime = Number.isFinite(lecteur.duration) ? Math.min(position, lecteur.duration) : position;
          lecteur.playbackRate = vitesse;
          reprendreLecture();
        }, { once: true });
        lecteur.load();
      } else {
        reprendreLecture();
      }
    }

    function afficherEtatDesAchats(listeVide){
      achatsVide.textContent = pdfEnCours ? messageChargementAchats
        : relancerPdf ? messageErreurAchats
        : achatsCourants.length
          ? "Aucun achat ne correspond à ces filtres. Tu peux les effacer pour tout retrouver."
          : "Aucun achat associé à cette adresse. Pour retrouver une commande, il faut se reconnecter avec l’adresse indiquée sur le reçu.";
      achatsVide.style.display = listeVide || pdfEnCours || relancerPdf ? "block" : "none";
      if (achatsAide) achatsAide.hidden = !listeVide || !jetonAchats || achatsCourants.length > 0 || !!pdfEnCours || !!relancerPdf;
    }

    async function renouvelerPdf(demande, generation){
      if (generation !== generationSession || !jetonAchats || pdfEnCours) return;
      pdfEnCours = demande;
      if (achatsReessayer) achatsReessayer.disabled = true;
      afficherEtatDesAchats(!achatsListe.innerHTML);
      try {
        var data = await demanderAchats(jetonAchats, generation);
        if (!data || generation !== generationSession) return;
        var correspondances = new Map();
        data.achats.forEach(function(commande){
          commande.produits.forEach(function(produit){
            (produit.fichiers || []).forEach(function(fichier){
              var reference = referencePdf(commande, produit, fichier);
              if (reference && reference.identite === demande.identite
                  && reference.expiration > demande.expiration && reference.expiration > Date.now() / 1000) {
                correspondances.set(fichier.url, reference.expiration);
              }
            });
          });
        });
        if (correspondances.size !== 1) throw new Error("Réponse du téléchargement invalide");
        var [nouveauLien, expiration] = correspondances.entries().next().value;
        window.location.assign(nouveauLien);
        demande.fichier.url = nouveauLien;
        pdfAffiches.forEach(function(reference, index){
          if (reference.identite !== demande.identite) return;
          reference.fichier.url = nouveauLien;
          reference.expiration = expiration;
          var lien = achatsListe.querySelector('a[data-pdf-compte="' + index + '"]');
          if (lien) lien.href = nouveauLien;
        });
        relancerPdf = null;
      } catch (_) {
        if (generation !== generationSession) return;
        relancerPdf = function(){ return renouvelerPdf(demande, generation); };
      } finally {
        if (generation === generationSession) {
          pdfEnCours = null;
          if (achatsReessayer) {
            achatsReessayer.hidden = !relancerPdf;
            achatsReessayer.disabled = false;
          }
          afficherEtatDesAchats(!achatsListe.innerHTML);
        }
      }
    }

    achatsListe.addEventListener("click", function(evenement){
      var lien = evenement.target.closest?.("a[data-pdf-compte]");
      if (!lien || !achatsListe.contains(lien) || evenement.defaultPrevented
          || evenement.ctrlKey || evenement.metaKey || evenement.shiftKey || evenement.altKey) return;
      var demande = pdfAffiches[Number(lien.dataset.pdfCompte)];
      if (demande && jetonAchats && !pdfEnCours
          && demande.expiration > Date.now() / 1000 + 15) return;
      evenement.preventDefault();
      if (demande) return renouvelerPdf(demande, generationSession);
    });

    function afficherAchats(achats, ouvrirVolet){
      pdfAffiches = [];
      afficherEtatDesAchats(!achats.length);
      if (!achats.length){
        achatsListe.innerHTML = "";
        return;
      }
      function echapperCompte(valeur){
        return String(valeur).replace(/[&<>"']/g, function(c){
          return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];
        });
      }
      function rendreFichier(f, commande, produit){
        if (f.type === "video") {
          var rectification = "";
          var parametresReplay = new URLSearchParams(String(f.url).split("?")[1] || "");
          if (parametresReplay.get("id") === "stage-methode-replay-sept2026") {
            var texteRectification = parametresReplay.get("b") === "1"
              ? "À partir de 20 minutes, distingue la preuve illicite, qui contrevient à une règle de droit, de la preuve déloyale, qui dépend du procédé utilisé pour l’obtenir. Dans le divorce, l’article 259-1 du Code civil exclut les preuves obtenues par violence ou fraude. Ainsi, l’agenda arraché pendant une altercation doit être écarté sur ce fondement. La seule atteinte à la vie privée ne permet pas, en revanche, d’écarter les messages sans examiner leur mode d’obtention."
              : parametresReplay.get("b") === "2"
                ? "Dans le passage vers 31 minutes, le président de la République est garant de l’indépendance de l’autorité judiciaire selon l’article 64 de la Constitution. L’article 56 fonde ses nominations au Conseil constitutionnel. De plus, sa qualité de chef des armées, prévue par l’article 15, doit être distinguée du régime de contreseing applicable à chaque acte."
                : "";
            if (texteRectification) {
              rectification = "<div class=\"replay-rectification\" style=\"max-width:480px; padding:12px; margin:8px 0; border-left:3px solid #8b1538; background:#f7f4f2; font-size:14px; line-height:1.6\">" +
                "<strong>Précisions sur le passage filmé</strong><p style=\"margin:6px 0 0\">" + echapperCompte(texteRectification) + "</p></div>";
            }
          }
          return "<div style=\"margin:6px 0\">" +
            "<div style=\"font-size:14px; margin-bottom:4px\">" + echapperCompte(f.nom) + "</div>" +
            "<video controls preload=\"none\" controlsList=\"nodownload noremoteplayback\" disablePictureInPicture oncontextmenu=\"return false\" style=\"width:100%; max-width:480px; border-radius:8px; display:block\">" +
              "<source src=\"" + f.url + "\" type=\"video/mp4\">" +
            "</video>" + rectification +
          "</div>";
        }
        if (f.type === "audio") {
          return "<div style=\"margin:6px 0\">" +
            "<div style=\"font-size:14px; margin-bottom:4px\">" + echapperCompte(f.nom) + "</div>" +
            "<audio controls preload=\"none\" controlsList=\"nodownload\" oncontextmenu=\"return false\" style=\"width:100%; max-width:480px; display:block\">" +
              "<source src=\"" + f.url + "\" type=\"audio/mp4\">" +
            "</audio>" +
          "</div>";
        }
        var reference = referencePdf(commande, produit, f);
        var marquePdf = reference ? ' data-pdf-compte="' + (pdfAffiches.push(reference) - 1) + '"' : "";
        var telechargement = "<a class=\"btn btn--outline btn--sm\" href=\"" + echapperCompte(f.url) + "\"" + marquePdf + " style=\"margin:4px 6px 0 0\">Télécharger " + echapperCompte(f.nom) + "</a>";
        if (f.format !== "apkg") return telechargement;
        return "<span style=\"display:inline-flex; flex-wrap:wrap; align-items:center\">" +
          telechargement +
          "<a class=\"btn btn--ghost btn--sm\" href=\"flashcards-qcm.html#importer-anki\" style=\"margin:4px 6px 0 0\">Importer les cartes dans Anki</a>" +
        "</span>";
      }
      function rendreFichiers(commande, produit){
        var fichiers = produit?.fichiers || [];
        function rendre(f){ return rendreFichier(f, commande, produit); }
        var groupes = [];
        var indexGroupes = Object.create(null);
        fichiers.forEach(function(f){
          if (!f.groupe){ groupes.push({ fichier: f }); return; }
          if (indexGroupes[f.groupe] === undefined){
            indexGroupes[f.groupe] = groupes.length;
            groupes.push({ nom: f.groupe, fichiers: [] });
          }
          groupes[indexGroupes[f.groupe]].fichiers.push(f);
        });
        var liens = groupes.map(function(g){
          if (g.fichier) return rendre(g.fichier);
          return (ouvrirVolet ? "<details open>" : "<details>") + "<summary>" + echapperCompte(g.nom) + "</summary><div class=\"pack-ultra-downloads__files\">" +
            g.fichiers.map(rendre).join("") + "</div></details>";
        }).join("");
        if (fichiers.some(function(f){ return !!f.groupe; })){
          liens = "<div class=\"pack-ultra-downloads\">" + liens + "</div>";
        }
        return liens;
      }
      achatsListe.innerHTML = achats.map(function(a){
        var date = new Date(a.date).toLocaleDateString("fr-FR");
        var debutCommande = "<li style=\"flex-direction:column; align-items:flex-start; gap:8px\">";
        if (a.produits.length > 1){
          var supports = a.produits.map(function(produit){
            var liens = rendreFichiers(a, produit);
            return "<div class=\"achat-produit\"><h3 class=\"achat-produit__titre\">" + echapperCompte(produit.nom) + "</h3>" +
              (liens ? "<div>" + liens + "</div>" : "") + "</div>";
          }).join("");
          return debutCommande +
            "<span class=\"achat-date\">" + date + "</span>" +
            "<div class=\"achat-produits\">" + supports + "</div></li>";
        }
        var produit = a.produits[0];
        var nom = produit ? echapperCompte(produit.nom) : "";
        return debutCommande +
          "<div class=\"compte-row\" style=\"width:100%\"><span>" + nom + "</span><span class=\"achat-date\">" + date + "</span></div>" +
          "<div>" + rendreFichiers(a, produit) + "</div></li>";
      }).join("");
    }

    function actualiserSession(session, evenement){
      if (deconnexionEnCours) session = null;
      var generation = ++generationSession;
      var ancienTitulaire = titulaireVerifie;
      var reprise = evenement === "TOKEN_REFRESHED" && session?.access_token && ancienTitulaire
        && (jetonAchats || lecteursSuspendus);
      if (reprise) {
        if (!lecteursSuspendus) {
          lecteursSuspendus = lecteursAchats().filter(function(lecteur){ return !lecteur.paused && !lecteur.ended; });
          lecteursSuspendus.forEach(function(lecteur){ lecteur.pause(); });
        }
        reprise = lecteursSuspendus;
        jetonAchats = null;
        pdfEnCours = null;
        relancerPdf = null;
      } else {
        titulaireVerifie = null;
        compteEmail.textContent = "";
        effacerAchats();
      }
      if (!session || !session.access_token){
        afficherEtat("etatConnexion");
        return;
      }
      afficherEtat("etatChargement");
      if (achatsAide) achatsAide.hidden = true;
      // Les appels Auth sont exécutés après le callback onAuthStateChange.
      window.setTimeout(async function(){
        if (generation !== generationSession) return;
        try {
          var verification = await sb.auth.getUser(session.access_token);
          if (generation !== generationSession) return;
          var utilisateur = verification.data && verification.data.user;
          if (verification.error || !utilisateur || !utilisateur.email_confirmed_at
              || utilisateur.is_anonymous === true || !utilisateur.email){
            actualiserSession(null);
            connexionError.textContent = "Ta session doit être vérifiée. Tu peux demander un nouveau code de connexion.";
            connexionError.style.display = "block";
            return;
          }
          if (reprise && (utilisateur.id !== ancienTitulaire.id || utilisateur.email !== ancienTitulaire.email)) {
            effacerAchats();
            reprise = null;
          }
          titulaireVerifie = utilisateur.id ? { id: utilisateur.id, email: utilisateur.email } : null;
          compteEmail.textContent = utilisateur.email;
          fermerFormulaireCode();
          connexionError.style.display = "none";
          connexionSuccess.style.display = "none";
          if (!reprise) afficherEtat("etatConnecte");
          var retour = new URLSearchParams(window.location.search);
          if (retour.get("retour") === "portalis") {
            var formule = retour.get("formule");
            var choix = ["portalis", "classique", "pro"].includes(formule)
              ? "?formule=" + encodeURIComponent(formule) : "";
            window.location.assign("portalis.html" + choix + "#espace");
            return;
          }
          await chargerAchats(session.access_token, generation, reprise);
        } catch (e){
          if (generation !== generationSession) return;
          actualiserSession(null);
          connexionError.textContent = "La vérification de ta connexion a échoué. Tu peux réessayer dans un instant.";
          connexionError.style.display = "block";
        }
      }, 0);
    }

    async function verifierSession(){
      var generation = generationSession;
      try {
        var res = await sb.auth.getSession();
        if (generation !== generationSession) return;
        actualiserSession(res.data && res.data.session);
      } catch (e){
        if (generation === generationSession) actualiserSession(null);
      }
    }

    function afficherErreur(message){
      connexionError.textContent = message;
      connexionError.style.display = "block";
    }
    function actualiserRenvoi(){
      if (minuteurRenvoi !== null) window.clearTimeout(minuteurRenvoi);
      minuteurRenvoi = null;
      var restant = codeForm.hidden ? 0 : Math.max(0, prochainEnvoi - Date.now());
      var secondes = Math.ceil(restant / 1000);
      renvoyerCode.disabled = codeForm.hidden || connexionSubmit.disabled || codeSubmit.disabled || secondes > 0;
      renvoyerCode.textContent = secondes ? "Nouveau code dans " + secondes + " s" : libelleRenvoi;
      if (secondes > 0) {
        minuteurRenvoi = window.setTimeout(actualiserRenvoi, restant - (secondes - 1) * 1000);
      }
    }

    function fermerFormulaireCode(){
      ++generationConnexion;
      emailEnAttente = "";
      prochainEnvoi = 0;
      connexionCode.value = "";
      codeForm.hidden = true;
      connexionForm.hidden = false;
      connexionSubmit.disabled = false;
      codeSubmit.disabled = false;
      changerEmail.disabled = false;
      actualiserRenvoi();
    }

    async function envoyerCode(email, conserver){
      if (connexionSubmit.disabled || codeSubmit.disabled) return;
      var generation = ++generationConnexion;
      connexionError.style.display = "none";
      connexionSuccess.style.display = "none";
      connexionSubmit.disabled = true;
      actualiserRenvoi();
      try {
        var res = await sb.auth.signInWithOtp({
          email: email,
          options: { emailRedirectTo: "https://trajectoiredroit.com/mon-compte.html" }
        });
        if (generation !== generationConnexion) return;
        if (res.error) throw res.error;
        emailEnAttente = email;
        conserverEnAttente = conserver;
        prochainEnvoi = Date.now() + 60000;
        codeDestinataire.textContent = email;
        connexionForm.hidden = true;
        codeForm.hidden = false;
        connexionCode.value = "";
        connexionSuccess.style.display = "block";
        connexionCode.focus();
      } catch (e){
        if (generation !== generationConnexion) return;
        afficherErreur("L'envoi du code a échoué. Tu peux réessayer dans une minute.");
      } finally {
        if (generation === generationConnexion) {
          connexionSubmit.disabled = false;
          actualiserRenvoi();
        }
      }
    }

    connexionForm.addEventListener("submit", function(e){
      e.preventDefault();
      return envoyerCode(connexionEmail.value.trim(), resterConnecte.checked);
    });

    function normaliserCode(){
      connexionCode.value = connexionCode.value.replace(/[\s-]/g, "");
      return connexionCode.value;
    }
    connexionCode.addEventListener("input", normaliserCode);

    codeForm.addEventListener("submit", async function(e){
      e.preventDefault();
      if (codeSubmit.disabled) return;
      connexionError.style.display = "none";
      connexionSuccess.style.display = "none";
      var code = normaliserCode();
      if (!emailEnAttente || !/^[0-9]{8}$/.test(code)){
        afficherErreur("Tu dois saisir les huit chiffres du code reçu par email.");
        return;
      }
      var generation = generationConnexion;
      codeSubmit.disabled = true;
      changerEmail.disabled = true;
      actualiserRenvoi();
      choisirPersistence(conserverEnAttente);
      try {
        var res = await sb.auth.verifyOtp({ email: emailEnAttente, token: code, type: "email" });
        if (generation !== generationConnexion) return;
        if (res.error || !res.data || !res.data.session) throw new Error("Code refusé");
        actualiserSession(res.data.session);
      } catch (e){
        if (generation !== generationConnexion) return;
        choisirPersistence(false);
        afficherErreur("Le code est incorrect ou a expiré. Tu peux le vérifier dans ton email ou demander un nouveau code.");
      } finally {
        if (generation === generationConnexion) {
          codeSubmit.disabled = false;
          changerEmail.disabled = false;
          actualiserRenvoi();
        }
      }
    });

    renvoyerCode.addEventListener("click", function(){
      if (!emailEnAttente || renvoyerCode.disabled || Date.now() < prochainEnvoi) return;
      return envoyerCode(emailEnAttente, conserverEnAttente);
    });

    changerEmail.addEventListener("click", function(){
      fermerFormulaireCode();
      connexionError.style.display = "none";
      connexionSuccess.style.display = "none";
      connexionEmail.focus();
    });

    deconnexionBtn.addEventListener("click", async function(){
      deconnexionEnCours = true;
      actualiserSession(null);
      fermerFormulaireCode();
      resterConnecte.checked = false;
      connexionSuccess.style.display = "none";
      try {
        var res = await sb.auth.signOut({ scope: "local" });
        if (res.error) throw res.error;
      } catch (e){
        connexionError.textContent = "La déconnexion n'a pas abouti. Tu peux réessayer en rechargeant cette page.";
        connexionError.style.display = "block";
      } finally {
        stockageCompte.removeItem(cleSession);
        choisirPersistence(false);
        deconnexionEnCours = false;
      }
    });

    sb.auth.onAuthStateChange(function(evenement, session){
      actualiserSession(session, evenement);
    });

    verifierSession();
  })();
