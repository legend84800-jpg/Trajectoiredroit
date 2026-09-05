const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const MODE_VERIFICATION = process.argv.includes('--check');

const fichiers = fs.readdirSync(RACINE)
  .filter((nom) => nom.endsWith('.html'))
  .map((nom) => path.join(RACINE, nom));

function trouverBlocDiv(html, positionInterieure) {
  const debut = html.lastIndexOf('<div class="nav-item', positionInterieure);
  if (debut === -1) return null;

  const balises = /<div\b[^>]*>|<\/div>/g;
  balises.lastIndex = debut;
  let profondeur = 0;
  let correspondance;

  while ((correspondance = balises.exec(html))) {
    if (correspondance[0].startsWith('</')) profondeur -= 1;
    else profondeur += 1;

    if (profondeur === 0) {
      return { debut, fin: balises.lastIndex, texte: html.slice(debut, balises.lastIndex) };
    }
  }
  return null;
}

function inclureCommentaire(html, bloc, motif) {
  const debutCommentaire = html.lastIndexOf('<!--', bloc.debut);
  if (debutCommentaire === -1) return bloc;
  const finCommentaire = html.indexOf('-->', debutCommentaire);
  if (finCommentaire === -1 || finCommentaire > bloc.debut) return bloc;
  const commentaire = html.slice(debutCommentaire, finCommentaire + 3);
  const entreDeux = html.slice(finCommentaire + 3, bloc.debut);
  if (!motif.test(commentaire) || !/^\s*$/.test(entreDeux)) return bloc;
  return { ...bloc, debut: debutCommentaire, texte: html.slice(debutCommentaire, bloc.fin) };
}

function inclureIndentation(html, bloc) {
  const debutLigne = html.lastIndexOf('\n', bloc.debut) + 1;
  if (!/^\s*$/.test(html.slice(debutLigne, bloc.debut))) return bloc;
  return { ...bloc, debut: debutLigne, texte: html.slice(debutLigne, bloc.fin) };
}

function attributActif(actif) {
  return actif ? ' aria-current="page"' : '';
}

function menuRessources(actif) {
  return `        <!-- Item : Ressources (articles + méthodes juridiques) -->
        <div class="nav-item has-dropdown nav-item--resources">
          <a href="blog.html" class="nav-item__link"${attributActif(actif)} aria-haspopup="true" aria-expanded="false">
            <svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg?v=288f81da#icon-pen"/></svg>Ressources
            <svg class="nav-item__chevron" width="10" height="10" viewBox="0 0 10 10"><polyline points="2,3 5,7 8,3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </a>
          <div class="dropdown dropdown--resources" role="menu">
            <div class="resources-menu__articles">
              <span class="resources-menu__title">Le blog pour apprendre le droit</span>
              <span class="resources-menu__desc">Grands arrêts, notions et conseils pour progresser.</span>
              <a class="resources-menu__articles-link" href="blog.html" role="menuitem">Découvrir le blog →</a>
            </div>
            <div class="resources-menu__methods">
              <span class="resources-menu__heading">Méthodes juridiques</span>
              <div class="resources-menu__grid">
                <a class="resources-menu__method" href="methode-fiche-arret.html" role="menuitem">
                  <span class="dropdown__icon dropdown__icon--blue"><svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg?v=288f81da#icon-note"/></svg></span>
                  <span><strong>Fiche d'arrêt</strong><small>Comprendre une décision</small></span>
                </a>
                <a class="resources-menu__method" href="methode-commentaire-arret.html" role="menuitem">
                  <span class="dropdown__icon dropdown__icon--violet"><svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg?v=288f81da#icon-pen"/></svg></span>
                  <span><strong>Commentaire d'arrêt</strong><small>Construire le devoir</small></span>
                </a>
                <a class="resources-menu__method" href="methode-cas-pratique.html" role="menuitem">
                  <span class="dropdown__icon dropdown__icon--amber"><svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg?v=288f81da#icon-scale"/></svg></span>
                  <span><strong>Cas pratique</strong><small>Appliquer la règle aux faits</small></span>
                </a>
                <a class="resources-menu__method" href="methode-dissertation-juridique.html" role="menuitem">
                  <span class="dropdown__icon dropdown__icon--emerald"><svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg?v=288f81da#icon-ruler"/></svg></span>
                  <span><strong>Dissertation juridique</strong><small>Trouver la problématique et le plan</small></span>
                </a>
              </div>
              <a class="resources-menu__all-methods" href="methodologie-juridique.html" role="menuitem">Voir toutes les méthodes →</a>
            </div>
          </div>
        </div>`;
}

