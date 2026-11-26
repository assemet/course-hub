/**
 * Turns anything thrown into a readable message.
 * Supabase returns errors as plain objects (not `Error` instances), so an
 * `instanceof Error` check alone hides the real reason, e.g. a missing table.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const { message } = err as { message: unknown };
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}
