const DATE_HORS_OFFRE = Date.parse("2026-11-19T20:00:00Z");

function fixerHorlogePaiement(t, instant = DATE_HORS_OFFRE) {
  t.mock.method(Date, "now", () => instant);
}

module.exports = { DATE_HORS_OFFRE, fixerHorlogePaiement };
