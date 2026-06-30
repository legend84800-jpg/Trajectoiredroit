#!/usr/bin/env python3
"""
Remplace tous les liens Gumroad par le système de paiement TJD :
- Boutons "Acheter" -> <button data-tjd-produit="...">
- data-apercu-cta -> id produit TJD
- Modale : adapte le JS pour prendre en compte les ids TJD
- Ajoute le script tjdAcheter() en bas de formations.html
"""
import re

BASE = "/root/blog-routine/site"

# Mapping ID Gumroad -> ID produit TJD
GUMROAD_VERS_TJD = {
    "vcnnf":   "fiche-da-l2-s1",
    "kphgxt":  "fiche-da-l2-s2",
    "fxdat":   "fiche-constit-l1-s1",
    "mlvqci":  "fiche-constit-l1-s2",
    "rwugw":   "fiche-intro-droit-l1",
    "nhvfnt":  "fiche-hist-droit-l1",
    "jrwscs":  "fiche-hist-institutions-l1",
    "hynlg":   "fiche-personnes-l1",
    "cqqkd":   "fiche-famille-l1-s2",
    "ftzysl":  "fiche-contrats-l2-s1",
    "sluat":   "fiche-obligations-l2-s2",
    "trlmmv":  "fiche-penal-general-l1",
    "kpiau":   "fiche-penal-l2-s1",
    "uupixqt": "fiche-biens-l2",
    "ecqlm":   "fiche-commercial-l3-s1",
    "ncpkpq":  "fiche-societes-l3-s1",
    "jzsmw":   "fiche-contrats-speciaux-l3",
    "iyatx":   "fiche-travail-l3-s1",
    "snbku":   "fiche-procedure-penale-l3",
    # Packs
    "yibyb":   "pack-complet",
    "suicsv":  "pack-l1",
    "shzlrl":  "pack-l2",
    "haapx":   "pack-l3",
    # Majeures
    "ocnni":   "maj-intro-droit-l1",
    "epivjw":  "maj-personnes-l1",
    "rswddy":  "maj-famille-l1-s2",
    "dqaydl":  "maj-da-l2-s1",
    "csfcxd":  "maj-da-l2-s2",
    "uswcgj":  "maj-contrats-l2-s1",
    "nfxflo":  "maj-obligations-l2-s2",
    "iyfmvac": "maj-penal-l2-s1",
    "cqgyw":   "maj-penal-l2-s2",
    "heddm":   "maj-biens-l2",
    "nhdmg":   "maj-commercial-l3-s1",
}

GUMROAD_PATTERN = re.compile(
    r'https://2587742610597\.gumroad\.com/l/([a-z0-9]+)\?wanted=true'
)

def remplacer_url(m):
    gid = m.group(1)
    return GUMROAD_VERS_TJD.get(gid, m.group(0))

def convertir_boutons_achat(html):
    """
    <a class="btn btn--primary btn--full product__cta"
       href="https://...gumroad.com/l/vcnnf?wanted=true"
       target="_blank" rel="noopener">Acheter · 14,99 €</a>
    ->
    <button type="button" class="btn btn--primary btn--full product__cta"
            data-tjd-produit="fiche-da-l2-s1">Acheter · 14,99 €</button>
    """
    pattern = re.compile(
        r'<a class="btn btn--primary btn--full product__cta"\s+'
        r'href="https://2587742610597\.gumroad\.com/l/([a-z0-9]+)\?wanted=true"\s+'
        r'target="_blank" rel="noopener">([^<]+)</a>'
    )
    def remplacement(m):
        gid = m.group(1)
        texte = m.group(2)
        produit_id = GUMROAD_VERS_TJD.get(gid, gid)
        return (f'<button type="button" class="btn btn--primary btn--full product__cta" '
                f'data-tjd-produit="{produit_id}">{texte}</button>')
    return pattern.sub(remplacement, html)