function menuStage(actif) {
  return `        <div class="nav-item has-dropdown">
          <a href="stage-methode.html" class="nav-item__link nav-item__link--stage" data-stage-link${attributActif(actif)} aria-haspopup="true" aria-expanded="false">
            <svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg?v=288f81da#icon-live"/></svg>Stage en direct
            <svg class="nav-item__chevron" width="10" height="10" viewBox="0 0 10 10"><polyline points="2,3 5,7 8,3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </a>
          <div class="dropdown dropdown--simple" role="menu">
            <div class="stage-teaser">
              <button type="button" class="dropdown__item stage-teaser__trigger" aria-expanded="false" aria-controls="stageTeaserPanel">
                <span class="dropdown__icon dropdown__icon--rose"><svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg?v=288f81da#icon-live"/></svg></span>
                <span class="stage-teaser__main">
                  <strong>Stage de méthode en direct</strong>
                  <span class="stage-teaser__price"><span class="stage-teaser__price-old">38 € de l'heure</span><span class="stage-teaser__price-row"><span class="stage-teaser__price-new">19 € de l'heure</span><span class="stage-teaser__badge">-50 %</span></span></span>
                  <span class="stage-teaser__countdown"></span>
                </span>
              </button>
              <div class="stage-teaser__panel" id="stageTeaserPanel">
                <p>Trois séances en direct, 8 h au total pour 149 €, pour reprendre la fiche d'arrêt, le commentaire d'arrêt, le cas pratique et la dissertation, avec un sujet travaillé à chaque fois. La prochaine session a lieu les 8, 9 et 10 septembre. Plus que 3 places.</p>
              </div>
            </div>
            <div class="dropdown__divider"></div>
            <a class="dropdown__cta" href="stage-methode.html">Voir toutes les infos et réserver →</a>
          </div>
        </div>`;
}

function menuCoursParticuliers(actif) {
  return `        <div class="nav-item has-dropdown">
          <a href="cours-particuliers.html" class="nav-item__link"${attributActif(actif)} aria-haspopup="true" aria-expanded="false">
            <svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg?v=288f81da#icon-graduate"/></svg>Cours particuliers
            <svg class="nav-item__chevron" width="10" height="10" viewBox="0 0 10 10"><polyline points="2,3 5,7 8,3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </a>
          <div class="dropdown dropdown--simple" role="menu">
            <a class="dropdown__item" href="cours-particuliers.html#tarifs" role="menuitem"><span class="dropdown__icon dropdown__icon--blue"><svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg?v=288f81da#icon-scale"/></svg></span><span><strong>Cours de droit</strong><small>Particuliers · L1 → M2</small></span></a>
            <div class="dropdown__divider"></div>
            <a class="dropdown__item dropdown__item--featured" href="cours-particuliers.html#tarifs" role="menuitem"><span class="dropdown__icon dropdown__icon--emerald"><svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg?v=288f81da#icon-star"/></svg></span><span><strong>Pack 5 séances <em>· -10 %</em></strong><small>465 € · 93 €/h</small></span></a>
            <div class="dropdown__divider"></div>
            <a class="dropdown__cta" href="cours-particuliers.html#reserver">Réserver une séance →</a>
          </div>
        </div>`;
}

