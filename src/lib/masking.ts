export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "*****";
  const domain = email.slice(at + 1).trim();
  if (!domain) return "*****";
  return `*****@${domain.toLowerCase()}`;
}

