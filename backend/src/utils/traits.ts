export function parseTraits(traitsStr: string | null | undefined): Record<string, number> {
  if (!traitsStr) return {};
  try {
    const parsed = JSON.parse(traitsStr);
    if (Array.isArray(parsed)) {
      const obj: Record<string, number> = {};
      parsed.forEach((t: string) => {
        obj[t] = 1;
      });
      return obj;
    }
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, number>;
    }
    return {};
  } catch (e) {
    return {};
  }
}