function menuAPropos(actif) {
  return `        <div class="nav-item has-dropdown">
          <a href="a-propos.html" class="nav-item__link"${attributActif(actif)} aria-haspopup="true" aria-expanded="false">
            <svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg?v=288f81da#icon-compass"/></svg>À propos
            <svg class="nav-item__chevron" width="10" height="10" viewBox="0 0 10 10"><polyline points="2,3 5,7 8,3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </a>
          <div class="dropdown dropdown--simple" role="menu">
            <a class="dropdown__item" href="a-propos.html" role="menuitem"><span class="dropdown__icon dropdown__icon--blue"><svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg?v=288f81da#icon-graduate"/></svg></span><span><strong>Qui suis-je</strong><small>Julien, 1er sur Superprof</small></span></a>
            <a class="dropdown__item" href="a-propos.html#methode" role="menuitem"><span class="dropdown__icon dropdown__icon--violet"><svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg?v=288f81da#icon-compass"/></svg></span><span><strong>Notre approche</strong><small>Cours, fiches et majeures</small></span></a>
            <a class="dropdown__item" href="temoignages.html" role="menuitem"><span class="dropdown__icon dropdown__icon--emerald"><svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg?v=288f81da#icon-star"/></svg></span><span><strong>Témoignages</strong><small>162 avis 5/5 vérifiés</small></span></a>
            <a class="dropdown__item" href="faq.html" role="menuitem"><span class="dropdown__icon dropdown__icon--amber"><svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg?v=288f81da#icon-help"/></svg></span><span><strong>FAQ</strong><small>Toutes vos questions</small></span></a>
            <a class="dropdown__item" href="a-propos.html#mes-reseaux" role="menuitem"><span class="dropdown__icon dropdown__icon--rose"><svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg?v=288f81da#icon-youtube"/></svg></span><span><strong>Mes réseaux</strong><small>YouTube, TikTok, LinkedIn</small></span></a>
            <div class="dropdown__divider"></div>
            <a class="dropdown__cta" href="mailto:julien.prof1@gmail.com">Me contacter →</a>
          </div>
        </div>`;
}

function trouverBlocsParLien(nav, href) {
  const blocs = new Map();
  let position = -1;
  while ((position = nav.indexOf(`href="${href}"`, position + 1)) !== -1) {
    const bloc = trouverBlocDiv(nav, position);
    if (bloc) blocs.set(bloc.debut, bloc);
  }
  return [...blocs.values()].sort((a, b) => a.debut - b.debut);
}

function retirerBlocs(nav, blocs, motifCommentaire) {
  for (const blocInitial of [...blocs].sort((a, b) => b.debut - a.debut)) {
    let bloc = inclureCommentaire(nav, blocInitial, motifCommentaire);
    bloc = inclureIndentation(nav, bloc);
    nav = nav.slice(0, bloc.debut) + nav.slice(bloc.fin);
  }
  return nav;
}

function insererAvantBloc(nav, bloc, contenu) {
  const avant = nav.slice(0, bloc.debut).replace(/\n(?:[ \t]*\n)*$/, '\n');
  return avant + contenu + '\n' + nav.slice(bloc.debut);
}

function normaliserStageEtAPropos(nav, fichier) {
  const positionRessources = nav.indexOf('dropdown--resources');
  if (positionRessources === -1) return nav;

  const blocsStage = trouverBlocsParLien(nav, 'stage-methode.html');
  const stageActif = fichier === 'stage-methode.html' || blocsStage.some((bloc) => bloc.texte.includes('aria-current="page"'));
  nav = retirerBlocs(nav, blocsStage, /Item\s*:\s*Stage/i);

  let blocRessources = trouverBlocDiv(nav, nav.indexOf('dropdown--resources'));
  if (blocRessources) {
    blocRessources = inclureCommentaire(nav, blocRessources, /Item\s*:\s*Ressources/i);
    blocRessources = inclureIndentation(nav, blocRessources);
    nav = insererAvantBloc(nav, blocRessources, menuStage(stageActif));
  }

  const blocsCours = trouverBlocsParLien(nav, 'cours-particuliers.html');
  if (blocsCours.length !== 1) {
    const coursActif = fichier === 'cours-particuliers.html' || blocsCours.some((bloc) => bloc.texte.includes('aria-current="page"'));
    nav = retirerBlocs(nav, blocsCours, /Item\s*:\s*Cours/i);
    let blocStage = trouverBlocDiv(nav, nav.indexOf('href="stage-methode.html"'));
    if (blocStage) {
      blocStage = inclureIndentation(nav, blocStage);
      nav = insererAvantBloc(nav, blocStage, menuCoursParticuliers(coursActif));
    }
  }

  const nouvellePositionRessources = nav.indexOf('dropdown--resources');
  const positionAPropos = nav.indexOf('href="a-propos.html"', nouvellePositionRessources);
  if (positionAPropos === -1) return nav;

  let blocAPropos = trouverBlocDiv(nav, positionAPropos);
  if (!blocAPropos) return nav;
  const aProposActif = fichier === 'a-propos.html' || blocAPropos.texte.includes('aria-current="page"');
  blocAPropos = inclureCommentaire(nav, blocAPropos, /Item\s*:\s*[ÀA] propos/i);
  blocAPropos = inclureIndentation(nav, blocAPropos);
  return nav.slice(0, blocAPropos.debut) + menuAPropos(aProposActif) + nav.slice(blocAPropos.fin);
}

