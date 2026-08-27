(function () {
  "use strict";

  var LEGACY_KEY = "tjd_consent";
  var STORAGE_KEY = "tjd_consent_v2";
  var STORAGE_VERSION = 2;
  var META_PIXEL_ID = "1736839687358457";
  var activePreferences = null;
  var lastFocusedElement = null;

  function safeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      // Le choix reste applique pendant la visite si le stockage local est bloque.
    }
  }

  function readPreferences() {
    var stored = safeGet(STORAGE_KEY);

    if (stored) {
      try {
        var parsed = JSON.parse(stored);
        if (
          parsed &&
          parsed.version === STORAGE_VERSION &&
          typeof parsed.analytics === "boolean" &&
          typeof parsed.advertising === "boolean"
        ) {
          return {
            analytics: parsed.analytics,
            advertising: parsed.advertising,
          };
        }
      } catch (error) {
        // Une ancienne valeur illisible est remplacee au prochain choix.
      }
    }

    var legacy = safeGet(LEGACY_KEY);
    if (legacy === "granted") {
      return { analytics: true, advertising: true };
    }
    if (legacy === "denied") {
      return { analytics: false, advertising: false };
    }
    return null;
  }

  function loadMetaPixel() {
    if (window.fbq) {
      window.fbq("consent", "grant");
      return;
    }

    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq("consent", "grant");
    window.fbq("init", META_PIXEL_ID);
    window.fbq("track", "PageView");
  }

  function applyPreferences(preferences) {
    activePreferences = {
      analytics: Boolean(preferences.analytics),
      advertising: Boolean(preferences.advertising),
    };

    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", {
        analytics_storage: activePreferences.analytics ? "granted" : "denied",
        ad_storage: activePreferences.advertising ? "granted" : "denied",
        ad_user_data: activePreferences.advertising ? "granted" : "denied",
        ad_personalization: activePreferences.advertising ? "granted" : "denied",
      });
    }

    if (activePreferences.advertising) {
      loadMetaPixel();
    } else if (window.fbq) {
      window.fbq("consent", "revoke");
    }
  }

  function savePreferences(preferences) {
    var normalized = {
      version: STORAGE_VERSION,
      analytics: Boolean(preferences.analytics),
      advertising: Boolean(preferences.advertising),
      updatedAt: new Date().toISOString(),
    };

    safeSet(STORAGE_KEY, JSON.stringify(normalized));
    // Les evenements Meta existants du site lisent encore cette cle.
    safeSet(LEGACY_KEY, normalized.advertising ? "granted" : "denied");
    applyPreferences(normalized);
  }

  function closeBanner() {
    var banner = document.querySelector(".cookie-banner");
    if (!banner) return;
    banner.classList.remove("cookie-banner--visible");
    setTimeout(function () { banner.remove(); }, 250);
  }

  function setSwitchState(button, enabled) {
    button.setAttribute("aria-checked", enabled ? "true" : "false");
    button.classList.toggle("cookie-switch--active", enabled);
  }

  function createPreferencesDialog() {
    var existing = document.querySelector(".cookie-preferences");
    if (existing) return existing;

    var dialog = document.createElement("dialog");
    dialog.className = "cookie-preferences";
    dialog.setAttribute("aria-labelledby", "cookiePreferencesTitle");
    dialog.innerHTML =
      '<div class="cookie-preferences__panel">' +
        '<div class="cookie-preferences__header">' +
          '<div>' +
            '<p class="cookie-preferences__eyebrow">Tes données, ton choix</p>' +
            '<h2 id="cookiePreferencesTitle">Modifier mes préférences</h2>' +
          '</div>' +
          '<button type="button" class="cookie-preferences__close" data-cookie-close aria-label="Fermer les préférences">&times;</button>' +
        '</div>' +
        '<p class="cookie-preferences__intro">Tu peux choisir les services autorisés sur ce navigateur. Les cookies essentiels restent actifs pour assurer le fonctionnement du site.</p>' +
        '<div class="cookie-preferences__list">' +
          '<div class="cookie-preference">' +
            '<div class="cookie-preference__copy">' +
              '<h3>Cookies essentiels</h3>' +
              '<p>Ils mémorisent tes réglages et sécurisent les fonctions indispensables du site.</p>' +
            '</div>' +
            '<span class="cookie-preference__required">Toujours actifs</span>' +
          '</div>' +
          '<div class="cookie-preference">' +
            '<div class="cookie-preference__copy">' +
              '<h3>Mesure d’audience</h3>' +
              '<p>Google Analytics nous aide à comprendre les pages consultées et la manière dont le site est utilisé.</p>' +
            '</div>' +
            '<button type="button" class="cookie-switch" role="switch" aria-checked="false" data-cookie-switch="analytics" aria-label="Autoriser Google Analytics"><span aria-hidden="true"></span></button>' +
          '</div>' +
          '<div class="cookie-preference">' +
            '<div class="cookie-preference__copy">' +
              '<h3>Publicité personnalisée</h3>' +
              '<p>Le pixel Meta mesure nos campagnes et permet d’adapter les publicités qui te sont présentées.</p>' +
            '</div>' +
            '<button type="button" class="cookie-switch" role="switch" aria-checked="false" data-cookie-switch="advertising" aria-label="Autoriser le pixel Meta"><span aria-hidden="true"></span></button>' +
          '</div>' +
        '</div>' +
        '<p class="cookie-preferences__notice">Matomo produit aussi des statistiques anonymes sans déposer de cookie. <a href="confidentialite.html#cookies">Détails dans la politique de confidentialité</a>.</p>' +
        '<div class="cookie-preferences__actions">' +
          '<button type="button" class="btn btn--secondary btn--sm" data-cookie-essential>Seulement les cookies essentiels</button>' +
          '<button type="button" class="btn btn--primary btn--sm" data-cookie-save>Enregistrer mes choix</button>' +
        '</div>' +
      '</div>';

    dialog.querySelectorAll("[data-cookie-switch]").forEach(function (button) {
      button.addEventListener("click", function () {
        setSwitchState(button, button.getAttribute("aria-checked") !== "true");
      });
    });

    dialog.querySelector("[data-cookie-close]").addEventListener("click", function () {
      dialog.close();
    });

    dialog.querySelector("[data-cookie-essential]").addEventListener("click", function () {
      savePreferences({ analytics: false, advertising: false });
      dialog.close();
      closeBanner();
    });

    dialog.querySelector("[data-cookie-save]").addEventListener("click", function () {
      savePreferences({
        analytics: dialog.querySelector('[data-cookie-switch="analytics"]').getAttribute("aria-checked") === "true",
        advertising: dialog.querySelector('[data-cookie-switch="advertising"]').getAttribute("aria-checked") === "true",
      });
      dialog.close();
      closeBanner();
    });

    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) dialog.close();
    });

    dialog.addEventListener("close", function () {
      if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
        lastFocusedElement.focus();
      }
    });

    document.body.appendChild(dialog);
    return dialog;
  }

  function openPreferences(trigger) {
    var dialog = createPreferencesDialog();
    var preferences = activePreferences || readPreferences() || {
      analytics: false,
      advertising: false,
    };

    setSwitchState(dialog.querySelector('[data-cookie-switch="analytics"]'), preferences.analytics);
    setSwitchState(dialog.querySelector('[data-cookie-switch="advertising"]'), preferences.advertising);
    lastFocusedElement = trigger || document.activeElement;

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    dialog.querySelector("[data-cookie-close]").focus();
  }

  function addManageLink() {
    if (document.querySelector("[data-cookie-manage]")) return;
    var privacyLink = document.querySelector('footer a[href$="confidentialite.html"]');
    if (!privacyLink) return;

    var manageLink = document.createElement("a");
    manageLink.href = "#gestion-cookies";
    manageLink.textContent = "Gérer mes cookies";
    manageLink.setAttribute("data-cookie-manage", "");
    manageLink.addEventListener("click", function (event) {
      event.preventDefault();
      openPreferences(manageLink);
    });
    privacyLink.insertAdjacentElement("afterend", manageLink);
  }

  function createBanner() {
    var banner = document.createElement("section");
    banner.className = "cookie-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-labelledby", "cookieBannerTitle");
    banner.setAttribute("aria-describedby", "cookieBannerDescription");
    banner.innerHTML =
      '<div class="cookie-banner__content">' +
        '<p class="cookie-banner__eyebrow">Tes données, ton choix</p>' +
        '<h2 id="cookieBannerTitle">Choisis les cookies que tu acceptes</h2>' +
        '<p class="cookie-banner__text" id="cookieBannerDescription">Les cookies optionnels nous aident à mesurer l’utilisation du site et nos publicités. <a href="confidentialite.html#cookies">En savoir plus</a></p>' +
      '</div>' +
      '<div class="cookie-banner__actions">' +
        '<button type="button" class="btn btn--sm cookie-choice cookie-choice--preferences" data-cookie-preferences>Modifier mes préférences</button>' +
        '<button type="button" class="btn btn--sm cookie-choice cookie-choice--essential" data-cookie-essential>Seulement les cookies essentiels</button>' +
        '<button type="button" class="btn btn--sm cookie-choice cookie-choice--accept" data-cookie-accept>Accepter les cookies</button>' +
      '</div>';

    if (document.querySelector(".sticky-cta-bar, .sticky-cta")) {
      banner.classList.add("cookie-banner--above-sticky");
    }

    document.body.appendChild(banner);

    banner.querySelector("[data-cookie-accept]").addEventListener("click", function () {
      savePreferences({ analytics: true, advertising: true });
      closeBanner();
    });

    banner.querySelector("[data-cookie-essential]").addEventListener("click", function () {
      savePreferences({ analytics: false, advertising: false });
      closeBanner();
    });

    banner.querySelector("[data-cookie-preferences]").addEventListener("click", function () {
      openPreferences(banner.querySelector("[data-cookie-preferences]"));
    });

    setTimeout(function () {
      requestAnimationFrame(function () {
        banner.classList.add("cookie-banner--visible");
      });
    }, 900);
  }

  var storedPreferences = readPreferences();
  if (storedPreferences) applyPreferences(storedPreferences);

  document.addEventListener("DOMContentLoaded", function () {
    addManageLink();
    if (!storedPreferences) createBanner();
  });

  window.tjdCookieConsent = {
    getPreferences: function () {
      return activePreferences || readPreferences();
    },
    openPreferences: function () {
      openPreferences(document.activeElement);
    },
  };
})();
