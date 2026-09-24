/* Présentation des ressources du Pack Ultra par semestre, puis par matière. */
(function () {
  'use strict';

  const MATIERES = {
    'l1-s1': [
      ['Introduction au droit', ['Introduction au droit']],
      ['Droit des personnes', ['Droit des personnes']],
      ['Droit constitutionnel', ['Droit constitutionnel']],
      ['Histoire du droit', ['Histoire du droit']],
      ['Relations internationales', ['Relations internationales']],
    ],
    'l1-s2': [
      ['Droit constitutionnel', ['Droit constitutionnel']],
      ['Histoire des institutions', ['Histoire des institutions']],
      ['Droit de la famille', ['Droit de la famille']],
      ['Droit pénal général', ['Droit pénal']],
    ],
    'l2-s1': [
      ['Droit administratif', ['Droit administratif']],
      ['Droit des contrats et des obligations', ['Droit des contrats', 'Droit des obligations']],
      ['Droit pénal', ['Droit pénal']],
      ['Finances publiques', ['Finances publiques']],
      ['Philosophie du droit', ['Philosophie du droit']],
    ],
    'l2-s2': [
      ['Droit administratif', ['Droit administratif']],
      ['Droit des obligations et responsabilité civile', ['Droit des obligations', 'Droit de la responsabilité civile']],
      ['Droit des biens', ['Droit des biens']],
      ['Droit pénal', ['Droit pénal']],
    ],
    'l3-s1': [
      ['Droit commercial', ['Droit commercial']],
      ['Droit des sociétés', ['Droit des sociétés']],
      ['Contrats spéciaux', ['Contrats spéciaux']],
      ['Droit du travail', ['Droit du travail']],
      ['Procédure pénale', ['Procédure pénale']],
      ['Procédure civile', ['Procédure civile']],
      ['Droit pénal spécial', ['Droit pénal spécial']],
    ],
  };

  const COULEURS = ['#293f7d', '#526baa', '#267056', '#217184', '#893b55', '#76549b', '#916020'];

  function classerRessource(semestre, titre) {
    const matieres = MATIERES[semestre] || [];
    const entree = matieres.find(([, prefixes]) => prefixes.some(prefixe => titre.startsWith(prefixe)));
    return entree ? entree[0] : null;
  }

  function nombreRessources(nombre) {
    return nombre + ' ressource' + (nombre > 1 ? 's' : '');
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MATIERES, classerRessource };
  }
  if (typeof document === 'undefined') return;

  function element(tag, classe, texte) {
    const noeud = document.createElement(tag);
    if (classe) noeud.className = classe;
    if (texte != null) noeud.textContent = texte;
    return noeud;
  }

  function navigationClavier(conteneur) {
    conteneur.addEventListener('keydown', event => {
      const touches = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
      if (!touches.includes(event.key)) return;
      const boutons = Array.from(conteneur.querySelectorAll('[role="tab"]'));
      const position = boutons.indexOf(document.activeElement);
      if (position < 0 || !boutons.length) return;
      event.preventDefault();
      let prochain = position;
      if (event.key === 'Home') prochain = 0;
      else if (event.key === 'End') prochain = boutons.length - 1;
      else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') prochain = (position + 1) % boutons.length;
      else prochain = (position - 1 + boutons.length) % boutons.length;
      boutons[prochain].focus();
      boutons[prochain].click();
    });
  }

  function initialiser() {
    const racine = document.querySelector('.ultra-inclusions');
    if (!racine || racine.classList.contains('ultra-inclusions--enhanced')) return;
    const sources = Array.from(racine.querySelectorAll(':scope > details.ultra-inclusions__item'));
    if (!sources.length) return;

    const packs = sources.map(source => {
      const id = source.id;
      const semestre = id.replace('pack-ultra-detail-', '');
      const carte = document.getElementById('pack-ultra-' + semestre);
      if (!carte || !MATIERES[semestre]) return null;
      const matieres = MATIERES[semestre].map(([nom], indice) => ({ nom, couleur: COULEURS[indice], ressources: [] }));
      const autres = { nom: 'Autres ressources', couleur: COULEURS[6], ressources: [] };
      source.querySelectorAll('li.ultra-resource').forEach(li => {
        const type = li.querySelector('.ultra-resource__type');
        const titre = li.textContent.slice(type.textContent.length).trim();
        const nom = classerRessource(semestre, titre);
        const matiere = matieres.find(item => item.nom === nom) || autres;
        matiere.ressources.push(li);
      });
      if (autres.ressources.length) matieres.push(autres);
      return {
        source, id, semestre, matieres,
        libelle: source.querySelector('summary span:first-child').textContent.trim(),
        nombre: source.querySelector('summary span:last-child').textContent.trim(),
        prix: carte.querySelector('.ultra-card__price').textContent.trim(),
        total: carte.querySelector('.ultra-card__unit-total').textContent.trim(),
        economie: carte.querySelector('.ultra-card__saving').textContent.trim(),
        produit: 'pack-ultra-' + semestre,
      };
    });
    if (packs.some(pack => !pack)) return;

    const experience = element('div', 'ultra-inclusions__experience');
    const semestres = element('div', 'ultra-inclusions__semestres');
    semestres.setAttribute('role', 'tablist');
    semestres.setAttribute('aria-label', 'Semestres disponibles');
    const disposition = element('div', 'ultra-inclusions__layout');
    disposition.id = 'ultra-inclusions-contenu';
    disposition.setAttribute('role', 'tabpanel');
    disposition.tabIndex = 0;
    const sommaire = element('div', 'ultra-inclusions__sommaire');
    const titreSemestre = element('h4', 'ultra-inclusions__semestre-titre');
    const metaSemestre = element('p', 'ultra-inclusions__semestre-meta');
    const matieres = element('div', 'ultra-inclusions__matieres');
    matieres.setAttribute('role', 'tablist');
    matieres.setAttribute('aria-label', 'Matières du semestre');
    sommaire.append(titreSemestre, metaSemestre, matieres);
    const contenu = element('div', 'ultra-inclusions__contenu');
    contenu.id = 'ultra-inclusions-matiere';
    contenu.setAttribute('role', 'tabpanel');
    contenu.tabIndex = 0;
    const titreMatiere = element('h5', 'ultra-inclusions__matiere-titre');
    const metaMatiere = element('p', 'ultra-inclusions__matiere-meta');
    const liste = element('ul', 'ultra-inclusions__ressources');
    const pied = element('div', 'ultra-inclusions__pied');
    const note = element('p', 'ultra-inclusions__autres');
    const prix = element('div', 'ultra-inclusions__tarif');
    const prixInitial = element('span', 'ultra-inclusions__prix-initial');
    const ancienPrix = element('s');
    prixInitial.append('Total à l’unité : ', ancienPrix);
    const prixPack = element('strong', 'ultra-inclusions__prix-pack');
    prix.append(prixInitial, prixPack);
    const economie = element('span', 'ultra-inclusions__economie');
    const achat = element('button', 'btn btn--primary ultra-inclusions__achat', 'Acheter ce pack');
    achat.type = 'button';
    pied.append(note, prix, economie, achat);
    contenu.append(titreMatiere, metaMatiere, liste, pied);
    disposition.append(sommaire, contenu);
    experience.append(semestres, disposition);
    racine.insertBefore(experience, sources[0]);

    let semestreActif = 0;
    const matiereActive = {};

    function afficherMatiere(indice) {
      const pack = packs[semestreActif];
      matiereActive[pack.semestre] = indice;
      const matiere = pack.matieres[indice];
      const boutons = Array.from(matieres.querySelectorAll('[role="tab"]'));
      boutons.forEach((bouton, position) => {
        bouton.setAttribute('aria-selected', position === indice ? 'true' : 'false');
        bouton.tabIndex = position === indice ? 0 : -1;
      });
      contenu.setAttribute('aria-labelledby', boutons[indice].id);
      titreMatiere.textContent = matiere.nom;
      metaMatiere.textContent = nombreRessources(matiere.ressources.length) + ' comprise' + (matiere.ressources.length > 1 ? 's' : '') + ' dans le Pack Ultra ' + pack.libelle;
      liste.replaceChildren(...matiere.ressources.map(li => li.cloneNode(true)));
      note.textContent = 'Le pack comprend aussi les ' + (pack.matieres.length - 1) + ' autres matières.';
    }

    function afficherSemestre(indice, modifierAdresse) {
      semestreActif = indice;
      const pack = packs[indice];
      Array.from(semestres.querySelectorAll('[role="tab"]')).forEach((bouton, position) => {
        bouton.setAttribute('aria-selected', position === indice ? 'true' : 'false');
        bouton.tabIndex = position === indice ? 0 : -1;
      });
      disposition.setAttribute('aria-labelledby', pack.id);
      titreSemestre.textContent = pack.libelle;
      metaSemestre.textContent = pack.matieres.length + ' matières  ·  ' + pack.nombre;
      matieres.replaceChildren();
      pack.matieres.forEach((matiere, position) => {
        const bouton = element('button', 'ultra-inclusions__matiere', '');
        bouton.type = 'button';
        bouton.id = 'ultra-matiere-' + pack.semestre + '-' + position;
        bouton.setAttribute('role', 'tab');
        bouton.setAttribute('aria-controls', contenu.id);
        bouton.style.setProperty('--ultra-matiere-accent', matiere.couleur);
        bouton.append(element('span', 'ultra-inclusions__matiere-nom', matiere.nom),
          element('span', 'ultra-inclusions__matiere-nombre', nombreRessources(matiere.ressources.length)));
        bouton.addEventListener('click', () => afficherMatiere(position));
        matieres.append(bouton);
      });
      ancienPrix.textContent = pack.total;
      prixPack.textContent = pack.prix;
      economie.textContent = pack.economie;
      achat.dataset.tjdProduit = pack.produit;
      afficherMatiere(matiereActive[pack.semestre] || 0);
      if (modifierAdresse) history.replaceState(null, '', '#' + pack.id);
    }

    packs.forEach((pack, indice) => {
      const bouton = element('button', 'ultra-inclusions__semestre', '');
      bouton.type = 'button';
      bouton.id = pack.id;
      bouton.setAttribute('role', 'tab');
      bouton.setAttribute('aria-controls', disposition.id);
      bouton.append(element('span', 'ultra-inclusions__semestre-nom', pack.libelle),
        element('span', 'ultra-inclusions__semestre-nombre', pack.nombre));
      bouton.addEventListener('click', () => afficherSemestre(indice, true));
      semestres.append(bouton);
      pack.source.id = 'pack-ultra-source-' + pack.semestre;
    });

    navigationClavier(semestres);
    navigationClavier(matieres);
    racine.classList.add('ultra-inclusions--enhanced');
    const hash = window.location.hash.slice(1);
    const cible = packs.findIndex(pack => pack.id === hash);
    afficherSemestre(cible >= 0 ? cible : 0, false);
    sources.forEach(source => source.remove());
    if (cible >= 0) requestAnimationFrame(() => semestres.querySelectorAll('[role="tab"]')[cible].scrollIntoView({ block: 'start' }));
    window.addEventListener('hashchange', () => {
      const index = packs.findIndex(pack => pack.id === window.location.hash.slice(1));
      if (index >= 0) afficherSemestre(index, false);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialiser);
  else initialiser();
})();