function refondreNavigationBureau(html, fichier) {
  const debutNav = html.indexOf('<nav class="primary-nav"');
  if (debutNav === -1) return { html, modifie: false, raison: 'sans navigation bureau' };
  const finNav = html.indexOf('</nav>', debutNav);
  if (finNav === -1) return { html, modifie: false, raison: 'navigation bureau incomplète' };

  let nav = html.slice(debutNav, finNav + 6);
  if (nav.includes('dropdown--resources')) {
    const positionRessources = nav.indexOf('dropdown--resources');
    let blocRessources = trouverBlocDiv(nav, positionRessources);
    if (!blocRessources) return { html, modifie: false, raison: 'bloc Ressources introuvable' };
    const ressourcesActive = blocRessources.texte.includes('aria-current="page"');
    blocRessources = inclureCommentaire(nav, blocRessources, /Item\s*:\s*Ressources/i);
    blocRessources = inclureIndentation(nav, blocRessources);
    nav = nav.slice(0, blocRessources.debut) + menuRessources(ressourcesActive) + nav.slice(blocRessources.fin);
    nav = normaliserStageEtAPropos(nav, fichier).replace(/[ \t]+$/gm, '');
    return { html: html.slice(0, debutNav) + nav + html.slice(finNav + 6), modifie: true };
  }

  const positionMethode = nav.indexOf('href="methodologie-juridique.html"');
  const positionBlog = nav.indexOf('href="blog.html"');
  if (positionMethode === -1 || positionBlog === -1) {
    return { html, modifie: false, raison: 'variante sans Méthode ou Blog' };
  }

  let blocMethode = trouverBlocDiv(nav, positionMethode);
  let blocBlog = trouverBlocDiv(nav, positionBlog);
  if (!blocMethode || !blocBlog) {
    return { html, modifie: false, raison: 'bloc de navigation introuvable' };
  }

  const ressourcesActive = blocMethode.texte.includes('aria-current="page"') || blocBlog.texte.includes('aria-current="page"');
  blocMethode = inclureCommentaire(nav, blocMethode, /Item\s*:\s*M[ée]thode/i);
  blocMethode = inclureIndentation(nav, blocMethode);
  nav = nav.slice(0, blocMethode.debut) + nav.slice(blocMethode.fin);

  const nouvellePositionBlog = nav.indexOf('href="blog.html"');
  blocBlog = trouverBlocDiv(nav, nouvellePositionBlog);
  if (!blocBlog) return { html, modifie: false, raison: 'bloc Blog introuvable après retrait de Méthode' };
  blocBlog = inclureCommentaire(nav, blocBlog, /Item\s*:\s*Blog/i);
  blocBlog = inclureIndentation(nav, blocBlog);
  nav = nav.slice(0, blocBlog.debut) + menuRessources(ressourcesActive) + nav.slice(blocBlog.fin);
  nav = normaliserStageEtAPropos(nav, fichier).replace(/[ \t]+$/gm, '');

  return { html: html.slice(0, debutNav) + nav + html.slice(finNav + 6), modifie: true };
}

