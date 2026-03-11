-- ============================================================
-- BATCH 2: RLS Policies, RPCs, and remaining migrations
-- ============================================================

-- ============================================================
-- 2a. has_ota_project_access function (needs ota_project_members table)
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_ota_project_access(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ota_project_members
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
$$;

REVOKE ALL ON FUNCTION public.has_ota_project_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_ota_project_access(UUID) TO authenticated;

COMMENT ON FUNCTION public.has_ota_project_access(UUID) IS 
'Check if current user has access to OTA project (member or admin).';

CREATE OR REPLACE FUNCTION public.get_ota_project_role(p_project_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role::TEXT FROM public.ota_project_members
     WHERE project_id = p_project_id AND user_id = auth.uid()),
    (SELECT 'ADMIN' FROM public.user_roles
     WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
     LIMIT 1)
  );
$$;

REVOKE ALL ON FUNCTION public.get_ota_project_role(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ota_project_role(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_ota_project_role(UUID) IS 
'Get current user role in OTA project. Returns STAFF, LEAD, or ADMIN.';

-- ============================================================
-- 2b. RLS POLICIES for OTA tables (from 002_ota_rls_drop_replace.sql)
-- ============================================================

-- Bookings mirror - replace select policy
DROP POLICY IF EXISTS "Bookings mirror viewable by authenticated" ON public.bookings_mirror;

CREATE POLICY "Bookings mirror viewable except ota"
ON public.bookings_mirror
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- Cashflow entries
DROP POLICY IF EXISTS "Cashflow entries viewable by authenticated" ON public.cashflow_entries;

CREATE POLICY "Cashflow entries viewable except ota"
ON public.cashflow_entries
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- Payment requests
DROP POLICY IF EXISTS "Payment requests viewable by authenticated" ON public.payment_requests;
DROP POLICY IF EXISTS "payment_requests_select_policy" ON public.payment_requests;

CREATE POLICY "Payment requests viewable except ota"
ON public.payment_requests
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- Cash outs
DROP POLICY IF EXISTS "Cash outs viewable by authenticated" ON public.cash_outs;
DROP POLICY IF EXISTS "cash_outs_select_policy" ON public.cash_outs;

CREATE POLICY "Cash outs viewable except ota"
ON public.cash_outs
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- Cash accounts
DROP POLICY IF EXISTS "Cash accounts viewable by authenticated" ON public.cash_accounts;
DROP POLICY IF EXISTS "cash_accounts_select_policy" ON public.cash_accounts;

CREATE POLICY "Cash accounts viewable except ota"
ON public.cash_accounts
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- Cash transfers
DROP POLICY IF EXISTS "Cash transfers viewable by authenticated" ON public.cash_transfers;
DROP POLICY IF EXISTS "cash_transfers_select_policy" ON public.cash_transfers;

CREATE POLICY "Cash transfers viewable except ota"
ON public.cash_transfers
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- OTA payouts
DROP POLICY IF EXISTS "OTA payouts viewable by authenticated" ON public.ota_payouts;

CREATE POLICY "OTA payouts viewable except ota"
ON public.ota_payouts
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- OTA payout details
DROP POLICY IF EXISTS "OTA payout details viewable by authenticated" ON public.ota_payout_details;
DROP POLICY IF EXISTS "ota_payout_details_select_policy" ON public.ota_payout_details;

CREATE POLICY "OTA payout details viewable except ota"
ON public.ota_payout_details
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- Host payables
DROP POLICY IF EXISTS "Host payables viewable by authenticated" ON public.host_payables;

CREATE POLICY "Host payables viewable except ota"
ON public.host_payables
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- Host settlements
DROP POLICY IF EXISTS "Host settlements viewable by authenticated" ON public.host_settlements;
DROP POLICY IF EXISTS "host_settlements_select_policy" ON public.host_settlements;

CREATE POLICY "Host settlements viewable except ota"
ON public.host_settlements
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- Host supply segments
DROP POLICY IF EXISTS "Host supply segments viewable by authenticated" ON public.host_supply_segments;
DROP POLICY IF EXISTS "host_supply_segments_select_policy" ON public.host_supply_segments;

CREATE POLICY "Host supply segments viewable except ota"
ON public.host_supply_segments
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- Host deposits
DROP POLICY IF EXISTS "Host deposits viewable by authenticated" ON public.host_deposits;
DROP POLICY IF EXISTS "host_deposits_select_policy" ON public.host_deposits;

CREATE POLICY "Host deposits viewable except ota"
ON public.host_deposits
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- Host prepaids
DROP POLICY IF EXISTS "Host prepaids viewable by authenticated" ON public.host_prepaids;
DROP POLICY IF EXISTS "host_prepaids_select_policy" ON public.host_prepaids;

CREATE POLICY "Host prepaids viewable except ota"
ON public.host_prepaids
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- Host payments
DROP POLICY IF EXISTS "Host payments viewable by authenticated" ON public.host_payments;
DROP POLICY IF EXISTS "host_payments_select_policy" ON public.host_payments;

CREATE POLICY "Host payments viewable except ota"
ON public.host_payments
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- Partners
DROP POLICY IF EXISTS "Partners viewable by authenticated" ON public.partners;

CREATE POLICY "Partners viewable except ota"
ON public.partners
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- Guest documents
DROP POLICY IF EXISTS "Guest documents viewable by authenticated" ON public.guest_documents;
DROP POLICY IF EXISTS "guest_documents_select_policy" ON public.guest_documents;
DROP POLICY IF EXISTS "guest_documents viewable except ke_toan" ON public.guest_documents;

CREATE POLICY "Guest documents viewable except ota and ketoan"
ON public.guest_documents
FOR SELECT
TO authenticated
USING (
  NOT public.is_ota_role() 
  AND NOT public.has_role(auth.uid(), 'ke_toan'::public.app_role)
);

-- Ledger entries
DROP POLICY IF EXISTS "Ledger entries viewable by authenticated" ON public.ledger_entries;
DROP POLICY IF EXISTS "ledger_entries_select_policy" ON public.ledger_entries;

CREATE POLICY "Ledger entries viewable except ota"
ON public.ledger_entries
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- Hotel collects
DROP POLICY IF EXISTS "Hotel collects viewable by authenticated" ON public.hotel_collects;
DROP POLICY IF EXISTS "hotel_collects_select_policy" ON public.hotel_collects;

CREATE POLICY "Hotel collects viewable except ota"
ON public.hotel_collects
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

-- Revenue entries
DROP POLICY IF EXISTS "Revenue entries viewable by authenticated" ON public.revenue_entries;
DROP POLICY IF EXISTS "revenue_entries_select_policy" ON public.revenue_entries;

CREATE POLICY "Revenue entries viewable except ota"
ON public.revenue_entries
FOR SELECT
TO authenticated
USING (NOT public.is_ota_role());

COMMENT ON POLICY "Bookings mirror viewable except ota" ON public.bookings_mirror IS 
'OTA roles cannot directly SELECT bookings_mirror. KPI access via ota_get_kpi() RPC only.';

-- ============================================================
-- 2c. RLS POLICIES for OTA Projects
-- ============================================================

DROP POLICY IF EXISTS "OTA projects viewable by ota role" ON public.ota_projects;
CREATE POLICY "OTA projects viewable by ota role"
ON public.ota_projects
FOR SELECT
TO authenticated
USING (
  public.is_ota_role()
  AND public.has_ota_project_access(id)
);

DROP POLICY IF EXISTS "OTA projects insertable by ota lead or admin" ON public.ota_projects;
CREATE POLICY "OTA projects insertable by ota lead or admin"
ON public.ota_projects
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_ota_lead_or_admin()
);

DROP POLICY IF EXISTS "OTA projects updatable by ota lead or admin" ON public.ota_projects;
CREATE POLICY "OTA projects updatable by ota lead or admin"
ON public.ota_projects
FOR UPDATE
TO authenticated
USING (
  public.is_ota_lead_or_admin()
)
WITH CHECK (
  public.is_ota_lead_or_admin()
);

-- ============================================================
-- 2d. RLS POLICIES for OTA Project Members
-- ============================================================

DROP POLICY IF EXISTS "OTA project members viewable by ota role" ON public.ota_project_members;
CREATE POLICY "OTA project members viewable by ota role"
ON public.ota_project_members
FOR SELECT
TO authenticated
USING (
  public.is_ota_role()
  AND public.has_ota_project_access(project_id)
);

DROP POLICY IF EXISTS "OTA project members insertable by ota lead or admin" ON public.ota_project_members;
CREATE POLICY "OTA project members insertable by ota lead or admin"
ON public.ota_project_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_ota_lead_or_admin()
);

