// Pure voucher calculation service (ESM)
// Inputs: amount (number), voucherAmount (number), config { discountRate, maxDiscount, minAmount }
// Output: { appliedVoucher, finalPayable }

export function computeDeduction(amount, voucherAmount, config = {}) {
  const amt = Number(amount || 0);
  const balance = Number(voucherAmount || 0);
  const rate = Number(config.discountRate || 0); // e.g., 0.3 for 30%
  const maxDiscount = Number(config.maxDiscount || 0); // absolute cap, optional
  const minAmount = Number(config.minAmount || 0);
  if (!Number.isFinite(amt) || amt <= 0) return { appliedVoucher: 0, finalPayable: 0 };
  if (!Number.isFinite(balance) || balance <= 0) return { appliedVoucher: 0, finalPayable: amt };
  if (amt < minAmount) return { appliedVoucher: 0, finalPayable: amt };
  const maxByRate = Math.floor(amt * (Number.isFinite(rate) ? Math.max(rate, 0) : 0));
  const cap = Math.max(0, Math.min(maxByRate > 0 ? maxByRate : Number.MAX_SAFE_INTEGER, maxDiscount > 0 ? maxDiscount : Number.MAX_SAFE_INTEGER));
  const appliedVoucher = Math.min(balance, cap);
  const finalPayable = Math.max(0, amt - appliedVoucher);
  return { appliedVoucher, finalPayable };
}