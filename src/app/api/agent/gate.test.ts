import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// proxy.ts lets everything under /api/agent past the session gate, so the key
// check in each handler is the only lock. A route added here without it
// would be open to the internet — this fails the build first.
function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === 'route.ts' ? [full] : [];
  });
}

describe('/api/agent routes', () => {
  const files = routeFiles(__dirname);

  it('exist', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [path.relative(__dirname, f), f]))(
    '%s checks the agent key in every handler',
    (_name, file) => {
      const src = readFileSync(file, 'utf8');
      const handlers = src.match(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g) ?? [];
      const gates = src.match(/await agentGate\(req, /g) ?? [];
      expect(handlers.length).toBeGreaterThan(0);
      expect(gates.length).toBe(handlers.length);
    },
  );
});
