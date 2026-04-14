// Neutral constants shared by server queries + client filter UI.
// (Keeping these out of queries/audit.ts so the client filter component
// doesn't drag `server-only` into the browser bundle.)

export const ENTITY_TYPES = [
  'contact',
  'deal',
  'project',
  'milestone',
  'time_log',
  'file',
  'note',
  'proposal',
  'invoice',
  'user',
  'invite',
] as const;

export const ACTIONS = [
  'create',
  'update',
  'delete',
  'send',
  'accept',
  'reject',
] as const;
