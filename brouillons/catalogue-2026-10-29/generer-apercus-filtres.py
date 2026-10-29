#!/usr/bin/env python3
"""Reconstruit les deux propositions privées depuis les pages publiques locales."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
BANNER = '''<aside style="background:#fff5d6;color:#23304c;padding:14px 20px;text-align:center;border-bottom:1px solid #dfc574"><strong>Aperçu privé des filtres</strong><p style="margin:4px 0">Le niveau choisi reste sélectionné entre ces deux aperçus. Tu peux vérifier le nombre de résultats, puis réinitialiser les filtres.</p><a href="brouillons/catalogue-2026-10-29/fiches-filtres-en-haut.html">Voir les fiches</a> · <a href="brouillons/catalogue-2026-10-29/cours-filtres-harmonises.html">Voir les cours</a></aside>'''
LEVELS = '''<div class="filters" style="margin-bottom:20px" role="group" aria-label="Année des cours"><button type="button" class="filter-chip active" data-preview-level="tous">Tous</button><button type="button" class="filter-chip" data-preview-level="L1">L1</button><button type="button" class="filter-chip" data-preview-level="L2">L2</button><button type="button" class="filter-chip" data-preview-level="L3">L3</button></div>'''
RESULTS = '''<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:16px 0"><p data-preview-count aria-live="polite" style="margin:0;color:var(--body)"></p><button type="button" class="btn btn--ghost btn--sm" data-preview-reset>Réinitialiser</button></div>'''
SCRIPT = r'''<script>(function(){
var key='tjd-preview-catalogue-level',level='tous',subject='tous';
try{var stored=localStorage.getItem(key);if(['L1','L2','L3'].includes(stored))level=stored;}catch(_){}
var search=document.querySelector('[data-preview-search]');
var cards=Array.from(document.querySelectorAll('[data-preview-cards] article'));
function normalise(text){return text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function update(){var query=normalise(search.value),count=0;
cards.forEach(function(card){var visible=(level==='tous'||card.dataset.niveau===level)&&(subject==='tous'||card.dataset.matiere===subject)&&normalise(card.textContent).includes(query);card.style.display=visible?'':'none';if(visible)count++;});
document.querySelector('[data-preview-count]').textContent=count?(count===1?'1 support affiché':count+' supports affichés'):'Aucun support ne correspond à cette recherche.';
document.querySelectorAll('[data-preview-level]').forEach(function(b){var active=b.dataset.previewLevel===level;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
document.querySelectorAll('[data-preview-subject]').forEach(function(b){var active=b.dataset.previewSubject===subject;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});}
document.querySelectorAll('[data-preview-level]').forEach(function(b){b.addEventListener('click',function(){level=b.dataset.previewLevel;try{localStorage.setItem(key,level);}catch(_){}update();});});
document.querySelectorAll('[data-preview-subject]').forEach(function(b){b.addEventListener('click',function(){subject=b.dataset.previewSubject;update();});});
search.addEventListener('input',update);document.querySelector('[data-preview-reset]').addEventListener('click',function(){level='tous';subject='tous';search.value='';try{localStorage.removeItem(key);}catch(_){}update();search.focus();});update();})();</script>'''

for source,destination in [('formations.html','fiches-filtres-en-haut.html'),('cours-fiches.html','cours-filtres-harmonises.html')]:
    text=(ROOT/source).read_text()
    text=text.replace('<head>','<head>\n  <base href="../../">\n  <meta name="robots" content="noindex, nofollow">',1).replace('<body>','<body>\n'+BANNER,1)
    first_end=text.index('</section>',text.index('<main'))+len('</section>')
    if source=='formations.html':
        start=text.index('    <!-- RECHERCHE + FILTRES -->',first_end)
        end=text.index('</section>',text.index('    <!-- GRID CATALOGUE -->',start))+len('</section>')
        moved=text[start:end]
        moved=moved.replace('data-filters','data-preview-filter-group').replace('data-filter-grid','data-preview-cards')
        moved=re.sub(r'data-group="niveau" data-value="([^"]+)"',r'data-preview-level="\1"',moved)
        moved=re.sub(r'data-group="matiere" data-value="([^"]+)"',r'data-preview-subject="\1"',moved)
        moved=moved.replace('    <!-- GRID CATALOGUE -->','    <div class="container">'+RESULTS+'</div>\n    <!-- GRID CATALOGUE -->')
    else:
        start=text.index('    <!-- GRILLE PRODUITS -->',first_end)
        end=text.index('</section>',start)+len('</section>')
        moved=text[start:end].replace('<div class="grid-3">',LEVELS+RESULTS+'\n        <div class="grid-3" data-preview-cards>',1)
    moved=re.sub(r'data-filtre-recherche="[^"]+"','data-preview-search',moved)
    text=text[:start]+text[end:]
    text=text[:first_end]+'\n'+moved+text[first_end:]
    text=text.replace('</body>',SCRIPT+'\n</body>')
    (OUT/destination).write_text(text)
    print(destination)
