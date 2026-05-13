/**
 * Generic error response that doesn't leak internals to the client.
 *
 * Many of our route handlers currently surface `err.message` directly:
 *
 *     return Response.json({ error: msg }, { status: 500 });
 *
 * That works in development, but in production it leaks Postgres details
 * (column names, FK constraints), Stripe error details (customer ids,
 * payment intent ids), and stack-y substrings — to any authenticated
 * client who can trigger a route. This helper logs the detail server-side
 * and returns a stable generic message.
 *
 * Use:
 *
 *     } catch (err) {
 *       if (err instanceof Response) return err;
 *       return safeError('admin/projects PATCH', err);
 *     }
 */
export function safeError(scope: string, err: unknown, status = 500): Response {
  const detail =
    err instanceof Error
      ? `${err.name}: ${err.message}`
      : typeof err === 'string'
        ? err
        : JSON.stringify(err);
  console.error(`[${scope}]`, detail);
  return Response.json({ error: 'Unexpected error' }, { status });
}
