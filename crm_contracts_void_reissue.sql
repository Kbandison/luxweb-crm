-- Allow re-signing a contract after voiding the previous one.
--
-- The original schema declared `contracts.proposal_id` as UNIQUE, which
-- guaranteed one contract per proposal. After we added void support
-- (R-B #149), admins started running into a workflow gap: void a
-- contract, click Sign Agreement on the proposal again, and the insert
-- failed with "duplicate key value violates unique constraint
-- contracts_proposal_id_key".
--
-- This drops the unbounded UNIQUE and replaces it with a partial unique
-- index that ignores voided rows — so a proposal can have many voided
-- contracts in its history but only ONE active contract at a time.
--
-- Run once on the prod DB.

ALTER TABLE crm.contracts
  DROP CONSTRAINT IF EXISTS contracts_proposal_id_key;

-- One active (non-void) contract per proposal. Voided contracts are
-- ignored by this index and can coexist freely with a new active one.
CREATE UNIQUE INDEX IF NOT EXISTS contracts_active_per_proposal_idx
  ON crm.contracts (proposal_id)
  WHERE status <> 'void';
