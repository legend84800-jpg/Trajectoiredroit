(() => {
  const form = document.getElementById("enquete-form");
  const fields = document.getElementById("enquete-champs");
  const support = document.getElementById("enquete-support");
  const usage = document.getElementById("enquete-usage");
  const details = document.getElementById("enquete-usage-detail");
  const send = document.getElementById("enquete-envoyer");
  const status = document.getElementById("enquete-statut");
  const result = document.getElementById("enquete-resultat");
  const codeOutput = document.getElementById("enquete-code");
  const codeNote = document.getElementById("enquete-code-note");
  const actions = document.getElementById("enquete-actions");
  const use = document.getElementById("enquete-utiliser");
  const copy = document.getElementById("enquete-copier");
  const copyStatus = document.getElementById("enquete-copie-statut");
  const radioAide = Array.from(form.querySelectorAll('[name="aide"]'));
  const utile = document.getElementById("enquete-utile");
  const ids = new Map();
  const patternCode = /^ENQUETE-[A-F0-9]{18}$/;

  function lireSession(cle) {
    try { return sessionStorage.getItem(cle); } catch { return null; }
  }

  function ecrireSession(cle, valeur) {
    try { sessionStorage.setItem(cle, valeur); } catch { /* la réponse reste utilisable dans cet onglet */ }
  }

  function identifiant(produit) {
    if (!ids.has(produit)) {
      const cle = "tjd_enquete_id:" + produit;
      const id = lireSession(cle) || crypto.randomUUID();
      ecrireSession(cle, id);
      ids.set(produit, id);
    }
    return ids.get(produit);
  }

  function afficherDetails() {
    const visible = usage.value !== "pas_encore";
    details.hidden = !visible;
    radioAide.forEach((radio) => { radio.disabled = !visible; });
    utile.disabled = !visible;
  }

  function afficherCode(donnees) {
    if (!patternCode.test(donnees.code || "")) throw new Error("code invalide");
    codeOutput.textContent = donnees.code;
    use.href = "formations.html?code=" + encodeURIComponent(donnees.code);
    if (donnees.dejaUtilise) {
      actions.hidden = true;
      codeNote.textContent = "Ce code a déjà été utilisé.";
    }
    form.hidden = true;
    result.hidden = false;
    document.getElementById("enquete-code-titre").focus();
  }

  usage.addEventListener("change", afficherDetails);

  fetch("/api/enquete-supports", { headers: { Accept: "application/json" } })
    .then((reponse) => {
      if (!reponse.ok) throw new Error("liste indisponible");
      return reponse.json();
    })
    .then(({ supports }) => {
      for (const [id, nom] of supports) support.add(new Option(nom, id));
      const choix = new URLSearchParams(location.search).get("support");
      if (supports.some(([id]) => id === choix)) support.value = choix;
      afficherDetails();
      fields.disabled = false;
      status.textContent = "";
    })
    .catch(() => {
      status.textContent = "La liste des supports est momentanément indisponible. Recharge cette page pour réessayer.";
    });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (send.disabled) return;
    const reponse = Object.fromEntries(new FormData(form));
    reponse.id = identifiant(reponse.support);
    send.disabled = true;
    status.textContent = "Envoi de tes réponses…";
    try {
      const appel = await fetch("/api/enquete-supports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reponse),
      });
      const donnees = await appel.json();
      if (appel.status === 400) {
        status.textContent = "Vérifie les réponses obligatoires, puis renvoie le questionnaire.";
        return;
      }
      if (!appel.ok) throw new Error("réponse indisponible");
      afficherCode(donnees);
    } catch {
      status.textContent = "Le code est momentanément indisponible. Réessaie avec le même bouton.";
    } finally {
      send.disabled = false;
    }
  });

  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(codeOutput.textContent);
      copyStatus.textContent = "Code copié.";
    } catch {
      copyStatus.textContent = "Sélectionne le code affiché pour le copier.";
    }
  });
})();
