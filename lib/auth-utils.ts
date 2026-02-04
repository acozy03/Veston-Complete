
export const ALLOWED_DOMAINS = ['vestatelemed.com', 'vestasolutions.com'] as const

/**
 * Check if an email address belongs to an allowed domain
 * @param email - The email address to check
 * @returns true if the email domain is allowed, false otherwise
 */
export function isAllowedDomain(email: string | null | undefined): boolean {
  if (!email) return false
  const domain = email.split('@').pop()?.toLowerCase()
  if (!domain) return false
  return ALLOWED_DOMAINS.includes(domain as typeof ALLOWED_DOMAINS[number])
}

/**
 * Get the domain from an email address
 * @param email - The email address
 * @returns The domain portion of the email, or null if invalid
 */
export function getEmailDomain(email: string | null | undefined): string | null {
  if (!email) return null
  return email.split('@').pop()?.toLowerCase() ?? null
}
