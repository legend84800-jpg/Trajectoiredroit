const { createHmac, randomBytes } = require("node:crypto");
const supabase = require("./_supabase");

const COUPON_PARRAIN = "tjd-parrainage-15";
const COUPON_BON = "tjd-bon-parrainage-10eur";
const CODE_JULIEN = "PARRAINJULIEN84";
const EMAIL_JULIEN = "julien.prof1@gmail.com";
const PREFIXE_SITE = "https://trajectoiredroit.com";
const CODE_PARRAIN = /^PARRAIN[A-Z0-9]{3,32}$/;

function emailNormalise(email) {
  return String(email || "").trim().toLowerCase();
}

function cleTitulaire(email) {
  const secret = process.env.DOWNLOAD_SECRET;
  if (!secret) throw new Error("Configuration du parrainage manquante");
  return createHmac("sha256", secret).update(`tjd-parrainage:${emailNormalise(email)}`).digest("hex");
}

function candidats(nom, email, titulaire) {
  if (email === EMAIL_JULIEN) return [CODE_JULIEN];
  const premier = String(nom || "").trim().split(/\s+/)[0];
  const prenom = premier.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 18);
  const hash = titulaire.toUpperCase();
  const suffixe = String(parseInt(hash.slice(0, 8), 16) % 100).padStart(2, "0");
  const codeCourt = prenom ? `PARRAIN${prenom}${suffixe}` : `PARRAIN${hash.slice(0, 6)}`;
  const codeLong = `PARRAIN${prenom}${hash.slice(0, 12)}`;
  return [...new Set([codeCourt, codeLong])].filter(code => code !== CODE_JULIEN);
}

async function lireLigne(db, table, colonne, valeur) {
  const lignes = await db.selectionner(table, `${colonne}=eq.${encodeURIComponent(valeur)}&limit=1`);
  return lignes[0] || null;
}

function idStripe(objet) {
  return typeof objet === "string" ? objet : objet && objet.id;
}

function couponDuCode(promo) {
  return idStripe(promo.promotion?.coupon || promo.coupon);
}

async function assurerPromotion(stripe, { code, coupon, metadata, maxRedemptions }) {
  const relire = async () => (await stripe.promotionCodes.list({ code, limit: 5 })).data
    .find(p => p.code.toUpperCase() === code && couponDuCode(p) === coupon
      && Object.entries(metadata).every(([cle, valeur]) => p.metadata?.[cle] === valeur));
  const existante = await relire();
  if (existante) return existante;
  try {
    return await stripe.promotionCodes.create({
      code,
      promotion: { type: "coupon", coupon },
      metadata,
      ...(maxRedemptions ? { max_redemptions: maxRedemptions } : {}),
    }, { idempotencyKey: `tjd-${coupon}-${code}` });
  } catch (e) {
    const concurrente = await relire().catch(() => null);
    if (concurrente) return concurrente;
    throw e;
  }
}

async function reserverParrain(db, email, nom, titulaire) {
  const existant = await lireLigne(db, "parrains", "titulaire", titulaire);
  if (existant) return existant;
  for (const code of candidats(nom, email, titulaire)) {
    try {
      const lignes = await db.insererSiAbsent("parrains", { titulaire, code }, "titulaire");
      return lignes[0] || await lireLigne(db, "parrains", "titulaire", titulaire);
    } catch (e) {
      if (!/409/.test(e.message)) throw e;
      const concurrent = await lireLigne(db, "parrains", "titulaire", titulaire);
      if (concurrent) return concurrent;
    }
  }
  throw new Error("Code de parrainage indisponible");
}

async function assurerCodeParrainage(stripe, email, nom, db = supabase) {
  const adresse = emailNormalise(email);
  if (!adresse) return null;
  const titulaire = cleTitulaire(adresse);
  const parrain = await reserverParrain(db, adresse, nom, titulaire);
  if (parrain.promotion_id) {
    const existante = await stripe.promotionCodes.retrieve(parrain.promotion_id);
    if (!existante.active || couponDuCode(existante) !== COUPON_PARRAIN) throw new Error("Code de parrainage inactif");
    return parrain.code;
  }
  const promotion = await assurerPromotion(stripe, {
    code: parrain.code,
    coupon: COUPON_PARRAIN,
    metadata: { programme: "tjd-parrainage" },
  });
  if (!promotion.active) throw new Error("Code de parrainage inactif");
  await db.mettreAJour("parrains", `titulaire=eq.${titulaire}`, { promotion_id: promotion.id });
  return parrain.code;
}

function lienParrainage(code) {
  return `${PREFIXE_SITE}/?code=${encodeURIComponent(code)}`;
}

function achatBoutique(session) {
  const meta = session.metadata || {};
  return session.livemode === true && session.payment_status === "paid" && session.amount_total > 0
    && meta.internalTest !== "1" && meta.source !== "test_interne"
    && typeof meta.produitIds === "string" && meta.produitIds.length > 0
    && !meta.produitIds.split(",").map(id => id.trim()).includes("stage-methode");
}

