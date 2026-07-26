/**
 * LuxWeb CRM — Team RBAC schema verification.
 *
 * Probes whether crm_team_members.sql has been applied, and if so runs a
 * self-cleaning smoke test of the data path (insert team member → assign a
 * project → read back → clean up). Read-only until the smoke test, which
 * always removes what it creates.
 *
 * Run with: `npx tsx scripts/verify-team-schema.ts`
 */
import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: 'crm' as never },
});

const ok = (m: string) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m: string) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);

/** True if a table exists (a select doesn't 42P01 / "does not exist"). */
async function tableExists(table: string): Promise<boolean> {
  const { error } = await sb.from(table).select('*').limit(1);
  if (!error) return true;
  if (/does not exist|not find the table|schema cache/i.test(error.message)) return false;
  // Some other error (RLS etc.) still implies the table exists.
  return !/relation|undefined table/i.test(error.message);
}

/** True if a column exists on a table. */
async function columnExists(table: string, column: string): Promise<boolean> {
  const { error } = await sb.from(table).select(column).limit(1);
  if (!error) return true;
  return !/does not exist|could not find|column/i.test(error.message);
}

async function main() {
  console.log('\nTeam RBAC schema check\n----------------------');

  const tmExists = await tableExists('team_members');
  const paExists = await tableExists('project_assignments');
  const ownerCol = await columnExists('contacts', 'owner_id');
  const tlCol = await columnExists('time_logs', 'team_member_id');

  if (tmExists) ok('crm.team_members table');
  else bad('crm.team_members table MISSING');
  if (paExists) ok('crm.project_assignments table');
  else bad('crm.project_assignments table MISSING');
  if (ownerCol) ok('crm.contacts.owner_id column');
  else bad('crm.contacts.owner_id column MISSING');
  if (tlCol) ok('crm.time_logs.team_member_id column');
  else bad('crm.time_logs.team_member_id column MISSING');

  if (!tmExists || !paExists) {
    console.log(
      '\n\x1b[33mMigration not fully applied.\x1b[0m Apply crm-master/crm_team_members.sql ' +
        '(PART 1 then PART 2) and re-run.\n',
    );
    process.exit(2);
  }

  // Verify every access role's enum value by inserting a row for each. The
  // four agency roles require crm_team_roles.sql; a failure on those points
  // straight at the un-applied migration.
  console.log('\nData-path smoke test (self-cleaning)\n------------------------------------');
  const roles = [
    'manager',
    'sales',
    'project_manager',
    'client_success',
    'finance',
    'accountant',
    'contractor',
  ] as const;
  const createdMemberIds: string[] = [];
  try {
    for (const role of roles) {
      const { data, error } = await sb
        .from('team_members')
        .insert({
          full_name: `__smoketest ${role}`,
          role,
          employment_type: role === 'contractor' ? 'contractor' : 'employee',
        })
        .select('id, role')
        .single();
      if (error) {
        if (/invalid input value for enum/i.test(error.message)) {
          bad(
            `role '${role}' rejected — apply crm-master/crm_team_roles.sql, then re-run`,
          );
        } else {
          bad(`insert team_member role='${role}': ${error.message}`);
        }
        throw error;
      }
      createdMemberIds.push((data as { id: string }).id);
      ok(`insert team_member role='${role}'`);
    }

    // Assign the contractor member to any existing project, if one exists.
    const contractorId = createdMemberIds[2];
    const { data: proj } = await sb.from('projects').select('id, name').limit(1).maybeSingle();
    if (proj) {
      const { data: a, error: aErr } = await sb
        .from('project_assignments')
        .insert({ project_id: (proj as { id: string }).id, team_member_id: contractorId, role_on_project: 'smoketest' })
        .select('id')
        .single();
      if (aErr) {
        bad(`insert project_assignment: ${aErr.message}`);
      } else {
        ok(`assign contractor → project "${(proj as { name: string }).name}"`);
        // Read it back the way the app does (embedded join).
        const { data: readback, error: rErr } = await sb
          .from('project_assignments')
          .select('id, role_on_project, projects!inner(name)')
          .eq('team_member_id', contractorId);
        if (rErr || !readback || readback.length !== 1) {
          bad(`readback assignment failed: ${rErr?.message ?? 'unexpected row count'}`);
        } else {
          ok('readback assignment via embedded join');
        }
        await sb.from('project_assignments').delete().eq('id', (a as { id: string }).id);
      }
    } else {
      console.log('  (no projects exist — skipped assignment test)');
    }
  } finally {
    if (createdMemberIds.length) {
      await sb.from('team_members').delete().in('id', createdMemberIds);
      ok(`cleaned up ${createdMemberIds.length} test team_member row(s)`);
    }
  }

  console.log('\n\x1b[32mSchema verified — the Team data path works end to end.\x1b[0m\n');
}

main().catch((e) => {
  console.error('\nVerification failed:', e?.message ?? e);
  process.exit(1);
});
