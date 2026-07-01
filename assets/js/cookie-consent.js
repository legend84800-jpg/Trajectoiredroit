(function () {
  "use strict";
  var KEY = "tjd_consent";
  var stored = localStorage.getItem(KEY);

  function applyConsent(value) {
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", {
        analytics_storage: value === "granted" ? "granted" : "denied",
      });
    }
  }

  function setConsent(value) {
    localStorage.setItem(KEY, value);
    applyConsent(value);
  }

  if (stored) {
    applyConsent(stored);
    return;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var banner = document.createElement("div");
    banner.className = "cookie-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Cookies");
    banner.innerHTML =
      '<p class="cookie-banner__text">On utilise des cookies de mesure d’audience pour voir ce qui aide vraiment tes révisions. <a href="confidentialite.html">En savoir plus</a></p>' +
      '<div class="cookie-banner__actions">' +
      '<button type="button" class="btn btn--secondary btn--sm" data-cookie-decline>Refuser</button>' +
      '<button type="button" class="btn btn--primary btn--sm" data-cookie-accept>Accepter</button>' +
      "</div>";
    if (document.querySelector(".sticky-cta-bar, .sticky-cta")) {
      banner.classList.add("cookie-banner--above-sticky");
    }

    document.body.appendChild(banner);

    requestAnimationFrame(function () {
      banner.classList.add("cookie-banner--visible");
    });

    banner.querySelector("[data-cookie-accept]").addEventListener("click", function () {
      setConsent("granted");
      banner.classList.remove("cookie-banner--visible");
      setTimeout(function () { banner.remove(); }, 250);
    });
    banner.querySelector("[data-cookie-decline]").addEventListener("click", function () {
      setConsent("denied");
      banner.classList.remove("cookie-banner--visible");
      setTimeout(function () { banner.remove(); }, 250);
    });
  });
})();
