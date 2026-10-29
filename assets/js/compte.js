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
    var generationSession = 0;
    var achatsOutils       = document.getElementById("achatsOutils");
    var achatsRecherche    = document.getElementById("achatsRecherche");
    var achatsProduit      = document.getElementById("achatsProduit");
    var achatsSemestre     = document.getElementById("achatsSemestre");
    var achatsReinitialiser = document.getElementById("achatsReinitialiser");
    var achatsResultat     = document.getElementById("achatsResultat");
    var achatsCourants = [];

    function effacerAchats(){
      compteEmail.textContent = "";
      achatsListe.innerHTML = "";
      achatsCourants = [];
      if (achatsOutils) achatsOutils.hidden = true;
      if (achatsRecherche) achatsRecherche.value = "";
      if (achatsProduit) { achatsProduit.innerHTML = ""; achatsProduit.value = ""; }
      if (achatsSemestre) { achatsSemestre.innerHTML = ""; achatsSemestre.value = ""; }
      if (achatsResultat) achatsResultat.textContent = "";
      achatsVide.textContent = "Aucun achat pour l'instant.";
      achatsVide.style.display = "none";
      var boite = document.getElementById("complementsBox");
      if (boite) boite.hidden = true;
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
      achatsCourants.forEach(function(achat){
        (achat.produits || []).forEach(function(produit){
          if (produit.nom && noms.indexOf(produit.nom) === -1) noms.push(produit.nom);
          var fichiers = produit.fichiers && produit.fichiers.length ? produit.fichiers : [null];
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
      achatsOutils.hidden = !achatsCourants.length;
    }
    function afficherAchatsFiltres(){
      var mots = texteRecherche(achatsRecherche && achatsRecherche.value).trim().split(/\s+/).filter(Boolean);
      var choixProduit = achatsProduit && achatsProduit.value || "";
      var choixSemestre = achatsSemestre && achatsSemestre.value || "";
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
          if (fichiers.length || (!(produit.fichiers || []).length && correspond(null))) {
            liste.push(Object.assign({}, produit, { fichiers: fichiers }));
          }
          return liste;
        }, []);
        if (produits.length) resultat.push(Object.assign({}, achat, { produits: produits }));
        return resultat;
      }, []);
      if (achatsResultat) achatsResultat.textContent = achatsCourants.length
        ? achats.length + (achats.length === 1 ? " achat affiché sur " : " achats affichés sur ") + achatsCourants.length
        : "";
      afficherAchats(achats);
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
          "<span style=\"flex:1 1 100%; font-size:.92rem\">" + (libelle ? "<span style=\"display:block; font-size:.75rem; text-transform:uppercase; letter-spacing:.04em; color:var(--muted)\">" + libelle + "</span>" : "") + echapper(s.nom) + "</span>" +
          "<button type=\"button\" class=\"btn btn--primary btn--sm\" style=\"white-space:nowrap\" data-tjd-produit=\"" + echapper(s.id) + "\"" + codeBouton + ">Acheter · " + prix + "</button>" +
        "</div>";
      }).join("");
      boite.hidden = false;
    }

    // Accès à vie en self-service : régénère des liens de téléchargement signés
    // à la demande (15 min) plutôt que de dépendre du lien 48h envoyé par email.
    async function chargerAchats(accessToken, generation){
      var rep, data;
      try {
        rep = await fetch("/api/mes-telechargements", {
          method: "POST",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ accessToken: accessToken })
        });
        data = await rep.json();
        if (generation !== generationSession) return;
        if (rep.status === 401){
          actualiserSession(null);
          connexionError.textContent = "Ta session a expiré. Tu peux demander un nouveau code de connexion.";
          connexionError.style.display = "block";
          return;
        }
        if (!rep.ok) throw new Error("Achats indisponibles");
      } catch (e){
        if (generation !== generationSession) return;
        achatsVide.style.display = "block";
        achatsVide.textContent = "Impossible de charger tes achats pour l'instant. Réessaie dans un instant.";
        achatsListe.innerHTML = "";
        achatsCourants = [];
        if (achatsOutils) achatsOutils.hidden = true;
        if (achatsResultat) achatsResultat.textContent = "";
        return;
      }
      achatsCourants = (rep.ok && data.achats) || [];
      afficherComplements(data && data.suggestions, data && data.remise);
      preparerFiltresAchats();
      afficherAchatsFiltres();
    }

    function afficherAchats(achats){
      achatsVide.textContent = achatsCourants.length
        ? "Aucun achat ne correspond à ces filtres. Tu peux les effacer pour tout retrouver."
        : "Aucun achat pour l'instant.";
      if (!achats.length){
        achatsVide.style.display = "block";
        achatsListe.innerHTML = "";
        return;
      }
      achatsVide.style.display = "none";
      function echapperCompte(valeur){
        return String(valeur).replace(/[&<>"']/g, function(c){
          return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];
        });
      }
      achatsListe.innerHTML = achats.map(function(a, idx){
        var date = new Date(a.date).toLocaleDateString("fr-FR");
        var noms = a.produits.map(function(p){ return echapperCompte(p.nom); }).join(", ");
        var fichiers = a.produits.reduce(function(acc, p){ return acc.concat(p.fichiers); }, []);
        function rendreFichier(f){
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
          return "<a class=\"btn btn--outline btn--sm\" href=\"" + f.url + "\" style=\"margin:4px 6px 0 0\">Télécharger " + echapperCompte(f.nom) + "</a>";
        }
        var groupes = [];
        var indexGroupes = {};
        fichiers.forEach(function(f){
          if (!f.groupe){ groupes.push({ fichier: f }); return; }
          if (indexGroupes[f.groupe] === undefined){
            indexGroupes[f.groupe] = groupes.length;
            groupes.push({ nom: f.groupe, fichiers: [] });
          }
          groupes[indexGroupes[f.groupe]].fichiers.push(f);
        });
        var liens = groupes.map(function(g){
          if (g.fichier) return rendreFichier(g.fichier);
          return "<details><summary>" + echapperCompte(g.nom) + "</summary><div class=\"pack-ultra-downloads__files\">" +
            g.fichiers.map(rendreFichier).join("") + "</div></details>";
        }).join("");
        if (fichiers.some(function(f){ return !!f.groupe; })){
          liens = "<div class=\"pack-ultra-downloads\">" + liens + "</div>";
        }
        return "<li style=\"flex-direction:column; align-items:flex-start; gap:8px\">" +
          "<div class=\"compte-row\" style=\"width:100%\"><span>" + noms + "</span><span class=\"achat-date\">" + date + "</span></div>" +
          "<div>" + liens + "</div>" +
        "</li>";
      }).join("");
    }

    function actualiserSession(session){
      if (deconnexionEnCours) session = null;
      var generation = ++generationSession;
      effacerAchats();
      if (!session || !session.access_token){
        afficherEtat("etatConnexion");
        return;
      }
      afficherEtat("etatChargement");
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
          compteEmail.textContent = utilisateur.email;
          ++generationConnexion;
          emailEnAttente = "";
          connexionCode.value = "";
          codeForm.hidden = true;
          connexionForm.hidden = false;
          connexionError.style.display = "none";
          connexionSuccess.style.display = "none";
          afficherEtat("etatConnecte");
          var retour = new URLSearchParams(window.location.search);
          if (retour.get("retour") === "portalis") {
            var formule = retour.get("formule");
            var choix = ["portalis", "classique", "pro"].includes(formule)
              ? "?formule=" + encodeURIComponent(formule) : "";
            window.location.assign("portalis.html" + choix + "#espace");
            return;
          }
          await chargerAchats(session.access_token, generation);
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
    async function envoyerCode(email, conserver){
      var generation = ++generationConnexion;
      connexionError.style.display = "none";
      connexionSuccess.style.display = "none";
      connexionSubmit.disabled = true;
      renvoyerCode.disabled = true;
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
        connexionSubmit.disabled = false;
        renvoyerCode.disabled = false;
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
      renvoyerCode.disabled = true;
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
        codeSubmit.disabled = false;
        changerEmail.disabled = false;
        renvoyerCode.disabled = false;
      }
    });

    renvoyerCode.addEventListener("click", function(){
      if (Date.now() < prochainEnvoi){
        afficherErreur("Tu peux demander un nouveau code une minute après le précédent envoi.");
        return;
      }
      return envoyerCode(emailEnAttente, conserverEnAttente);
    });

    changerEmail.addEventListener("click", function(){
      ++generationConnexion;
      emailEnAttente = "";
      connexionCode.value = "";
      codeForm.hidden = true;
      connexionForm.hidden = false;
      connexionError.style.display = "none";
      connexionSuccess.style.display = "none";
      connexionEmail.focus();
    });

    deconnexionBtn.addEventListener("click", async function(){
      deconnexionEnCours = true;
      actualiserSession(null);
      ++generationConnexion;
      emailEnAttente = "";
      connexionCode.value = "";
      resterConnecte.checked = false;
      codeForm.hidden = true;
      connexionForm.hidden = false;
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

    sb.auth.onAuthStateChange(function(_event, session){
      actualiserSession(session);
    });

    verifierSession();
  })();
