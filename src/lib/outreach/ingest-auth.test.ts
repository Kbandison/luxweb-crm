import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { requireAgentKey, requireIngestKey } from './ingest-auth';

const req = (headers: Record<string, string> = {}) =>
  new Request('https://portal.test/api/agent/notes', { method: 'POST', headers });

const saved = { ingest: process.env.OUTREACH_INGEST_KEY, agent: process.env.AGENT_API_KEY };

beforeEach(() => {
  process.env.OUTREACH_INGEST_KEY = 'ingest-key-123';
  process.env.AGENT_API_KEY = 'agent-key-456';
});

// Assigning undefined to process.env stores the string "undefined".
function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore('OUTREACH_INGEST_KEY', saved.ingest);
  restore('AGENT_API_KEY', saved.agent);
});

describe('requireAgentKey', () => {
  it('lets the agent key through as a bearer token or x-api-key', () => {
    expect(requireAgentKey(req({ authorization: 'Bearer agent-key-456' }))).toBeNull();
    expect(requireAgentKey(req({ 'x-api-key': 'agent-key-456' }))).toBeNull();
  });

  it('refuses no key, a wrong key, and the ingest key', async () => {
    const cases: Record<string, string>[] = [
      {},
      { authorization: 'Bearer nope' },
      { authorization: 'Bearer ingest-key-123' },
    ];
    for (const headers of cases) {
      const res = requireAgentKey(req(headers));
      expect(res?.status).toBe(401);
    }
  });

  it('fails closed when the agent key is not configured', async () => {
    delete process.env.AGENT_API_KEY;
    const res = requireAgentKey(req({ authorization: 'Bearer agent-key-456' }));
    expect(res?.status).toBe(500);
  });
});

describe('requireIngestKey', () => {
  it('takes the ingest key or the agent key', () => {
    expect(requireIngestKey(req({ authorization: 'Bearer ingest-key-123' }))).toBeNull();
    expect(requireIngestKey(req({ authorization: 'Bearer agent-key-456' }))).toBeNull();
  });

  it('still works with only the ingest key configured', () => {
    delete process.env.AGENT_API_KEY;
    expect(requireIngestKey(req({ authorization: 'Bearer ingest-key-123' }))).toBeNull();
    expect(requireIngestKey(req({ authorization: 'Bearer agent-key-456' }))?.status).toBe(401);
  });
});
