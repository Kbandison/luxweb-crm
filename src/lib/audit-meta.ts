// Neutral constants shared by server queries + client filter UI.
// (Keeping these out of queries/audit.ts so the client filter component
// doesn't drag `server-only` into the browser bundle.)

// Every entity_type the app actually writes to the audit log. The filter
// dropdown is built from this, so anything missing here is invisible to
// filtering even though its rows are recorded — which is what happened to the
// team, outreach, and banking features as they landed.
//
// Grouped by domain to stay readable as the list grows.
export const ENTITY_TYPES = [
  // Core CRM
  'contact',
  'deal',
  'project',
  'project_assignment',
  'project_review',
  'milestone',
  'file',
  'note',
  'proposal',
  'contract',
  'invoice',
  'revision',
  'revision_request',
  'revision_comment',
  'credential',
  'care_plan_subscription',
  // People + access
  'user',
  'auth_user',
  'invite',
  'team_member',
  'team_member_invite',
  // Outreach
  'prospect',
  'prospect_import',
  'prospect_ingest',
  'prospect_bulk',
  'appointment',
  'outreach_settings',
  // Money
  'bank_sync',
  'bank_transaction',
  'bank_reconciliation',
  'payment_request',
] as const;

export const ACTIONS = [
  'create',
  'update',
  'delete',
  'send',
  'accept',
  'reject',
] as const;
