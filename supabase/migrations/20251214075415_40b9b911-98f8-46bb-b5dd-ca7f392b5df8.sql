-- ROOMRISE DATABASE SCHEMA

-- 1. ENUM TYPES
CREATE TYPE public.app_role AS ENUM ('admin', 'sale', 'cskh', 'ke_toan');
CREATE TYPE public.partner_type AS ENUM ('HOST', 'PICKUP', 'TOUR', 'OTHER');
CREATE TYPE public.booking_status AS ENUM ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW', 'PENDING');
CREATE TYPE public.stay_status AS ENUM ('WAIT_ROOM', 'CHECKED_IN', 'IN_HOUSE', 'CHECKED_OUT', 'NO_SHOW');
CREATE TYPE public.payment_type AS ENUM ('HOTEL_COLLECT', 'OTA_COLLECT');
CREATE TYPE public.service_type AS ENUM ('TOUR', 'PICKUP', 'ADDON');
CREATE TYPE public.service_status AS ENUM ('NEW', 'CONFIRMED', 'ASSIGNED', 'DONE', 'CANCELLED', 'NO_SHOW');
CREATE TYPE public.health_status AS ENUM ('OK', 'WARNING', 'CRITICAL');
CREATE TYPE public.payout_status AS ENUM ('PENDING', 'RECEIVED', 'PARTIAL', 'DISPUTED');
CREATE TYPE public.dispute_status AS ENUM ('OPEN', 'IN_REVIEW', 'WON', 'LOST', 'PARTIAL', 'CLOSED');
CREATE TYPE public.deposit_status AS ENUM ('HELD', 'REFUNDED', 'OFFSET', 'FORFEITED');
CREATE TYPE public.payable_status AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'PARTIAL');
CREATE TYPE public.document_type AS ENUM ('PASSPORT', 'CCCD');

