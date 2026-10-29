/* Intégration paiement TJD (Stripe). Gère tous les boutons [data-tjd-produit] du site. */
(function () {
  var TEXTES_ORIGINAUX = {};
  var TENTATIVES_PAIEMENT = {};
  var BOUTONS_PAIEMENT = [];
  var ATTENTE_PAIEMENT_MS = 30000;

  function preparerTentative(corps, cle) {
    var copie = Object.assign({}, corps);
    delete copie.attemptId;
    delete copie.attemptCreatedAt;
    var empreinte = JSON.stringify(copie);
    var precedente = TENTATIVES_PAIEMENT[cle];
    if (precedente && precedente.empreinte === empreinte && Date.now() - precedente.date < 600000) {
      return precedente.corps;
    }
    TENTATIVES_PAIEMENT[cle] = { empreinte: empreinte, corps: corps, date: Date.now() };
    return corps;
  }

  function messagePaiement(bouton, erreur) {
    if (!document.createElement || !bouton.parentNode) {
      alert('Le paiement est momentanément indisponible. Tu peux réessayer.');
      return;
    }
    var message = bouton.parentNode.querySelector('.tjd-checkout-message');
    if (!message) {
      message = document.createElement('p');
      message.className = 'tjd-checkout-message';
      message.setAttribute('role', 'alert');
      message.style.cssText = 'font-size:.9rem;line-height:1.5;margin:10px 0;color:var(--ink,#17223b)';
      bouton.insertAdjacentElement('afterend', message);
    }
    message.textContent = erreur && erreur.tjdType === 'delai'
      ? 'L’ouverture du paiement prend trop de temps. Tu peux réessayer.'
      : 'Le paiement est momentanément indisponible. Tu peux réessayer.';
  }

  function demanderPaiement(corps, bouton, texteInitial) {
    var controle = typeof AbortController === 'function' ? new AbortController() : null;
    var minuteur;
    var message = bouton.parentNode && bouton.parentNode.querySelector('.tjd-checkout-message');
    if (message) message.remove();
    BOUTONS_PAIEMENT.push({ bouton: bouton, texte: texteInitial });
    var requete = Promise.resolve().then(function () { return fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
      signal: controle ? controle.signal : undefined
    }); }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw creerErreurCheckout(d.erreur || 'Création du paiement impossible', d.code || 'http', r.status);
        if (!d.url) throw creerErreurCheckout('URL Stripe absente', 'reponse_incomplete', 200);
        return d;
      });
    });
    var attente = typeof setTimeout === 'function' ? Promise.race([
      requete,
      new Promise(function (_, rejeter) {
        minuteur = setTimeout(function () {
          rejeter(creerErreurCheckout('Délai du paiement dépassé', 'delai', 0));
          if (controle) controle.abort();
        }, ATTENTE_PAIEMENT_MS);
      })
    ]) : requete;
    return attente.then(function (donnees) {
      if (minuteur) clearTimeout(minuteur);
      return donnees;
    }, function (erreur) {
      if (minuteur) clearTimeout(minuteur);
      throw erreur;
    });
  }

  if (window.addEventListener) window.addEventListener('pageshow', function (evenement) {
    if (!evenement.persisted) return;
    BOUTONS_PAIEMENT.forEach(function (entree) {
      entree.bouton.disabled = false;
      entree.bouton.textContent = entree.texte;
    });
    BOUTONS_PAIEMENT = [];
  });
  // Le stockage du navigateur peut être refusé ou plein. Les données utiles au
  // paiement restent alors en mémoire dans cette page, sans inventer de consentement.
  var STOCKAGE_EN_MEMOIRE = { localStorage: {}, sessionStorage: {} };

  function lireStockage(type, cle) {
    if (Object.prototype.hasOwnProperty.call(STOCKAGE_EN_MEMOIRE[type], cle)) {
      return STOCKAGE_EN_MEMOIRE[type][cle];
    }
    try {
      return (type === 'localStorage' ? localStorage : sessionStorage).getItem(cle);
    } catch (_) { return null; }
  }

  function ecrireStockage(type, cle, valeur) {
    try {
      (type === 'localStorage' ? localStorage : sessionStorage).setItem(cle, valeur);
      delete STOCKAGE_EN_MEMOIRE[type][cle];
      return true;
    } catch (_) {
      STOCKAGE_EN_MEMOIRE[type][cle] = String(valeur);
      return false;
    }
  }

  function retirerStockage(type, cle) {
    try {
      (type === 'localStorage' ? localStorage : sessionStorage).removeItem(cle);
      delete STOCKAGE_EN_MEMOIRE[type][cle];
    } catch (_) { STOCKAGE_EN_MEMOIRE[type][cle] = null; }
  }
  var CLES_ATTRIBUTION_PUBLICATION = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
  var CLE_ATTRIBUTION_PUBLICATION = 'tjd_attribution';
  var DUREE_ATTRIBUTION_PUBLICATION = 30 * 24 * 60 * 60 * 1000;
  var REFERENCE_PUBLICATION = /^diffusion\.[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  var REFERENCE_ORIENTATION = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  var attributionPublicationEnMemoire = null;

  function lireAttributionPublication() {
    var contact;
    try { contact = JSON.parse(lireStockage('localStorage', CLE_ATTRIBUTION_PUBLICATION) || 'null'); }
    catch (_) { contact = attributionPublicationEnMemoire; }
    if (!contact || typeof contact !== 'object' || typeof contact.ts !== 'number'
      || !Number.isFinite(contact.ts) || Date.now() - contact.ts < 0
      || Date.now() - contact.ts >= DUREE_ATTRIBUTION_PUBLICATION) return null;
    return contact;
  }

  function memoriserAttributionPublication() {
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (_) { return; }
    var porteUtm = CLES_ATTRIBUTION_PUBLICATION.some(function (cle) { return !!params.get(cle); });
    if (!porteUtm && !params.has('ap_ref') && !params.has('oq_ref')) return;
    var reference = params.get('ap_ref') || '';
    var referenceValide = reference.length === 83 && REFERENCE_PUBLICATION.test(reference);
    var orientation = params.get('oq_ref') || '';
    var orientationValide = params.getAll('oq_ref').length === 1 && orientation.length === 36 && REFERENCE_ORIENTATION.test(orientation);
    var contact = lireAttributionPublication();
    if (porteUtm || referenceValide || orientationValide) {
      // Le dernier lien de campagne remplace le contact précédent, avec ses seuls UTM.
      contact = {
        landing_page: window.location.pathname.replace(/^\//, '') || '/',
        referrer: (document.referrer || '').slice(0, 200),
        ts: Date.now()
      };
      CLES_ATTRIBUTION_PUBLICATION.forEach(function (cle) {
        var valeur = params.get(cle);
        if (valeur) contact[cle] = valeur.slice(0, 100);
        try {
          if (contact[cle]) ecrireStockage('sessionStorage', 'tjd_' + cle, contact[cle]);
          else retirerStockage('sessionStorage', 'tjd_' + cle);
        } catch (_) {}
      });
      try {
        ecrireStockage('sessionStorage', 'tjd_landing_page', contact.landing_page);
        if (contact.referrer) ecrireStockage('sessionStorage', 'tjd_referrer', contact.referrer);
        else retirerStockage('sessionStorage', 'tjd_referrer');
      } catch (_) {}
    }
    if (!contact) return;
    delete contact.atelierPublicationRef;
    delete contact.atelierOrientationRef;
    if (referenceValide) contact.atelierPublicationRef = reference;
    if (orientationValide) contact.atelierOrientationRef = orientation;
    attributionPublicationEnMemoire = contact;
    try { ecrireStockage('localStorage', CLE_ATTRIBUTION_PUBLICATION, JSON.stringify(contact)); } catch (_) {}
  }
  memoriserAttributionPublication();
  var contactAttributionAuChargement = lireAttributionPublication();
  var signatureContactAuChargement = signatureContactAttribution(contactAttributionAuChargement);

  function signatureContactAttribution(contact) {
    if (!contact) return '';
    return JSON.stringify([contact.ts, contact.landing_page || '', contact.referrer || '',
      contact.atelierPublicationRef || '', contact.atelierOrientationRef || '',
      contact.utm_source || '', contact.utm_medium || '', contact.utm_campaign || '', contact.utm_content || '']);
  }

  function ajouterAttributionPublication(corps) {
    var contact = lireAttributionPublication();
    if (!contact || signatureContactAttribution(contact) !== signatureContactAuChargement) return;
    // Une autre page peut avoir reçu un nouveau contact, même avec des UTM identiques.
    if (!CLES_ATTRIBUTION_PUBLICATION.every(function (cle) { return (contact[cle] || '') === (corps[cle] || ''); })) return;
    if (typeof contact.atelierPublicationRef === 'string' && contact.atelierPublicationRef.length === 83
      && REFERENCE_PUBLICATION.test(contact.atelierPublicationRef)) corps.atelierPublicationRef = contact.atelierPublicationRef;
    if (typeof contact.atelierOrientationRef === 'string' && contact.atelierOrientationRef.length === 36
      && REFERENCE_ORIENTATION.test(contact.atelierOrientationRef)) corps.atelierOrientationRef = contact.atelierOrientationRef;
  }

  function ajouterRecuComportement(corps) {
    delete corps.comportementReceipt;
    try {
      if (estTestInterne() || window.tjdCookieConsent?.getPreferences()?.behavior !== true || window.tjdCookieConsent?.allowsPurchaseLink?.() !== true) return;
      var recu = window.AtelierComportement?.getPurchaseReceipt?.();
      if (typeof recu === 'string' && /^acb3\.[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.\d{10}\.\d{10}\.[A-Za-z0-9_-]{43}$/.test(recu)) corps.comportementReceipt = recu;
    } catch (_) { /* Le paiement reste disponible lorsque le relevé est absent. */ }
  }

  // Ouvre dès le chargement la connexion vers Stripe sur les pages qui vendent,
  // pour que la page de paiement s'affiche plus vite après le clic sur Acheter.
  function preconnecterStripe() {
    if (!document.querySelector('[data-tjd-produit]')) return;
    ['https://checkout.stripe.com', 'https://js.stripe.com', 'https://m.stripe.network'].forEach(function (origine) {
      if (document.querySelector('link[rel="preconnect"][href="' + origine + '"]')) return;
      var lien = document.createElement('link');
      lien.rel = 'preconnect';
      lien.href = origine;
      lien.crossOrigin = 'anonymous';
      document.head.appendChild(lien);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', preconnecterStripe);
  else preconnecterStripe();

  function estTestInterne() {
    try {
      var parametre = new URLSearchParams(window.location.search).get('tjd_test');
      if (parametre === '1') ecrireStockage('localStorage', 'tjd_internal_test', '1');
      if (parametre === '0') retirerStockage('localStorage', 'tjd_internal_test');
      return lireStockage('localStorage', 'tjd_internal_test') === '1'
        || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)
        || window.location.protocol === 'file:';
    } catch (_) {
      return window.tjdTestInterne === true
        || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)
        || window.location.protocol === 'file:';
    }
  }

  // Codes promo (chantier conversion du 10/10/2026). Le champ code promo de Stripe
  // est masqué par défaut. Un lien du site qui porte ?code=XXX (email J+8, lien
  // ambassadeur) garde le code 30 jours pour l'appliquer d'office au paiement, et un
  // visiteur qui a déjà acheté (clé posée par merci-achat.html) garde le champ.
  var CLE_CODE_PROMO = 'tjd_code_promo';
  var CLE_DEJA_ACHETEUR = 'tjd_deja_acheteur';
  var DUREE_CODE_PROMO = 30 * 24 * 60 * 60 * 1000;
  var CODE_PROMO_VALIDE = /^[A-Za-z0-9_-]{3,40}$/;

  function memoriserCodePromo() {
    try {
      var code = (new URLSearchParams(window.location.search).get('code') || '').trim();
      if (!CODE_PROMO_VALIDE.test(code)) return;
      ecrireStockage('localStorage', CLE_CODE_PROMO, JSON.stringify({ code: code, expire: Date.now() + DUREE_CODE_PROMO }));
    } catch (_) { /* Le code reste utilisable dans cette page si le stockage est indisponible. */ }
  }
  memoriserCodePromo();

  function lireCodePromo() {
    try {
      var brut = lireStockage('localStorage', CLE_CODE_PROMO);
      if (!brut) return '';
      var donnees = JSON.parse(brut);
      if (!donnees || !CODE_PROMO_VALIDE.test(donnees.code || '') || !(donnees.expire > Date.now())) {
        retirerStockage('localStorage', CLE_CODE_PROMO);
        return '';
      }
      return donnees.code;
    } catch (_) { return ''; }
  }

  function estDejaAcheteur() {
    try { return lireStockage('localStorage', CLE_DEJA_ACHETEUR) === '1'; } catch (_) { return false; }
  }

  function ajouterCodePromo(corps, codeContextuel) {
    var code = typeof codeContextuel === 'string' && CODE_PROMO_VALIDE.test(codeContextuel)
      ? codeContextuel : lireCodePromo();
    if (code) corps.code = code;
    if (estDejaAcheteur()) corps.dejaAcheteur = true;
  }

  function typeAppareil() {
    var largeur = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    if (largeur < 768) return 'mobile';
    if (largeur < 1100) return 'tablette';
    return 'ordinateur';
  }

  function lireCookie(nom) {
    var m = document.cookie.match('(?:^|; )' + nom + '=([^;]*)');
    return m ? decodeURIComponent(m[1]) : null;
  }

  function creerAttemptId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'tjd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
  }

  function codeDiagnostic(valeur, valeurParDefaut) {
    return typeof valeur === 'string' && /^[a-z0-9_-]{1,40}$/.test(valeur)
      ? valeur
      : valeurParDefaut;
  }

  function creerErreurCheckout(message, type, statut) {
    var erreur = new Error(message || 'Création du paiement impossible');
    erreur.tjdType = codeDiagnostic(type, 'http');
    erreur.tjdStatut = Number.isInteger(statut) ? statut : 0;
    return erreur;
  }

  function mesurerCheckout(action, produitId, apresMesure, diagnostic) {
    if (typeof apresMesure !== 'function') {
      diagnostic = apresMesure || diagnostic;
      apresMesure = null;
    }
    if (estTestInterne()) {
      if (apresMesure) apresMesure();
      return;
    }
    diagnostic = diagnostic || {};
    var typeErreur = codeDiagnostic(diagnostic.type, 'inconnue');
    var statutErreur = Number.isInteger(diagnostic.statut) ? diagnostic.statut : 0;
    if (typeof window.gtag === 'function') {
      try {
        var parametresGtag = {
          items: [{ item_id: produitId }],
          page_path: window.location.pathname
        };
        if (action === 'CheckoutErreur') {
          parametresGtag.error_type = typeErreur;
          parametresGtag.http_status = statutErreur;
        }
        gtag('event', action === 'CheckoutCree' ? 'checkout_session_created' : 'checkout_error', parametresGtag);
      } catch (_) {
        // Un outil de mesure indisponible ne doit pas bloquer le paiement.
      }
    }
    if (window._paq) {
      try {
        window._paq.push(['trackEvent', 'Ecommerce', action, produitId]);
        if (action === 'CheckoutErreur') {
          window._paq.push([
            'trackEvent',
            'EcommerceDiagnostic',
            'CheckoutErreurDetail',
            produitId + '|' + typeErreur + '|' + statutErreur
          ]);
        }
      } catch (_) {
        // Le suivi reste facultatif pour ouvrir Stripe.
      }
    }
    if (apresMesure) apresMesure();
  }

  function tjdAcheter(produitId, btnEl) {
    if (!btnEl) btnEl = document.querySelector('[data-tjd-produit="' + produitId + '"]');
    if (!btnEl) return;
    if (btnEl.disabled) return;
    var idx = produitId + '-' + Array.from(document.querySelectorAll('[data-tjd-produit="' + produitId + '"]')).indexOf(btnEl);
    TEXTES_ORIGINAUX[idx] = TEXTES_ORIGINAUX[idx] || btnEl.textContent.trim();

    // Order bump : si le bouton référence une checkbox cochée, on ajoute ce produit à la même session.
    var bumpId = btnEl.getAttribute('data-tjd-bump');
    var bumpCheckboxId = btnEl.getAttribute('data-tjd-bump-checkbox');
    var bumpCheckbox = bumpCheckboxId ? document.getElementById(bumpCheckboxId) : null;
    var bumpActif = !!(bumpId && bumpCheckbox && bumpCheckbox.checked);

    // Identifiants Meta transmis uniquement si le visiteur a accepté les cookies,
    // pour permettre à l'API Conversions de recouper l'achat avec le pixel côté serveur.
    var corps = bumpActif ? { produitId: produitId, bumpId: bumpId } : { produitId: produitId };
    // Paiement en 2 ou 3 fois sans frais (Packs Ultra) : le serveur revérifie le produit.
    var echeances = parseInt(btnEl.getAttribute('data-tjd-echeances') || '', 10);
    if (echeances === 2 || echeances === 3) corps.echeances = echeances;
    corps.attemptId = creerAttemptId();
    corps.attemptCreatedAt = Math.floor(Date.now() / 1000);
    if (lireStockage('localStorage', 'tjd_consent') === 'granted') {
      var fbp = lireCookie('_fbp');
      var fbc = lireCookie('_fbc');
      if (fbp) corps.fbp = fbp;
      if (fbc) corps.fbc = fbc;
      corps.consentMarketing = true;
    }

    // Attribution capturée par main.js à la première page vue de la session,
    // pour relier chaque vente à sa page et sa source d'origine.
    corps.landingPage = lireStockage('sessionStorage', 'tjd_landing_page') || window.location.pathname.replace(/^\//, '');
    // Page réellement en cours au moment du clic (peut différer de la landing page
    // si le visiteur a navigué avant d'acheter) : sert de cancel_url pour ne pas
    // renvoyer tout le monde vers formations.html en cas d'abandon du paiement.
    corps.pageActuelle = window.location.pathname.replace(/^\//, '') + window.location.hash;
    corps.deviceType = typeAppareil();
    corps.viewport = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0)
      + 'x' + Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    corps.internalTest = estTestInterne();
    ajouterCodePromo(corps, btnEl.getAttribute('data-tjd-code'));
    var referrerSession = lireStockage('sessionStorage', 'tjd_referrer');
    if (referrerSession) corps.referrer = referrerSession;
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(function (cle) {
      var val = lireStockage('sessionStorage', 'tjd_' + cle);
      if (val) corps[cle] = val;
    });
    ajouterAttributionPublication(corps);
    ajouterRecuComportement(corps);
    corps = preparerTentative(corps, idx);

    lancerPaiement();

    function lancerPaiement() {
      // Mesure du funnel : le clic Acheter, avant même la redirection Stripe,
      // pour pouvoir calculer un taux de clic par page et un taux d'abandon vers le paiement.
      try {
        if (!estTestInterne() && typeof window.gtag === 'function') {
          gtag('event', 'begin_checkout', {
            items: [{ item_id: produitId }],
            page_path: window.location.pathname
          });
        }
      } catch (_) {}
      try {
        if (!estTestInterne() && window._paq) {
          window._paq.push(['trackEvent', 'Ecommerce', 'ClicAcheter', produitId]);
        }
      } catch (_) {}

      btnEl.disabled = true;
      btnEl.textContent = 'Chargement…';
      demanderPaiement(corps, btnEl, TEXTES_ORIGINAUX[idx])
        .then(function (d) {
          if (d.url) {
            try {
              if (!estTestInterne() && lireStockage('localStorage', 'tjd_consent') === 'granted' && typeof window.fbq === 'function') {
                fbq('track', 'InitiateCheckout', { content_ids: [produitId], content_type: 'product' });
              }
            } catch (_) {}
            mesurerCheckout('CheckoutCree', produitId);
            delete TENTATIVES_PAIEMENT[idx];
            window.location.assign(d.url);
          }
          else {
            throw creerErreurCheckout('URL Stripe absente', 'reponse_incomplete', 200);
          }
        })
        .catch(function (erreur) {
          mesurerCheckout('CheckoutErreur', produitId, {
            type: erreur && erreur.tjdType ? erreur.tjdType : 'reseau',
            statut: erreur && Number.isInteger(erreur.tjdStatut) ? erreur.tjdStatut : 0
          });
          messagePaiement(btnEl, erreur);
          btnEl.disabled = false;
          btnEl.textContent = TEXTES_ORIGINAUX[idx] || 'Acheter';
        });
    }
  }

  window.tjdAcheter = tjdAcheter;
  window.tjdEstTestInterne = estTestInterne;
  window.tjdTypeAppareil = typeAppareil;
  window.tjdMesurerCheckout = mesurerCheckout;

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-tjd-produit]');
    if (!btn) return;
    var produitId = btn.getAttribute('data-tjd-produit');
    if (!produitId) return;
    e.preventDefault();
    tjdAcheter(produitId, btn);
  });

  // Total dynamique de l'order bump : le libellé du bouton reflète le prix réel
  // dès que la case est cochée, au lieu de garder un prix fixe qui ne correspond
  // plus à ce qui sera réellement facturé sur Stripe.
  function euroVersCentimes(txt) {
    var m = txt && txt.match(/([\d]+)[,.]?(\d{0,2})\s*€/);
    if (!m) return null;
    return parseInt(m[1], 10) * 100 + parseInt((m[2] || '0').padEnd(2, '0'), 10);
  }
  function centimesVersEuro(c) {
    return (c / 100).toFixed(2).replace('.', ',') + ' €';
  }
  function initTotauxBump() {
    document.querySelectorAll('[data-tjd-bump-checkbox]').forEach(function (btn) {
      var checkboxId = btn.getAttribute('data-tjd-bump-checkbox');
      var checkbox = checkboxId ? document.getElementById(checkboxId) : null;
      if (!checkbox) return;
      var label = checkbox.closest('label');
      var prixBumpCentimes = euroVersCentimes(label ? label.textContent : '');
      var texteBase = btn.textContent;
      var prixBaseCentimes = euroVersCentimes(texteBase);
      if (prixBumpCentimes == null || prixBaseCentimes == null) return;
      var prefixe = texteBase.replace(/[\d]+[,.]?\d{0,2}\s*€\s*$/, '').replace(/[·\-–:]\s*$/, '').trim();
      checkbox.addEventListener('change', function () {
        var total = prixBaseCentimes + (checkbox.checked ? prixBumpCentimes : 0);
        btn.textContent = prefixe + ' · ' + centimesVersEuro(total);
      });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTotauxBump);
  } else {
    initTotauxBump();
  }

  // Réassurance sous chaque bouton d'achat principal (pas les boutons compacts en liste,
  // ni celui de la modale d'aperçu) : garantie, paiement Stripe, livraison immédiate.
  // Le remboursement ne s'applique qu'à l'achat à l'unité : jamais aux packs, ni aux
  // cours complets ou flashcards/QCM, qui restent sur l'ancien design sans cette ligne.
  var TEXTE_REASSURANCE = 'Satisfait ou remboursé sous 7 jours · Paiement sécurisé par Stripe · PDF reçu immédiatement par email';
  function initReassurance() {
    document.querySelectorAll('.btn--full[data-tjd-produit]').forEach(function (btn) {
      if (btn.id === 'apercuCta') return;
      var produitId = btn.getAttribute('data-tjd-produit') || '';
      if (produitId.indexOf('cours-fiche-') === 0 || produitId.indexOf('flashcards-qcm-') === 0 || produitId.indexOf('pack-') === 0) return;
      var parent = btn.parentElement;
      if (!parent || parent.querySelector('.tjd-reassurance')) return;
      var suivant = btn.nextElementSibling;
      if (suivant && /pdf complet par email/i.test(suivant.textContent || '')) suivant.remove();
      var p = document.createElement('p');
      p.className = 'tjd-reassurance';
      p.textContent = TEXTE_REASSURANCE;
      btn.insertAdjacentElement('afterend', p);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReassurance);
  } else {
    initReassurance();
  }

  // Garantie réussite (décision de Julien du 10/10/2026) : une ligne discrète sous
  // chaque bloc d'achat, une seule fois par bloc, avec le lien vers les conditions.
  // Le stage et Portalis en sont exclus, comme la barre d'achat collante (trop
  // étroite) et la modale d'aperçu. Style injecté ici pour ne pas toucher style.css.
  var TEXTE_GARANTIE = 'Si tu n’as pas la moyenne à l’examen, je te rembourse. ';
  var LIEN_GARANTIE = '/garantie-reussite.html';
  var SELECTEUR_BLOC_ACHAT = '[data-tjd-bloc-achat], .product__body, .conversion-offer__choices, .article-produit-inline, .article-pack, .card';

  function produitAvecGarantie(produitId) {
    return !!produitId && produitId !== 'stage-methode' && produitId.indexOf('portalis') !== 0;
  }

  function injecterStyleGarantie() {
    if (document.getElementById('tjdGarantieStyle')) return;
    var style = document.createElement('style');
    style.id = 'tjdGarantieStyle';
    style.textContent =
      '.tjd-garantie{display:flex;align-items:flex-start;gap:6px;margin:10px 0 0;' +
      'font-size:.8rem;line-height:1.45;opacity:.8;text-align:left}' +
      '.tjd-garantie--centre{justify-content:center;text-align:center}' +
      '.tjd-garantie svg{flex:0 0 auto;margin-top:2px}' +
      '.tjd-garantie a{color:inherit;text-decoration:underline;text-underline-offset:2px;white-space:nowrap}' +
      '.tjd-garantie a:hover{opacity:1}';
    document.head.appendChild(style);
  }

  function creerLigneGarantie() {
    var p = document.createElement('p');
    p.className = 'tjd-garantie';
    p.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>' +
      '<span></span>';
    var texte = p.querySelector('span');
    texte.appendChild(document.createTextNode(TEXTE_GARANTIE));
    var lien = document.createElement('a');
    lien.href = LIEN_GARANTIE;
    lien.textContent = 'Lire les conditions';
    texte.appendChild(lien);
    return p;
  }

  function initGarantie() {
    if (/(^|\/)(portalis|stage-methode|merci-stage)[^/]*\.html$/.test(window.location.pathname)) return;
    var styleInjecte = false;
    document.querySelectorAll('[data-tjd-produit]').forEach(function (btn) {
      if (!produitAvecGarantie(btn.getAttribute('data-tjd-produit'))) return;
      if (btn.id === 'apercuCta' || btn.closest('.sticky-cta-bar, [data-tjd-sans-garantie], #tjdPanierBackdrop')) return;
      var bloc = btn.closest(SELECTEUR_BLOC_ACHAT) || btn.parentElement;
      if (!bloc || bloc.getAttribute('data-tjd-garantie') === '1') return;
      bloc.setAttribute('data-tjd-garantie', '1');
      if (!styleInjecte) { injecterStyleGarantie(); styleInjecte = true; }
      var ligne = creerLigneGarantie();
      // Les choix en ligne (boutons côte à côte) reçoivent la mention juste après la
      // rangée. Les cartes la reçoivent tout en bas, sous le dernier bouton.
      var apres = bloc.classList.contains('conversion-offer__choices');
      // L'encart d'article est une rangée flex (vignette, texte, boutons) : la mention
      // va sous le texte, sinon elle devient une 4e colonne et écrase le texte.
      var corpsEncart = bloc.classList.contains('article-produit-inline')
        ? bloc.querySelector('.article-produit-inline__body') : null;
      if (corpsEncart) bloc = corpsEncart;
      var conteneur = apres ? bloc.parentElement : bloc;
      try {
        if (conteneur && window.getComputedStyle(conteneur).textAlign === 'center') ligne.classList.add('tjd-garantie--centre');
      } catch (_) {}
      if (apres) bloc.insertAdjacentElement('afterend', ligne);
      else bloc.appendChild(ligne);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGarantie);
  } else {
    initGarantie();
  }

  // ===== PANIER MULTI-PRODUITS (chantier 5.12, ajouté le 21/09/2026) =====
  // Reste séparé du flux "Acheter" ci-dessus, qui continue de créer une session
  // Stripe immédiate à 1 (ou 2 avec bump) produit, sans aucun changement de
  // comportement. Le panier est une deuxième voie, pour l'élève qui veut
  // plusieurs matières choisies sur plusieurs pages en un seul paiement.
  var CLE_PANIER = 'tjd_panier';
  var panierSansConservation = false;

  function panierLire() {
    try {
      var brut = lireStockage('localStorage', CLE_PANIER);
      var liste = brut ? JSON.parse(brut) : [];
      return Array.isArray(liste) ? liste.filter(function (a) {
        return a && typeof a.id === 'string' && typeof a.prixCentimes === 'number';
      }) : [];
    } catch (_) { return []; }
  }

  function panierEcrire(liste) {
    panierSansConservation = !ecrireStockage('localStorage', CLE_PANIER, JSON.stringify(liste));
    panierRafraichir();
  }

  function panierContient(id) {
    return panierLire().some(function (a) { return a.id === id; });
  }

  function panierAjouter(id, nom, prixCentimes) {
    if (panierContient(id)) return false;
    var liste = panierLire();
    liste.push({ id: id, nom: nom, prixCentimes: prixCentimes });
    panierEcrire(liste);
    return true;
  }

  function panierRetirer(id) {
    panierEcrire(panierLire().filter(function (a) { return a.id !== id; }));
  }

  window.tjdPanierVider = function () {
    try { retirerStockage('localStorage', CLE_PANIER); } catch (_) {}
    panierRafraichir();
  };

  function panierTotalCentimes() {
    return panierLire().reduce(function (s, a) { return s + (a.prixCentimes || 0); }, 0);
  }

  // Remonte au plus proche titre pertinent (carte catalogue, encart article, page produit
  // seule) plutôt que de dépendre d'un attribut à poser sur chaque bouton du site.
  function nomProduitProche(bouton) {
    var el = bouton;
    for (var i = 0; i < 6 && el && el.parentElement; i++) {
      el = el.parentElement;
      var titre = el.querySelector('.product__title, .conversion-offer__title, .article-produit-inline__title, h3, h2, h1');
      if (titre && titre.textContent && titre.textContent.trim()) return titre.textContent.trim().slice(0, 120);
    }
    var h1 = document.querySelector('h1');
    return h1 && h1.textContent ? h1.textContent.trim().slice(0, 120) : 'Produit Trajectoire Droit';
  }

  var PRODUIT_EXCLU_PANIER = { 'stage-methode': true };

  function panierSyncLien(lien, produitId) {
    var dansPanier = panierContient(produitId);
    lien.disabled = dansPanier;
    lien.innerHTML = dansPanier
      ? 'Déjà dans ton panier ✓'
      : '+ <span class="tjd-panier-lien__full">Ajouter au panier</span><span class="tjd-panier-lien__short">Panier</span>';
  }

  function initPanierBoutons() {
    document.querySelectorAll('[data-tjd-produit]').forEach(function (bouton) {
      var produitId = bouton.getAttribute('data-tjd-produit');
      if (!produitId || PRODUIT_EXCLU_PANIER[produitId]) return;
      var parent = bouton.parentElement;
      if (!parent) return;
      var existant = parent.querySelector('[data-tjd-panier-lien="' + produitId + '"]');
      // Le lien existe déjà (ex. après un retrait depuis le tiroir) : on resynchronise juste
      // son état au lieu de le sauter, sinon "Ajouté ✓" reste affiché pour un produit retiré.
      if (existant) { panierSyncLien(existant, produitId); return; }
      var prixCentimes = euroVersCentimes(bouton.textContent);
      if (prixCentimes == null) return;
      var nom = nomProduitProche(bouton);
      var lien = document.createElement('button');
      lien.type = 'button';
      lien.className = 'tjd-panier-lien';
      lien.setAttribute('data-tjd-panier-lien', produitId);
      lien.dataset.produitId = produitId;
      lien.dataset.nom = nom;
      lien.dataset.prix = String(prixCentimes);
      panierSyncLien(lien, produitId);
      bouton.insertAdjacentElement('afterend', lien);
    });
  }

  document.addEventListener('click', function (e) {
    var lien = e.target.closest('[data-tjd-panier-lien]');
    if (!lien) return;
    e.preventDefault();
    var produitId = lien.dataset.produitId;
    var ajoute = panierAjouter(produitId, lien.dataset.nom, parseInt(lien.dataset.prix, 10));
    if (ajoute) {
      lien.textContent = 'Ajouté ✓';
      lien.disabled = true;
      panierOuvrirBadgeUnInstant();
      if (!estTestInterne() && typeof window.gtag === 'function') {
        gtag('event', 'add_to_cart', { items: [{ item_id: produitId }], page_path: window.location.pathname });
      }
      if (!estTestInterne() && window._paq) {
        window._paq.push(['trackEvent', 'Ecommerce', 'AjoutPanier', produitId]);
      }
    }
  });

  // ---- Interface du panier (badge flottant + tiroir), injectée en JS pur : aucune page
  // HTML à modifier, exactement le même principe que la bulle de assets/js/chatbot.js. ----
  var panierUIPrete = false;
  var panierBadgeTimer = null;

  function panierInjecterCSS() {
    var style = document.createElement('style');
    style.textContent =
      '.tjd-panier-lien{display:block;margin-top:8px;background:none;border:none;padding:0;' +
      'font-family:var(--font-body,inherit);font-size:.8rem;color:var(--muted,#5B6B84);text-decoration:underline;' +
      'cursor:pointer;text-align:inherit}' +
      '.tjd-panier-lien:hover{color:var(--navy,#1A2851)}' +
      '.tjd-panier-lien:disabled{cursor:default;text-decoration:none;color:var(--emerald,#257952)}' +
      '.tjd-panier-fab{position:fixed;left:20px;bottom:20px;z-index:9997;display:inline-flex;align-items:center;' +
      'gap:8px;background:var(--navy,#1A2851);color:#fff;border:none;border-radius:999px;padding:13px 20px;' +
      'cursor:pointer;font-family:var(--font-body,inherit);font-weight:600;font-size:.9rem;' +
      'box-shadow:0 8px 24px rgba(15,26,53,.3);opacity:0;pointer-events:none;transform:translateY(10px);' +
      'transition:opacity .25s ease,transform .25s ease}' +
      '.tjd-panier-fab.tjd-panier-fab--visible{opacity:1;pointer-events:auto;transform:translateY(0)}' +
      '.tjd-panier-fab__badge{background:var(--gold-line,#C9A961);color:var(--navy,#1A2851);border-radius:999px;' +
      'min-width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;' +
      'font-size:.75rem;font-weight:700;padding:0 5px}' +
      'body:has(#tjdPanierBackdrop.open) .tjd-fab{opacity:0!important;pointer-events:none!important}' +
      '#tjdPanierBackdrop{position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.6);display:none;' +
      'align-items:center;justify-content:center;padding:16px}' +
      '#tjdPanierBackdrop.open{display:flex}' +
      '.tjd-panier-panel{background:var(--white,#fff);border-radius:var(--r-xl,24px);padding:28px;' +
      'max-width:460px;width:100%;max-height:min(640px,85vh);display:flex;flex-direction:column;' +
      'box-shadow:0 24px 60px rgba(15,26,53,.32);position:relative;font-family:var(--font-body,inherit)}' +
      '.tjd-panier-panel__close{position:absolute;top:14px;right:14px;background:none;border:none;' +
      'font-size:1.4rem;color:var(--muted,#5B6B84);cursor:pointer;padding:6px 10px}' +
      '.tjd-panier-panel__titre{font-family:var(--font-display,serif);font-size:1.4rem;color:var(--navy,#1A2851);' +
      'margin:0 0 16px}' +
      '.tjd-panier-liste{overflow-y:auto;flex:1;margin-bottom:16px}' +
      '.tjd-panier-item{display:flex;justify-content:space-between;align-items:center;gap:10px;' +
      'padding:10px 0;border-bottom:1px solid var(--border,#E2E8F0)}' +
      '.tjd-panier-item__nom{font-size:.92rem;color:var(--ink,#0F172A)}' +
      '.tjd-panier-item__prix{font-weight:700;color:var(--navy,#1A2851);white-space:nowrap;margin-left:10px}' +
      '.tjd-panier-item__retirer{background:none;border:none;color:var(--danger,#EF4444);cursor:pointer;' +
      'font-size:1.1rem;padding:4px 8px;margin-left:6px}' +
      '.tjd-panier-vide{color:var(--muted,#5B6B84);font-size:.92rem;text-align:center;padding:24px 0}' +
      '.tjd-panier-total{display:flex;justify-content:space-between;align-items:center;' +
      'font-family:var(--font-display,serif);font-size:1.15rem;color:var(--navy,#1A2851);' +
      'padding-top:14px;border-top:2px solid var(--border-strong,#CBD5E1);margin-bottom:16px}' +
      '.tjd-panier-total[hidden]{display:none}' +
      '.tjd-panier-cta{width:100%;padding:14px;border-radius:var(--r-md,12px);border:none;' +
      'background:var(--navy,#1A2851);color:#fff;font-weight:700;font-size:1rem;cursor:pointer}' +
      '.tjd-panier-cta:disabled{opacity:.6;cursor:default}' +
      '.tjd-panier-note{font-size:.78rem;color:var(--muted,#5B6B84);text-align:center;margin-top:10px}';
    document.head.appendChild(style);
  }

  function panierInjecterMarkup() {
    var fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'tjd-panier-fab';
    fab.id = 'tjdPanierFab';
    fab.setAttribute('aria-label', 'Ouvrir le panier');
    fab.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>' +
      '<span>Panier</span><span class="tjd-panier-fab__badge" id="tjdPanierBadge">0</span>';
    document.body.appendChild(fab);

    // Le bouton panier se posait sur la barre d'achat collante et masquait son texte
    // (audit mobile du 15/10/2026) : il se cale au-dessus d'elle quand elle est affichée.
    var barreCollante = document.querySelector('.sticky-cta-bar, .sticky-cta');
    if (barreCollante) {
      var panierCaler = function () {
        var visible = getComputedStyle(barreCollante).display !== 'none';
        fab.style.bottom = visible ? (barreCollante.getBoundingClientRect().height + 12) + 'px' : '';
      };
      panierCaler();
      window.addEventListener('resize', panierCaler);
      if (typeof ResizeObserver === 'function') new ResizeObserver(panierCaler).observe(barreCollante);
    }

    var backdrop = document.createElement('div');
    backdrop.id = 'tjdPanierBackdrop';
    backdrop.innerHTML =
      '<div class="tjd-panier-panel">' +
        '<button type="button" class="tjd-panier-panel__close" data-tjd-panier-fermer aria-label="Fermer">✕</button>' +
        '<h2 class="tjd-panier-panel__titre">Ton panier</h2>' +
        '<div class="tjd-panier-liste" id="tjdPanierListe"></div>' +
        '<div class="tjd-panier-total" id="tjdPanierTotal" hidden><span>Total</span><span id="tjdPanierTotalMontant"></span></div>' +
        '<button type="button" class="tjd-panier-cta" id="tjdPanierCta">Passer au paiement</button>' +
        '<p class="tjd-panier-note">Un seul paiement Stripe pour tout le panier · PDF reçus par email juste après</p>' +
        '<p class="tjd-panier-note" id="tjdPanierTemporaire" hidden>Ce panier reste disponible tant que tu gardes cette page ouverte.</p>' +
      '</div>';
    document.body.appendChild(backdrop);

    fab.addEventListener('click', function () {
      panierRendreListe();
      backdrop.classList.add('open');
    });
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop || e.target.closest('[data-tjd-panier-fermer]')) backdrop.classList.remove('open');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') backdrop.classList.remove('open');
    });
    document.getElementById('tjdPanierCta').addEventListener('click', panierCheckout);
  }

  function panierRendreListe() {
    var liste = panierLire();
    var precisionConservation = document.getElementById('tjdPanierTemporaire');
    if (precisionConservation) precisionConservation.hidden = !liste.length || !panierSansConservation;
    var conteneur = document.getElementById('tjdPanierListe');
    var totalBloc = document.getElementById('tjdPanierTotal');
    var cta = document.getElementById('tjdPanierCta');
    if (!conteneur) return;
    if (!liste.length) {
      conteneur.innerHTML = '<p class="tjd-panier-vide">Ton panier est vide. Ajoute une fiche, une majeure ou un pack depuis n’importe quelle page du site.</p>';
      totalBloc.hidden = true;
      cta.disabled = true;
      return;
    }
    conteneur.innerHTML = liste.map(function (a) {
      return '<div class="tjd-panier-item"><span class="tjd-panier-item__nom">' + a.nom.replace(/</g, '&lt;') + '</span>' +
        '<span class="tjd-panier-item__prix">' + centimesVersEuro(a.prixCentimes) + '</span>' +
        '<button type="button" class="tjd-panier-item__retirer" data-tjd-panier-retirer="' + a.id + '" aria-label="Retirer">✕</button></div>';
    }).join('');
    document.getElementById('tjdPanierTotalMontant').textContent = centimesVersEuro(panierTotalCentimes());
    totalBloc.hidden = false;
    cta.disabled = false;
    conteneur.querySelectorAll('[data-tjd-panier-retirer]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        panierRetirer(btn.getAttribute('data-tjd-panier-retirer'));
        panierRendreListe();
        initPanierBoutons(); // réactive le lien "Ajouter au panier" du produit retiré, s'il est visible sur cette page
      });
    });
  }

  function panierRafraichir() {
    var badge = document.getElementById('tjdPanierBadge');
    var fab = document.getElementById('tjdPanierFab');
    if (!badge || !fab) return;
    var n = panierLire().length;
    badge.textContent = String(n);
    fab.classList.toggle('tjd-panier-fab--visible', n > 0);
    if (document.getElementById('tjdPanierBackdrop').classList.contains('open')) panierRendreListe();
  }

  function panierOuvrirBadgeUnInstant() {
    var fab = document.getElementById('tjdPanierFab');
    if (!fab) return;
    fab.classList.add('tjd-panier-fab--pulse');
    clearTimeout(panierBadgeTimer);
    panierBadgeTimer = setTimeout(function () { fab.classList.remove('tjd-panier-fab--pulse'); }, 600);
  }

  function panierCheckout() {
    if (document.getElementById('tjdPanierCta').disabled) return;
    var liste = panierLire();
    if (!liste.length) return;
    panierLancerPaiement(liste);
  }

  function panierLancerPaiement(liste) {
    var cta = document.getElementById('tjdPanierCta');
    var texteOriginal = cta.textContent;
    cta.disabled = true;
    cta.textContent = 'Chargement…';

    var corps = { produitIds: liste.map(function (a) { return a.id; }) };
    corps.attemptId = creerAttemptId();
    corps.attemptCreatedAt = Math.floor(Date.now() / 1000);
    if (lireStockage('localStorage', 'tjd_consent') === 'granted') {
      var fbp = lireCookie('_fbp');
      var fbc = lireCookie('_fbc');
      if (fbp) corps.fbp = fbp;
      if (fbc) corps.fbc = fbc;
      corps.consentMarketing = true;
    }
    corps.landingPage = lireStockage('sessionStorage', 'tjd_landing_page') || window.location.pathname.replace(/^\//, '');
    corps.pageActuelle = window.location.pathname.replace(/^\//, '') + window.location.hash;
    corps.deviceType = typeAppareil();
    corps.viewport = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0)
      + 'x' + Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    corps.internalTest = estTestInterne();
    ajouterCodePromo(corps);
    var referrerSession = lireStockage('sessionStorage', 'tjd_referrer');
    if (referrerSession) corps.referrer = referrerSession;
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(function (cle) {
      var val = lireStockage('sessionStorage', 'tjd_' + cle);
      if (val) corps[cle] = val;
    });
    ajouterAttributionPublication(corps);

    try {
      if (!estTestInterne() && typeof window.gtag === 'function') {
        gtag('event', 'begin_checkout', {
          items: liste.map(function (a) { return { item_id: a.id }; }),
          page_path: window.location.pathname
        });
      }
    } catch (_) {}
    try {
      if (!estTestInterne() && window._paq) {
        window._paq.push(['trackEvent', 'Ecommerce', 'ClicAcheterPanier', liste.map(function (a) { return a.id; }).join('+')]);
      }
    } catch (_) {}

    ajouterRecuComportement(corps);
    corps = preparerTentative(corps, 'panier');
    demanderPaiement(corps, cta, texteOriginal)
      .then(function (d) {
        if (!d.url) throw creerErreurCheckout('URL Stripe absente', 'reponse_incomplete', 200);
        try {
          if (!estTestInterne() && lireStockage('localStorage', 'tjd_consent') === 'granted' && typeof window.fbq === 'function') {
            fbq('track', 'InitiateCheckout', { content_ids: liste.map(function (a) { return a.id; }), content_type: 'product' });
          }
        } catch (_) {}
        mesurerCheckout('CheckoutCree', 'panier');
        delete TENTATIVES_PAIEMENT.panier;
        window.location.assign(d.url);
      })
      .catch(function (erreur) {
        mesurerCheckout('CheckoutErreur', 'panier', {
          type: erreur && erreur.tjdType ? erreur.tjdType : 'reseau',
          statut: erreur && Number.isInteger(erreur.tjdStatut) ? erreur.tjdStatut : 0
        });
        messagePaiement(cta, erreur);
        cta.disabled = false;
        cta.textContent = texteOriginal;
      });
  }

  function initPanier() {
    if (panierUIPrete) return;
    panierUIPrete = true;
    panierInjecterCSS();
    panierInjecterMarkup();
    panierRafraichir();
    initPanierBoutons();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPanier);
  } else {
    initPanier();
  }
})();