async function promotionAppliquee(session, stripe) {
  const remise = session.discounts?.[0];
  const couponId = idStripe(remise?.coupon);
  if (couponId && couponId !== COUPON_PARRAIN) return null;
  const promoId = idStripe(remise?.promotion_code);
  if (promoId || !session.total_details?.amount_discount) return promoId;
  const enregistree = await stripe.checkout.sessions.retrieve(session.id);
  return idStripe(enregistree.discounts?.[0]?.promotion_code);
}

async function crediterVenteParrainee(session, stripe, db = supabase) {
  if (!achatBoutique(session) || session.mode !== "payment") return null;
  const paymentIntentId = idStripe(session.payment_intent);
  const acheteur = emailNormalise(session.customer_details?.email);
  if (!paymentIntentId || !acheteur) return null;
  const promotionId = await promotionAppliquee(session, stripe);
  if (!promotionId) return null;
  const promotionParrain = await stripe.promotionCodes.retrieve(promotionId);
  const code = String(promotionParrain.code || "").toUpperCase();
  if (couponDuCode(promotionParrain) !== COUPON_PARRAIN) return null;
  if (!CODE_PARRAIN.test(code)) return null;
  let parrain = await lireLigne(db, "parrains", "code", code);
  if (code === CODE_JULIEN && !parrain?.promotion_id) {
    await assurerCodeParrainage(stripe, EMAIL_JULIEN, "Julien", db);
    parrain = await lireLigne(db, "parrains", "code", code);
  }
  if (parrain?.promotion_id !== promotionId || parrain.titulaire === cleTitulaire(acheteur)) return null;

  let bon = await lireLigne(db, "bons_parrainage", "payment_intent_id", paymentIntentId);
  if (!bon) {
    const lignes = await db.insererSiAbsent("bons_parrainage", {
      session_id: session.id,
      payment_intent_id: paymentIntentId,
      code_parrain: code,
      code_bon: `BON${randomBytes(10).toString("hex").toUpperCase()}`,
    }, "payment_intent_id");
    bon = lignes[0] || await lireLigne(db, "bons_parrainage", "payment_intent_id", paymentIntentId);
  }
  if (bon.annule) {
    if (bon.promotion_id) await stripe.promotionCodes.update(bon.promotion_id, { active: false });
    return null;
  }
  if (bon.promotion_id) return bon;

  const paiement = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
  if (paiement.latest_charge?.refunded) {
    await annulerBonParrainage(paymentIntentId, stripe, db);
    return null;
  }
  const promotion = await assurerPromotion(stripe, {
    code: bon.code_bon,
    coupon: COUPON_BON,
    maxRedemptions: 1,
    metadata: { programme: "tjd-bon-parrainage", session_id: bon.session_id },
  });
  const [enregistre] = await db.mettreAJour(
    "bons_parrainage", `payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}`, { promotion_id: promotion.id }
  );
  if (enregistre.annule && promotion.active) await stripe.promotionCodes.update(promotion.id, { active: false });
  return enregistre;
}

async function annulerBonParrainage(paymentIntentId, stripe, db = supabase) {
  if (!paymentIntentId) return;
  const [bon] = await db.mettreAJour(
    "bons_parrainage", `payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}`, { annule: true }
  );
  if (bon?.promotion_id) await stripe.promotionCodes.update(bon.promotion_id, { active: false });
}

async function lireParrainage(email, stripe, db = supabase) {
  const titulaire = cleTitulaire(email);
  let parrain = await lireLigne(db, "parrains", "titulaire", titulaire);
  if (!parrain?.promotion_id && (parrain || emailNormalise(email) === EMAIL_JULIEN)) {
    await assurerCodeParrainage(stripe, email, "", db);
    parrain = await lireLigne(db, "parrains", "titulaire", titulaire);
  }
  if (!parrain?.promotion_id) return null;
  const bons = await db.selectionner("bons_parrainage",
    `code_parrain=eq.${parrain.code}&annule=is.false&promotion_id=not.is.null&order=cree_le.desc`);
  const disponibles = [];
  for (let debut = 0; debut < bons.length; debut += 10) {
    const lot = await Promise.all(bons.slice(debut, debut + 10).map(async bon => {
      const promo = await stripe.promotionCodes.retrieve(bon.promotion_id);
      return promo.active && promo.times_redeemed === 0 ? bon.code_bon : null;
    }));
    disponibles.push(...lot.filter(Boolean));
  }
  return { code: parrain.code, bons: disponibles };
}

module.exports = {
  assurerCodeParrainage, crediterVenteParrainee, annulerBonParrainage,
  lireParrainage, lienParrainage, achatBoutique, COUPON_PARRAIN, COUPON_BON,
};
