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

    function effacerAchats(){
      compteEmail.textContent = "";
      achatsListe.innerHTML = "";
      achatsVide.textContent = "Aucun achat pour l'instant.";
      achatsVide.style.display = "none";
    }

    function afficherEtat(id){
      [etatChargement, etatConnexion, etatConnecte].forEach(function(el){ el.classList.remove("is-active"); });
      document.getElementById(id).classList.add("is-active");
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
        return;
      }
      var achats = (rep.ok && data.achats) || [];
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
            return "<div style=\"margin:6px 0\">" +
              "<div style=\"font-size:14px; margin-bottom:4px\">" + echapperCompte(f.nom) + "</div>" +
              "<video controls controlsList=\"nodownload noremoteplayback\" disablePictureInPicture oncontextmenu=\"return false\" style=\"width:100%; max-width:480px; border-radius:8px; display:block\">" +
                "<source src=\"" + f.url + "\" type=\"video/mp4\">" +
              "</video>" +
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