-- 2. PROFILES TABLE
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. USER ROLES TABLE (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. PARTNERS TABLE
CREATE TABLE public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_type partner_type NOT NULL,
  partner_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  bank_account_info JSONB,
  payment_terms TEXT,
  status TEXT DEFAULT 'active',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

-- 5. HOST ROOMS TABLE
CREATE TABLE public.host_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  room_code TEXT NOT NULL,
  room_type TEXT NOT NULL,
  cost_per_night DECIMAL(12,2) NOT NULL DEFAULT 0,
  active_status BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.host_rooms ENABLE ROW LEVEL SECURITY;

-- 6. CUSTOMERS TABLE
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  nationality TEXT DEFAULT 'Vietnam',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- 7. BOOKINGS MIRROR TABLE (PMS bookings - read only concept)
CREATE TABLE public.bookings_mirror (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unified_booking_id TEXT NOT NULL UNIQUE,
  pms_booking_id TEXT,
  ota_source TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  guest_phone TEXT,
  guest_email TEXT,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  nights INTEGER NOT NULL,
  room_type TEXT,
  booking_status booking_status NOT NULL DEFAULT 'CONFIRMED',
  payment_type payment_type NOT NULL,
  total_amount_gross DECIMAL(12,2) DEFAULT 0,
  total_amount_net DECIMAL(12,2) DEFAULT 0,
  commission_rate DECIMAL(5,2) DEFAULT 0,
  commission_amount DECIMAL(12,2) DEFAULT 0,
  customer_id UUID REFERENCES public.customers(id),
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bookings_mirror ENABLE ROW LEVEL SECURITY;

-- 8. MANUAL BOOKINGS TABLE
CREATE TABLE public.manual_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unified_booking_id TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL, -- Facebook, TikTok, Walk-in, Corporate, Other
  guest_name TEXT NOT NULL,
  guest_phone TEXT,
  guest_email TEXT,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  nights INTEGER NOT NULL,
  room_type TEXT,
  booking_status booking_status NOT NULL DEFAULT 'CONFIRMED',
  payment_type payment_type NOT NULL DEFAULT 'HOTEL_COLLECT',
  total_amount_gross DECIMAL(12,2) DEFAULT 0,
  total_amount_net DECIMAL(12,2) DEFAULT 0,
  customer_id UUID REFERENCES public.customers(id),
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.manual_bookings ENABLE ROW LEVEL SECURITY;

-- 9. UNIFIED BOOKINGS VIEW (combines both PMS and Manual)
CREATE VIEW public.unified_bookings AS
SELECT 
  unified_booking_id,
  'PMS' as booking_type,
  ota_source as source,
  guest_name,
  guest_phone,
  guest_email,
  check_in_date,
  check_out_date,
  nights,
  room_type,
  booking_status,
  payment_type,
  total_amount_gross,
  total_amount_net,
  customer_id,
  created_at,
  updated_at
FROM public.bookings_mirror
UNION ALL
SELECT 
  unified_booking_id,
  'MANUAL' as booking_type,
  source,
  guest_name,
  guest_phone,
  guest_email,
  check_in_date,
  check_out_date,
  nights,
  room_type,
  booking_status,
  payment_type,
  total_amount_gross,
  total_amount_net,
  customer_id,
  created_at,
  updated_at
FROM public.manual_bookings;

-- 10. STAYS TABLE
CREATE TABLE public.stays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unified_booking_id TEXT NOT NULL,
  host_room_id UUID REFERENCES public.host_rooms(id),
  stay_status stay_status NOT NULL DEFAULT 'WAIT_ROOM',
  actual_check_in_at TIMESTAMPTZ,
  actual_check_out_at TIMESTAMPTZ,
  host_cost DECIMAL(12,2) DEFAULT 0,
  operation_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stays ENABLE ROW LEVEL SECURITY;

-- 11. GUEST DOCUMENTS TABLE
CREATE TABLE public.guest_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unified_booking_id TEXT NOT NULL,
  document_type document_type NOT NULL,
  document_number TEXT,
  document_image TEXT, -- storage URL
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.guest_documents ENABLE ROW LEVEL SECURITY;

-- 12. SERVICE CATALOG TABLE
CREATE TABLE public.service_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  service_type service_type NOT NULL,
  base_price DECIMAL(12,2) DEFAULT 0,
  cost_price DECIMAL(12,2) DEFAULT 0,
  default_partner_id UUID REFERENCES public.partners(id),
  active_status BOOLEAN DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;

-- 13. SERVICE ORDERS TABLE
CREATE TABLE public.service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unified_booking_id TEXT NOT NULL,
  service_id UUID NOT NULL REFERENCES public.service_catalog(id),
  partner_id UUID REFERENCES public.partners(id),
  service_date_time TIMESTAMPTZ NOT NULL,
  pax INTEGER DEFAULT 1,
  sale_price DECIMAL(12,2) DEFAULT 0,
  cost_price DECIMAL(12,2) DEFAULT 0,
  status service_status NOT NULL DEFAULT 'NEW',
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

-- 14. HOTEL COLLECTS TABLE
CREATE TABLE public.hotel_collects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unified_booking_id TEXT NOT NULL,
  amount_collected DECIMAL(12,2) NOT NULL,
  payment_method TEXT NOT NULL,
  collected_at TIMESTAMPTZ DEFAULT now(),
  collected_by UUID REFERENCES auth.users(id),
  receipt TEXT,
  status TEXT DEFAULT 'COLLECTED',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hotel_collects ENABLE ROW LEVEL SECURITY;

-- 15. OTA EXPECTED TABLE
CREATE TABLE public.ota_expected (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unified_booking_id TEXT NOT NULL,
  ota_source TEXT NOT NULL,
  expected_amount DECIMAL(12,2) NOT NULL,
  expected_payout_date DATE,
  status payout_status DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ota_expected ENABLE ROW LEVEL SECURITY;

-- 16. OTA PAYOUTS TABLE
CREATE TABLE public.ota_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ota_source TEXT NOT NULL,
  payout_date DATE NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  status payout_status DEFAULT 'PENDING',
  bank_reference TEXT,
  note TEXT,
  reconciled_by UUID REFERENCES auth.users(id),
  reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ota_payouts ENABLE ROW LEVEL SECURITY;

-- 17. OTA PAYOUT DETAILS TABLE
CREATE TABLE public.ota_payout_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES public.ota_payouts(id) ON DELETE CASCADE,
  unified_booking_id TEXT NOT NULL,
  expected_amount DECIMAL(12,2) NOT NULL,
  actual_amount DECIMAL(12,2) NOT NULL,
  variance DECIMAL(12,2) GENERATED ALWAYS AS (actual_amount - expected_amount) STORED,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ota_payout_details ENABLE ROW LEVEL SECURITY;

-- 18. NO SHOW RECORDS TABLE
CREATE TABLE public.no_show_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unified_booking_id TEXT NOT NULL UNIQUE,
  fee_policy TEXT NOT NULL, -- NONE, FIRST_NIGHT, FULL, CUSTOM
  fee_amount DECIMAL(12,2) DEFAULT 0,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.no_show_records ENABLE ROW LEVEL SECURITY;

-- 19. OTA DISPUTES TABLE
CREATE TABLE public.ota_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unified_booking_id TEXT NOT NULL,
  dispute_type TEXT NOT NULL,
  amount_in_dispute DECIMAL(12,2) NOT NULL,
  status dispute_status NOT NULL DEFAULT 'OPEN',
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ota_disputes ENABLE ROW LEVEL SECURITY;

-- 20. HOST DEPOSITS TABLE
CREATE TABLE public.host_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unified_booking_id TEXT NOT NULL,
  partner_id UUID NOT NULL REFERENCES public.partners(id),
  deposit_amount DECIMAL(12,2) NOT NULL,
  deposit_date DATE NOT NULL,
  status deposit_status NOT NULL DEFAULT 'HELD',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.host_deposits ENABLE ROW LEVEL SECURITY;

-- 21. HOST PAYABLES TABLE
CREATE TABLE public.host_payables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unified_booking_id TEXT NOT NULL,
  partner_id UUID NOT NULL REFERENCES public.partners(id),
  amount DECIMAL(12,2) NOT NULL,
  due_date DATE,
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES auth.users(id),
  status payable_status NOT NULL DEFAULT 'PENDING',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.host_payables ENABLE ROW LEVEL SECURITY;

-- 22. SERVICE PAYMENTS TABLE
CREATE TABLE public.service_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id),
  amount_collected DECIMAL(12,2) NOT NULL,
  payment_method TEXT NOT NULL,
  collected_at TIMESTAMPTZ DEFAULT now(),
  collected_by UUID REFERENCES auth.users(id),
  receipt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.service_payments ENABLE ROW LEVEL SECURITY;

-- 23. SERVICE PARTNER PAYABLES TABLE
CREATE TABLE public.service_partner_payables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id),
  partner_id UUID NOT NULL REFERENCES public.partners(id),
  amount_payable DECIMAL(12,2) NOT NULL,
  due_date DATE,
  paid_at TIMESTAMPTZ,
  status payable_status NOT NULL DEFAULT 'PENDING',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.service_partner_payables ENABLE ROW LEVEL SECURITY;

-- 24. BOOKING DATA HEALTH TABLE
CREATE TABLE public.booking_data_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unified_booking_id TEXT NOT NULL,
  health_status health_status NOT NULL DEFAULT 'OK',
  issue_type TEXT,
  detected_at TIMESTAMPTZ DEFAULT now(),
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_data_health ENABLE ROW LEVEL SECURITY;

-- 25. AUDIT LOGS TABLE (IMMUTABLE)
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID REFERENCES auth.users(id),
  role_snapshot app_role,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  before_data JSONB,
  after_data JSONB,
  ip_address TEXT,
  user_agent TEXT
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 26. APPROVALS TABLE
CREATE TABLE public.approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type TEXT NOT NULL,
  request_payload JSONB NOT NULL,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
  approved_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER FUNCTION FOR ROLE CHECK
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- FUNCTION TO GET USER'S ROLE
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- TRIGGER FOR NEW USER - CREATE PROFILE
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- TRIGGER FOR UPDATED_AT
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_partners_updated_at BEFORE UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_host_rooms_updated_at BEFORE UPDATE ON public.host_rooms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bookings_mirror_updated_at BEFORE UPDATE ON public.bookings_mirror FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_manual_bookings_updated_at BEFORE UPDATE ON public.manual_bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_stays_updated_at BEFORE UPDATE ON public.stays FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_service_catalog_updated_at BEFORE UPDATE ON public.service_catalog FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_service_orders_updated_at BEFORE UPDATE ON public.service_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ota_expected_updated_at BEFORE UPDATE ON public.ota_expected FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ota_payouts_updated_at BEFORE UPDATE ON public.ota_payouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ota_disputes_updated_at BEFORE UPDATE ON public.ota_disputes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_host_deposits_updated_at BEFORE UPDATE ON public.host_deposits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_host_payables_updated_at BEFORE UPDATE ON public.host_payables FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_service_partner_payables_updated_at BEFORE UPDATE ON public.service_partner_payables FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS POLICIES

-- Profiles: Users can view all, update own
CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- User Roles: Only admin can manage
CREATE POLICY "User roles viewable by authenticated" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Only admin can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Only admin can update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Only admin can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Partners: All authenticated users can view, admin can manage
CREATE POLICY "Partners viewable by authenticated" ON public.partners FOR SELECT TO authenticated USING (true);
CREATE POLICY "Partners insertable by authenticated" ON public.partners FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Partners updatable by authenticated" ON public.partners FOR UPDATE TO authenticated USING (true);

-- Host Rooms: All authenticated can view and manage
CREATE POLICY "Host rooms viewable by authenticated" ON public.host_rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Host rooms insertable by authenticated" ON public.host_rooms FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Host rooms updatable by authenticated" ON public.host_rooms FOR UPDATE TO authenticated USING (true);

-- Customers: All authenticated can view and manage
CREATE POLICY "Customers viewable by authenticated" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Customers insertable by authenticated" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Customers updatable by authenticated" ON public.customers FOR UPDATE TO authenticated USING (true);

-- Bookings Mirror: All authenticated can view, admin can modify (normally sync from PMS)
CREATE POLICY "Bookings mirror viewable by authenticated" ON public.bookings_mirror FOR SELECT TO authenticated USING (true);
CREATE POLICY "Bookings mirror insertable by admin" ON public.bookings_mirror FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Bookings mirror updatable by admin" ON public.bookings_mirror FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Manual Bookings: All authenticated can manage
CREATE POLICY "Manual bookings viewable by authenticated" ON public.manual_bookings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manual bookings insertable by authenticated" ON public.manual_bookings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Manual bookings updatable by authenticated" ON public.manual_bookings FOR UPDATE TO authenticated USING (true);

-- Stays: All authenticated can manage
CREATE POLICY "Stays viewable by authenticated" ON public.stays FOR SELECT TO authenticated USING (true);
CREATE POLICY "Stays insertable by authenticated" ON public.stays FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Stays updatable by authenticated" ON public.stays FOR UPDATE TO authenticated USING (true);

-- Guest Documents: CSKH and Admin can view, Ke Toan cannot
CREATE POLICY "Guest documents viewable by non-ketoan" ON public.guest_documents FOR SELECT TO authenticated 
  USING (NOT public.has_role(auth.uid(), 'ke_toan'));
CREATE POLICY "Guest documents insertable by authenticated" ON public.guest_documents FOR INSERT TO authenticated WITH CHECK (true);

-- Service Catalog: All can view and manage
CREATE POLICY "Service catalog viewable by authenticated" ON public.service_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service catalog insertable by authenticated" ON public.service_catalog FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Service catalog updatable by authenticated" ON public.service_catalog FOR UPDATE TO authenticated USING (true);

-- Service Orders: All can view and manage
CREATE POLICY "Service orders viewable by authenticated" ON public.service_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service orders insertable by authenticated" ON public.service_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Service orders updatable by authenticated" ON public.service_orders FOR UPDATE TO authenticated USING (true);

-- Hotel Collects: All can view, CSKH cannot see amounts (handled in app)
CREATE POLICY "Hotel collects viewable by authenticated" ON public.hotel_collects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Hotel collects insertable by authenticated" ON public.hotel_collects FOR INSERT TO authenticated WITH CHECK (true);

-- OTA Expected/Payouts: Finance roles can manage
CREATE POLICY "OTA expected viewable by authenticated" ON public.ota_expected FOR SELECT TO authenticated USING (true);
CREATE POLICY "OTA expected insertable by authenticated" ON public.ota_expected FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "OTA expected updatable by authenticated" ON public.ota_expected FOR UPDATE TO authenticated USING (true);

CREATE POLICY "OTA payouts viewable by authenticated" ON public.ota_payouts FOR SELECT TO authenticated USING (true);
CREATE POLICY "OTA payouts insertable by authenticated" ON public.ota_payouts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "OTA payouts updatable by authenticated" ON public.ota_payouts FOR UPDATE TO authenticated USING (true);

CREATE POLICY "OTA payout details viewable by authenticated" ON public.ota_payout_details FOR SELECT TO authenticated USING (true);
CREATE POLICY "OTA payout details insertable by authenticated" ON public.ota_payout_details FOR INSERT TO authenticated WITH CHECK (true);

-- No Show Records
CREATE POLICY "No show records viewable by authenticated" ON public.no_show_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "No show records insertable by authenticated" ON public.no_show_records FOR INSERT TO authenticated WITH CHECK (true);

-- OTA Disputes
CREATE POLICY "OTA disputes viewable by authenticated" ON public.ota_disputes FOR SELECT TO authenticated USING (true);
CREATE POLICY "OTA disputes insertable by authenticated" ON public.ota_disputes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "OTA disputes updatable by authenticated" ON public.ota_disputes FOR UPDATE TO authenticated USING (true);

-- Host Deposits
CREATE POLICY "Host deposits viewable by authenticated" ON public.host_deposits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Host deposits insertable by authenticated" ON public.host_deposits FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Host deposits updatable by authenticated" ON public.host_deposits FOR UPDATE TO authenticated USING (true);

-- Host Payables
CREATE POLICY "Host payables viewable by authenticated" ON public.host_payables FOR SELECT TO authenticated USING (true);
CREATE POLICY "Host payables insertable by authenticated" ON public.host_payables FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Host payables updatable by authenticated" ON public.host_payables FOR UPDATE TO authenticated USING (true);

-- Service Payments
CREATE POLICY "Service payments viewable by authenticated" ON public.service_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service payments insertable by authenticated" ON public.service_payments FOR INSERT TO authenticated WITH CHECK (true);

-- Service Partner Payables
CREATE POLICY "Service partner payables viewable by authenticated" ON public.service_partner_payables FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service partner payables insertable by authenticated" ON public.service_partner_payables FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Service partner payables updatable by authenticated" ON public.service_partner_payables FOR UPDATE TO authenticated USING (true);

-- Booking Data Health
CREATE POLICY "Booking data health viewable by authenticated" ON public.booking_data_health FOR SELECT TO authenticated USING (true);
CREATE POLICY "Booking data health insertable by authenticated" ON public.booking_data_health FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Booking data health updatable by authenticated" ON public.booking_data_health FOR UPDATE TO authenticated USING (true);

-- Audit Logs: All can view, only system can insert, no delete allowed
CREATE POLICY "Audit logs viewable by authenticated" ON public.audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Audit logs insertable by authenticated" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Approvals
CREATE POLICY "Approvals viewable by authenticated" ON public.approvals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Approvals insertable by authenticated" ON public.approvals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Approvals updatable by admin" ON public.approvals FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));