function lienMobile(href, libelle, fichier, classe = '') {
  const page = href.split('#')[0];
  const actif = !href.includes('#') && page === fichier;
  return `<a${classe ? ` class="${classe}"` : ''} href="${href}"${attributActif(actif)}>${libelle}</a>`;
}

function groupeActif(fichier, pages) {
  return pages.includes(fichier) ? ' mobile-nav__group--current' : '';
}

function menuMobile(fichier) {
  const groupeFiches = groupeActif(fichier, ['formations.html', 'cours-fiches.html', 'majeures-preparees.html', 'corriges.html', 'revisions.html', 'outil-fiche-arret.html', 'flashcards-qcm.html']);
  const groupeRessources = groupeActif(fichier, ['blog.html', 'methodologie-juridique.html', 'methode-fiche-arret.html', 'methode-commentaire-arret.html', 'methode-cas-pratique.html', 'methode-dissertation-juridique.html']);
  const groupeAPropos = groupeActif(fichier, ['a-propos.html', 'temoignages.html', 'faq.html']);

  return `  <nav class="mobile-nav" id="mobileNav" aria-label="Navigation mobile" hidden>
    <div class="mobile-nav__quick">
      <button type="button" class="mobile-nav__quick-btn" data-mobile-search><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Rechercher</button>
      <button type="button" class="mobile-nav__quick-btn" data-mobile-theme><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg><span data-mobile-theme-label>Mode sombre</span></button>
    </div>
    <details class="mobile-nav__group${groupeFiches}" open>
      <summary><svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg?v=288f81da#icon-book"/></svg><span>Choisir un format</span></summary>
      <div class="mobile-nav__subnav">
        ${lienMobile('formations.html#comparatif', 'Comparer tous les formats', fichier, 'mobile-nav__compare')}
        ${lienMobile('formations.html', 'Fiches complètes', fichier)}
        ${lienMobile('cours-fiches.html', 'Cours complets', fichier)}
        ${lienMobile('majeures-preparees.html', 'Majeures préparées', fichier)}
        ${lienMobile('revisions.html', "Fiches d'arrêt et citations", fichier)}
        ${lienMobile('corriges.html', 'Exercices corrigés', fichier)}
        ${lienMobile('outil-fiche-arret.html', 'Portalis', fichier)}
        ${lienMobile('flashcards-qcm.html', 'Flashcards et QCM', fichier)}
      </div>
    </details>
    ${lienMobile('cours-particuliers.html', '<svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg?v=288f81da#icon-graduate"/></svg><span>Cours particuliers</span>', fichier, 'mobile-nav__top-link')}
    <a href="stage-methode.html" class="mobile-nav__stage" data-stage-link${attributActif(fichier === 'stage-methode.html')}>
      <svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg?v=288f81da#icon-live"/></svg>
      <span class="mobile-nav__stage-main">
        <span class="mobile-nav__stage-title">Stage en direct</span>
        <span class="stage-teaser__price"><span class="stage-teaser__price-old">38 € de l'heure</span><span class="stage-teaser__price-row"><span class="stage-teaser__price-new">19 € de l'heure</span><span class="stage-teaser__badge">-50 %</span></span></span>
        <span class="stage-teaser__countdown"></span>
      </span>
    </a>
    <details class="mobile-nav__group${groupeRessources}">
      <summary><svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg?v=288f81da#icon-pen"/></svg><span>Ressources</span></summary>
      <div class="mobile-nav__subnav">
        ${lienMobile('blog.html', 'Articles de droit', fichier)}
        ${lienMobile('methodologie-juridique.html', 'Toutes les méthodes', fichier)}
        ${lienMobile('methode-fiche-arret.html', "Fiche d'arrêt", fichier)}
        ${lienMobile('methode-commentaire-arret.html', "Commentaire d'arrêt", fichier)}
        ${lienMobile('methode-cas-pratique.html', 'Cas pratique', fichier)}
        ${lienMobile('methode-dissertation-juridique.html', 'Dissertation juridique', fichier)}
      </div>
    </details>
    <details class="mobile-nav__group${groupeAPropos}">
      <summary><svg class="nav-icon" aria-hidden="true"><use href="assets/nav-icons.svg?v=288f81da#icon-compass"/></svg><span>À propos</span></summary>
      <div class="mobile-nav__subnav">
        ${lienMobile('a-propos.html', 'Qui suis-je', fichier)}
        ${lienMobile('a-propos.html#methode', 'Notre approche', fichier)}
        ${lienMobile('temoignages.html', 'Témoignages', fichier)}
        ${lienMobile('faq.html', 'FAQ', fichier)}
        ${lienMobile('a-propos.html#mes-reseaux', 'Mes réseaux', fichier)}
        <a href="mailto:julien.prof1@gmail.com">Me contacter</a>
      </div>
    </details>
    <div class="mobile-nav__cta">
      <a class="btn btn--primary btn--full" href="formations.html#comparatif">Comparer les formats</a>
    </div>
  </nav>`;
}

