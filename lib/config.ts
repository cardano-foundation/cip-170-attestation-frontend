// Environment configuration utilities

/**
 * Get the Signify service URL from environment variables
 * Defaults to 'http://localhost:3901' if not set
 */
export function getSignifyUrl(): string {
  return process.env.NEXT_PUBLIC_SIGNIFY_URL || 'http://localhost:3901';
}

/**
 * KERIA boot URL for a given KERIA URL (the Veridian browser agent reuses the Signify KERIA).
 * NEXT_PUBLIC_SIGNIFY_BOOT_URL applies when the URL is the configured Signify URL; otherwise the same host on
 * KERIA's default boot port 3903 is assumed.
 */
export function getSignifyBootUrl(keriaUrl: string = getSignifyUrl()): string {
  const configured = process.env.NEXT_PUBLIC_SIGNIFY_BOOT_URL;
  const sameAsConfigured = keriaUrl.replace(/\/+$/, '') === getSignifyUrl().replace(/\/+$/, '');
  if (configured && sameAsConfigured) return configured;
  try {
    const url = new URL(keriaUrl);
    url.port = '3903';
    return url.toString().replace(/\/$/, '');
  } catch {
    return 'http://localhost:3903';
  }
}