def convertir_apercu_cta(html):
    """
    data-apercu-cta="https://...gumroad.com/l/vcnnf?wanted=true"
    ->
    data-apercu-cta="fiche-da-l2-s1"
    """
    pattern = re.compile(
        r'data-apercu-cta="https://2587742610597\.gumroad\.com/l/([a-z0-9]+)\?wanted=true"'
    )
    def remplacement(m):
        gid = m.group(1)
        produit_id = GUMROAD_VERS_TJD.get(gid, gid)
        return f'data-apercu-cta="{produit_id}"'
    return pattern.sub(remplacement, html)

def adapter_js_modale(html):
    """
    Remplace la ligne
      cta.href=btn.getAttribute('data-apercu-cta')||'#';
    par du JS qui détecte un id TJD et appelle tjdAcheter().
    """
    ancien = "cta.href=btn.getAttribute('data-apercu-cta')||'#';"
    nouveau = (
        "var ctaVal=btn.getAttribute('data-apercu-cta')||'#';"
        "if(ctaVal&&!ctaVal.startsWith('http')){"
        "cta.href='#';"
        "cta.setAttribute('data-tjd-produit',ctaVal);"
        "cta.onclick=function(e){e.preventDefault();tjdAcheter(ctaVal,cta);};"
        "}else{"
        "cta.href=ctaVal;"
        "cta.removeAttribute('data-tjd-produit');"
        "cta.onclick=null;"
        "}"
    )
    return html.replace(ancien, nouveau)

SCRIPT_PAIEMENT = """
<script>
/* Intégration paiement TJD — remplace Gumroad */
(function(){
  var TEXTES_ORIGINAUX = {};

  function tjdAcheter(produitId, btnEl) {
    if (!btnEl) btnEl = document.querySelector('[data-tjd-produit="'+produitId+'"]');
    if (!btnEl) return;
    var idx = produitId + '-' + Array.from(document.querySelectorAll('[data-tjd-produit="'+produitId+'"]')).indexOf(btnEl);
    TEXTES_ORIGINAUX[idx] = TEXTES_ORIGINAUX[idx] || btnEl.textContent.trim();
    btnEl.disabled = true;
    btnEl.textContent = 'Chargement…';
    fetch('/api/create-checkout', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({produitId: produitId})
    })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (d.url) { window.location.href = d.url; }
      else {
        alert('Une erreur est survenue. Réessaie dans quelques secondes.');
        btnEl.disabled = false;
        btnEl.textContent = TEXTES_ORIGINAUX[idx] || 'Acheter';
      }
    })
    .catch(function(){
      alert('Erreur réseau. Vérifie ta connexion et réessaie.');
      btnEl.disabled = false;
      btnEl.textContent = TEXTES_ORIGINAUX[idx] || 'Acheter';
    });
  }

  window.tjdAcheter = tjdAcheter;

  document.addEventListener('click', function(e){
    var btn = e.target.closest('[data-tjd-produit]');
    if (!btn) return;
    var produitId = btn.getAttribute('data-tjd-produit');
    if (!produitId) return;
    e.preventDefault();
    tjdAcheter(produitId, btn);
  });
})();
</script>
"""

def migrer_formations(chemin):
    with open(chemin, encoding="utf-8") as f:
        html = f.read()

    html = convertir_boutons_achat(html)
    html = convertir_apercu_cta(html)
    html = adapter_js_modale(html)

    # Ajouter le script de paiement avant </body>
    if "tjdAcheter" not in html:
        html = html.replace("</body>", SCRIPT_PAIEMENT + "</body>", 1)

    with open(chemin, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"OK : {chemin}")

def migrer_majeures(chemin):
    with open(chemin, encoding="utf-8") as f:
        html = f.read()

    html = convertir_boutons_achat(html)
    # Pas de modale d'aperçu sur majeures-preparees.html

    # Ajouter le script de paiement avant </body>
    if "tjdAcheter" not in html:
        html = html.replace("</body>", SCRIPT_PAIEMENT + "</body>", 1)

    with open(chemin, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"OK : {chemin}")

if __name__ == "__main__":
    migrer_formations(f"{BASE}/formations.html")
    migrer_majeures(f"{BASE}/majeures-preparees.html")
    print("Migration terminée.")