DROP POLICY IF EXISTS "OTA project members updatable by ota lead or admin" ON public.ota_project_members;
CREATE POLICY "OTA project members updatable by ota lead or admin"
ON public.ota_project_members
FOR UPDATE
TO authenticated
USING (
  public.is_ota_lead_or_admin()
)
WITH CHECK (
  public.is_ota_lead_or_admin()
);

DROP POLICY IF EXISTS "OTA project members deletable by admin only" ON public.ota_project_members;
CREATE POLICY "OTA project members deletable by admin only"
ON public.ota_project_members
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);

-- ============================================================
-- 2e. RLS POLICIES for OTA Tasks
-- ============================================================

DROP POLICY IF EXISTS "OTA tasks viewable by project members" ON public.ota_tasks;
CREATE POLICY "OTA tasks viewable by project members"
ON public.ota_tasks
FOR SELECT
TO authenticated
USING (
  public.is_ota_role()
  AND public.has_ota_project_access(project_id)
);

DROP POLICY IF EXISTS "OTA tasks insertable by project members" ON public.ota_tasks;
CREATE POLICY "OTA tasks insertable by project members"
ON public.ota_tasks
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_ota_role()
  AND public.has_ota_project_access(project_id)
);

DROP POLICY IF EXISTS "OTA tasks updatable by authorized users" ON public.ota_tasks;
CREATE POLICY "OTA tasks updatable by authorized users"
ON public.ota_tasks
FOR UPDATE
TO authenticated
USING (
  public.is_ota_role()
  AND public.has_ota_project_access(project_id)
  AND (
    public.is_ota_lead_or_admin()
    OR assignee_id = auth.uid()
  )
)
WITH CHECK (
  public.is_ota_role()
  AND public.has_ota_project_access(project_id)
  AND (
    public.is_ota_lead_or_admin()
    OR assignee_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "OTA tasks deletable by lead or admin" ON public.ota_tasks;
CREATE POLICY "OTA tasks deletable by lead or admin"
ON public.ota_tasks
FOR DELETE
TO authenticated
USING (
  public.is_ota_lead_or_admin()
  AND public.has_ota_project_access(project_id)
);

-- ============================================================
-- 2f. RLS POLICIES for OTA Task Evidence
-- ============================================================

DROP POLICY IF EXISTS "OTA evidence viewable by project members" ON public.ota_task_evidence;
CREATE POLICY "OTA evidence viewable by project members"
ON public.ota_task_evidence
FOR SELECT
TO authenticated
USING (
  public.is_ota_role()
  AND EXISTS (
    SELECT 1 FROM public.ota_tasks t
    WHERE t.id = task_id
    AND public.has_ota_project_access(t.project_id)
  )
);

DROP POLICY IF EXISTS "OTA evidence insertable by project members" ON public.ota_task_evidence;
CREATE POLICY "OTA evidence insertable by project members"
ON public.ota_task_evidence
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_ota_role()
  AND EXISTS (
    SELECT 1 FROM public.ota_tasks t
    WHERE t.id = task_id
    AND public.has_ota_project_access(t.project_id)
  )
);

DROP POLICY IF EXISTS "OTA evidence updatable by lead or admin" ON public.ota_task_evidence;
CREATE POLICY "OTA evidence updatable by lead or admin"
ON public.ota_task_evidence
FOR UPDATE
TO authenticated
USING (
  public.is_ota_lead_or_admin()
  AND EXISTS (
    SELECT 1 FROM public.ota_tasks t
    WHERE t.id = task_id
    AND public.has_ota_project_access(t.project_id)
  )
)
WITH CHECK (
  public.is_ota_lead_or_admin()
);

DROP POLICY IF EXISTS "OTA evidence deletable by admin only" ON public.ota_task_evidence;
CREATE POLICY "OTA evidence deletable by admin only"
ON public.ota_task_evidence
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);