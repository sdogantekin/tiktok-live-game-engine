/**
 * Turns whatever the operator typed or pasted (a name, `@name`, or a profile / live URL) into a bare TikTok username, or
 * null if it cannot be one. TikTok usernames are letters, digits, underscores and periods, 2 to 24 characters, and do not
 * end in a period. The profile name shown on screen (a nickname) is not the username, so it cannot be accepted here.
 */
export function normalizeUsername(input: string): string | null {
  let value = input.trim();
  const fromUrl = /^(?:https?:\/\/)?(?:www\.|m\.)?tiktok\.com\/@([^/?#\s]+)/i.exec(value);
  if (fromUrl) value = fromUrl[1]!;
  value = value.replace(/^@/, '');
  if (!/^[A-Za-z0-9_.]{2,24}$/.test(value) || value.endsWith('.')) return null;
  return value;
}
