-- DeenVault AI Academy — Application & Sponsor Tables
-- Migration 0003: Academy operational layer

-- Enums
DO $$ BEGIN
  CREATE TYPE application_status AS ENUM ('applied', 'reviewed', 'accepted', 'rejected', 'onboarded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sponsor_status AS ENUM ('active', 'inactive', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Sponsors table
CREATE TABLE IF NOT EXISTS sponsors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  contact_email TEXT,
  status sponsor_status NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sponsors_tenant_idx ON sponsors(tenant_id);

-- Applications table
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  applicant_name TEXT NOT NULL,
  applicant_email TEXT NOT NULL,
  program_name TEXT,
  status application_status NOT NULL DEFAULT 'applied',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  sponsor_id UUID REFERENCES sponsors(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS applications_tenant_idx ON applications(tenant_id);
CREATE INDEX IF NOT EXISTS applications_status_idx ON applications(tenant_id, status);

-- RLS for sponsors
ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsors FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sponsors_tenant_isolation ON sponsors;
CREATE POLICY sponsors_tenant_isolation ON sponsors
  USING (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- RLS for applications
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS applications_tenant_isolation ON applications;
CREATE POLICY applications_tenant_isolation ON applications
  USING (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );
