export function normalizeNum(msisdnRaw) {
  const digits = String(msisdnRaw).replace(/\D/g, ""); // keep only numbers

  // 07XXXXXXXX -> 94XXXXXXXXX
  if (digits.startsWith("0") && digits.length === 10) return "94" + digits.slice(1);

  // 94XXXXXXXXX -> keep
  if (digits.startsWith("94") && digits.length === 11) return digits;

  // 7XXXXXXXX -> 94XXXXXXXXX (sometimes people store without leading 0)
  if (digits.length === 9) return "94" + digits;

  throw new Error(`Invalid LK number format: ${msisdnRaw}`);
}