function refondreNavigationMobile(html, fichier) {
  const nouveauMenu = menuMobile(fichier);
  const debut = html.indexOf('<nav class="mobile-nav"');
  if (debut !== -1) {
    const fin = html.indexOf('</nav>', debut);
    if (fin === -1) return { html, modifie: false, raison: 'navigation mobile incomplète' };
    const indentationDebut = html.lastIndexOf('\n', debut) + 1;
    return {
      html: html.slice(0, indentationDebut) + nouveauMenu + html.slice(fin + 6),
      modifie: true,
      ajoute: false,
    };
  }

  const finHeader = html.indexOf('</header>');
  if (finHeader === -1) return { html, modifie: false, raison: 'header introuvable pour ajouter le menu mobile' };
  const position = finHeader + '</header>'.length;
  return {
    html: html.slice(0, position) + '\n' + nouveauMenu + html.slice(position),
    modifie: true,
    ajoute: true,
  };
}

const bilan = {
  examines: 0,
  anglaisIgnores: 0,
  bureauModifies: 0,
  mobilesRemplaces: 0,
  mobilesAjoutes: 0,
  inchanges: [],
  aEcrire: [],
};

for (const fichierAbsolu of fichiers) {
  const nom = path.basename(fichierAbsolu);
  const original = fs.readFileSync(fichierAbsolu, 'utf8');
  bilan.examines += 1;

  if (/<html\s+lang="en"/i.test(original)) {
    bilan.anglaisIgnores += 1;
    continue;
  }

  const bureau = refondreNavigationBureau(original, nom);
  if (!bureau.modifie) {
    bilan.inchanges.push(`${nom} (${bureau.raison})`);
    continue;
  }
  bilan.bureauModifies += 1;

  const mobile = refondreNavigationMobile(bureau.html, nom);
  if (!mobile.modifie) {
    bilan.inchanges.push(`${nom} (${mobile.raison})`);
    continue;
  }
  if (mobile.ajoute) bilan.mobilesAjoutes += 1;
  else bilan.mobilesRemplaces += 1;

  if (mobile.html !== original) bilan.aEcrire.push({ fichierAbsolu, contenu: mobile.html });
}

if (!MODE_VERIFICATION) {
  for (const entree of bilan.aEcrire) fs.writeFileSync(entree.fichierAbsolu, entree.contenu);
}

console.log(JSON.stringify({
  mode: MODE_VERIFICATION ? 'verification' : 'ecriture',
  examines: bilan.examines,
  anglaisIgnores: bilan.anglaisIgnores,
  bureauModifies: bilan.bureauModifies,
  mobilesRemplaces: bilan.mobilesRemplaces,
  mobilesAjoutes: bilan.mobilesAjoutes,
  fichiersAChanger: bilan.aEcrire.length,
  inchanges: bilan.inchanges,
}, null, 2));

const nombrePagesAttendues = bilan.examines - bilan.anglaisIgnores - bilan.inchanges.length;
if (bilan.inchanges.length !== 1 || bilan.bureauModifies !== nombrePagesAttendues || ![0, nombrePagesAttendues].includes(bilan.aEcrire.length)) {
  process.exitCode = 2;
}
