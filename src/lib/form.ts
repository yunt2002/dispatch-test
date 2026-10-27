export function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export function optionalText(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value ? value : null;
}

export function num(formData: FormData, key: string): number | null {
  const raw = text(formData, key);
  if (!raw) return null;
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

export function bool(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

export function idList(formData: FormData, key: string): string[] {
  return formData.getAll(key).map(String).filter(Boolean);
}
