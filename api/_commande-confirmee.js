function commandeGratuiteConfirmee(session) {
  return session?.payment_status === "no_payment_required"
    && session.amount_total === 0
    && session.status === "complete"
    && session.mode === "payment";
}

module.exports = { commandeGratuiteConfirmee };
