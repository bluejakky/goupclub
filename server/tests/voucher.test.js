import { computeDeduction } from '../src/services/voucher.js';

function assertEqual(name, a, b) {
  if (a !== b) {
    console.error(`✗ ${name}: expected ${b}, got ${a}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${name}`);
  }
}

// Test cases
const r1 = computeDeduction(300, 200, { discountRate: 0.5, maxDiscount: 0, minAmount: 0 });
assertEqual('volunteer 50% appliedVoucher', r1.appliedVoucher, 150);
assertEqual('volunteer 50% finalPayable', r1.finalPayable, 150);

const r2 = computeDeduction(180, 999, { discountRate: 0.2, maxDiscount: 0, minAmount: 200 });
assertEqual('theme minSpend blocks voucher', r2.appliedVoucher, 0);
assertEqual('theme minSpend payable', r2.finalPayable, 180);

const r3 = computeDeduction(250, 999, { discountRate: 0.3, maxDiscount: 60, minAmount: 0 });
assertEqual('cap by maxDiscount', r3.appliedVoucher, 60);
assertEqual('cap by maxDiscount payable', r3.finalPayable, 190);

console.log('Voucher tests completed.');