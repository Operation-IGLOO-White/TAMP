// South African phone-number validation (format only — no SMS). Accepts a
// number typed as 0XXXXXXXXX, 27XXXXXXXXX, +27XXXXXXXXX, or a bare 9-digit
// mobile, and confirms it's a real SA mobile (prefix 6/7/8), not random digits.

export interface PhoneCheck {
  valid: boolean;
  e164?: string; // +27XXXXXXXXX
  national?: string; // 0XXXXXXXXX
  reason?: string;
}

export function checkSaMobile(raw: string): PhoneCheck {
  const d = raw.replace(/[\s()\-.]/g, "").replace(/^\+/, "");
  if (!d) return { valid: false };

  let nsn: string; // national significant number: 9 digits, no leading 0
  if (/^0\d{9}$/.test(d)) nsn = d.slice(1);
  else if (/^27\d{9}$/.test(d)) nsn = d.slice(2);
  else if (/^\d{9}$/.test(d)) nsn = d;
  else return { valid: false, reason: "Enter a 10-digit SA number, e.g. 082 123 4567." };

  // SA mobile numbers start 06, 07 or 08 (national significant digit 6/7/8).
  if (!/^[678]/.test(nsn)) {
    return { valid: false, reason: "That's not a valid SA mobile number." };
  }
  return { valid: true, e164: `+27${nsn}`, national: `0${nsn}` };
}

/** Pretty display: 0XX XXX XXXX. */
export function formatSaMobile(raw: string): string {
  const c = checkSaMobile(raw);
  if (!c.national) return raw;
  const n = c.national;
  return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}
