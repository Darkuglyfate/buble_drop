import "server-only";

function getHttpOrigin(value: string | undefined): string | null {
  const configuredValue = value?.trim();
  if (!configuredValue) {
    return null;
  }

  try {
    const url = new URL(configuredValue);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function getBackendOrigin(): string | null {
  return getHttpOrigin(process.env.BACKEND_URL);
}

export function getFrontendOrigin(): string | null {
  return getHttpOrigin(process.env.FRONTEND_ORIGIN);
}
