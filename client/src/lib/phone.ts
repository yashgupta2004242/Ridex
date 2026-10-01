export function nationalDigits(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^91/, '').replace(/^0/, '').slice(0, 10);
}

export function toE164(raw: string): string {
  const national = nationalDigits(raw);
  return national.length === 10 ? `+91${national}` : raw.trim();
}
