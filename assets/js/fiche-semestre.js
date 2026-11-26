(function () {
  const groupe = document.querySelector('.fiche-semestre');
  if (!groupe) return;

  const fiche = groupe.closest('.offre-matiere__option--fiche');
  const choixS1 = groupe.querySelector('input[type="radio"][value="1"]');
  const choixS2 = groupe.querySelector('input[type="radio"][value="2"]');
  if (!fiche || !fiche.id || !choixS1 || !choixS2) return;

  function restaurerChoix() {
    const semestre = new URLSearchParams(window.location.search).get('semestre');
    const choix = semestre === '2' ? choixS2 : choixS1;
    if (choix.checked) return;
    choix.checked = true;
    groupe.dispatchEvent(new Event('tjd:semestre-restaure', { bubbles: true }));
  }

  groupe.addEventListener('change', function (evenement) {
    const choix = evenement.target;
    if (choix !== choixS1 && choix !== choixS2) return;

    const adresse = new URL(window.location.href);
    if (choix === choixS2) adresse.searchParams.set('semestre', '2');
    else adresse.searchParams.delete('semestre');
    adresse.hash = fiche.id;

    try {
      window.history.replaceState(window.history.state, '', adresse.href);
    } catch (_) { /* Le sélecteur reste utilisable sans modification de l’adresse. */ }
  });

  restaurerChoix();
  window.addEventListener('popstate', restaurerChoix);
  window.addEventListener('pageshow', restaurerChoix);
})();
