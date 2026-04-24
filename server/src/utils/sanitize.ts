const truncateString = (value: string, maxLength = 280) =>
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;

export const sanitizePayloadForLog = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(item => sanitizePayloadForLog(item));
  }

  if (value && typeof value === 'object') {
    const nextEntries = Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => {
      const lowered = key.toLowerCase();
      if (
        lowered.includes('base64') ||
        lowered === 'data' ||
        lowered === 'image_url' ||
        lowered === 'url'
      ) {
        if (typeof entryValue === 'string') {
          return [key, `[omitted:${entryValue.length}]`];
        }

        return [key, '[omitted]'];
      }

      return [key, sanitizePayloadForLog(entryValue)];
    });

    return Object.fromEntries(nextEntries);
  }

  if (typeof value === 'string') {
    return truncateString(value);
  }

  return value;
};
