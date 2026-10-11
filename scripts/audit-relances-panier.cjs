const { creerClientStripe } = require("../api/_stripe");
const { diagnostiquerRelance } = require("../api/_relance-diagnostic");
const [since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10), until = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
const start = Math.floor(Date.parse(since + "T00:00:00Z") / 1000);
const end = Math.floor(Date.parse(until + "T00:00:00Z") / 1000) + 86400;
if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 90 * 86400) throw new Error("InvalidPeriod");
(async () => {
  const stripe = creerClientStripe(process.env.STRIPE_SECRET_KEY);
  const counts = { expired: 0, internalExcluded: 0, eligible: 0, h1Accepted: 0, h24Scheduled: 0, recoveredPaid: 0, reasons: {} };
  for await (const session of stripe.checkout.sessions.list({ created: { gte: start, lt: end }, limit: 100 })) {
    if (session.metadata?.brand === "trajectoire_philo" || !session.metadata?.produitIds) continue;
    if (session.metadata?.internalTest === "1" || !session.livemode) { counts.internalExcluded++; continue; }
    if (session.payment_status === "paid" && session.recovered_from) counts.recoveredPaid++;
    if (session.status !== "expired") continue;
    counts.expired++;
    const diagnostic = diagnostiquerRelance(session);
    if (diagnostic.eligible && !session.recovered_from) counts.eligible++;
    for (const reason of diagnostic.raisons) counts.reasons[reason] = (counts.reasons[reason] || 0) + 1;
    if (session.metadata?.rappelH1Status === "sent") counts.h1Accepted++;
    if (session.metadata?.rappelH24Status === "scheduled") counts.h24Scheduled++;
  }
  const brevo = {};
  for (const tag of ["relance-panier-h1", "relance-panier-h24"]) {
    if (!process.env.BREVO_API_KEY) { brevo[tag] = { complete: false, delivered: "inconnu" }; continue; }
    const query = new URLSearchParams({ startDate: since, endDate: until, tag });
    const response = await fetch(`https://api.brevo.com/v3/smtp/statistics/aggregatedReport?${query}`, {
      headers: { "api-key": process.env.BREVO_API_KEY }, signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) { brevo[tag] = { complete: false, delivered: "inconnu", http: response.status }; continue; }
    const data = await response.json();
    brevo[tag] = { complete: true, requests: data.requests ?? "inconnu", delivered: data.delivered ?? "inconnu",
      clicks: data.clicks ?? "inconnu", blocked: data.blocked ?? "inconnu", hardBounces: data.hardBounces ?? "inconnu" };
  }
  console.log(JSON.stringify({ since, until, timezone: "UTC", extractedAt: new Date().toISOString(), complete: true,
    stripe: counts, brevo, cohort: "Sessions créées pendant la période, événements Brevo datés pendant la période",
    meanings: "sent indique l’acceptation par Brevo, delivered provient des événements de livraison Brevo" }, null, 2));
})().catch(error => {
  console.log(JSON.stringify({ complete: false, counts: "inconnu", errorType: error?.type || error?.name || "Error" }));
  process.exitCode = 1;
});
