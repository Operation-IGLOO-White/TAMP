// Contact/registration masking — spec C6 (POPIA-aware by default).
// Unmasked only once a match reaches CONFIRMED.

export function maskRegistration(registration: string): string {
  const compact = registration.replace(/\s+/g, "");
  const last3 = compact.slice(-3);
  return `••• ${last3}`;
}

export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!name || !domain) return "•••••";
  return `${name[0]}${"•".repeat(Math.max(name.length - 1, 3))}@${domain}`;
}

export function maskPhone(phone: string): string {
  return phone.replace(/\d(?=(?:\D*\d){3})/g, "•");
}
