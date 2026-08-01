const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(
  __dirname,
  '../../supabase/migrations/20260801000000_production_beta_foundation.sql'
);

const tenantTables = [
  'organisations',
  'operating_locations',
  'internal_users',
  'memberships',
  'roles',
  'permissions',
  'role_permissions',
  'clients',
  'properties',
  'field_boundary_versions',
  'fields',
  'jobs',
  'job_fields',
  'missions',
  'mission_versions',
  'audit_events',
  'transactional_outbox',
];

const mutableTables = tenantTables.filter(
  (table) => !['audit_events', 'transactional_outbox'].includes(table)
);

const authorisationTables = [
  'internal_users',
  'memberships',
  'roles',
  'permissions',
  'role_permissions',
];

const browserCrudTables = mutableTables.filter(
  (table) => !authorisationTables.includes(table)
);

const tenantRelationships = [
  ['memberships', 'internal_users'],
  ['memberships', 'roles'],
  ['role_permissions', 'roles'],
  ['role_permissions', 'permissions'],
  ['properties', 'clients'],
  ['field_boundary_versions', 'properties'],
  ['fields', 'properties'],
  ['jobs', 'clients'],
  ['job_fields', 'jobs'],
  ['job_fields', 'fields'],
  ['missions', 'jobs'],
  ['missions', 'operating_locations'],
  ['mission_versions', 'missions'],
  ['audit_events', 'internal_users'],
];

const organisationRoots = [
  'operating_locations',
  'internal_users',
  'memberships',
  'roles',
  'permissions',
  'clients',
  'transactional_outbox',
];

function readMigration() {
  return fs.readFileSync(migrationPath, 'utf8').replace(/\s+/g, ' ').toLowerCase();
}

function tableDefinition(sql, table) {
  const match = sql.match(new RegExp(`create table public\\.${table} \\((.*?)\\);`));
  if (!match) throw new Error(`Missing public.${table} table definition`);
  return match[1];
}

describe('production beta database migration contract', () => {
  let migration;

  beforeAll(() => {
    migration = readMigration();
  });

  test('provisions every organisation-scoped mission-chain table with concurrency metadata', () => {
    tenantTables.forEach((table) => {
      const definition = tableDefinition(migration, table);
      expect(definition).toMatch(/id uuid primary key/);
      expect(definition).toMatch(/organisation_id uuid not null/);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`alter table public.${table} force row level security`);
    });

    mutableTables.forEach((table) => {
      const definition = tableDefinition(migration, table);
      expect(definition).toMatch(/created_at timestamptz not null default now\(\)/);
      expect(definition).toMatch(/updated_at timestamptz not null default now\(\)/);
      expect(definition).toMatch(/archived_at timestamptz/);
      expect(definition).toMatch(/row_version integer not null default 1/);
      expect(migration).toContain(`create trigger ${table}_set_update_metadata`);
    });
  });

  test('keeps every tenant relationship inside its organisation using composite foreign keys', () => {
    tenantTables.forEach((table) => {
      expect(migration).toContain(`unique (organisation_id, id)`);
      expect(migration).toContain(`on public.${table} (organisation_id`);
    });

    tenantRelationships.forEach(([child, parent]) => {
      const relationship = new RegExp(
        `foreign key \\(organisation_id, [a-z_]+_id\\) references public\\.${parent} \\(organisation_id, id\\)`,
        'i'
      );
      expect(tableDefinition(migration, child)).toMatch(relationship);
    });

    organisationRoots.forEach((table) => {
      expect(tableDefinition(migration, table)).toContain(
        'foreign key (organisation_id) references public.organisations (id)'
      );
    });

    expect(tableDefinition(migration, 'properties')).toContain(
      'unique (organisation_id, client_id, id)'
    );
    expect(tableDefinition(migration, 'jobs')).toContain(
      'foreign key (organisation_id, client_id, property_id) references public.properties (organisation_id, client_id, id)'
    );
    expect(tableDefinition(migration, 'field_boundary_versions')).toContain(
      'unique (organisation_id, property_id, id)'
    );
    expect(tableDefinition(migration, 'fields')).toContain(
      'foreign key (organisation_id, property_id, field_boundary_version_id) references public.field_boundary_versions (organisation_id, property_id, id)'
    );

    mutableTables.forEach((table) => {
      expect(tableDefinition(migration, table)).toMatch(/archived_by_internal_user_id uuid/);
      expect(migration).toContain(
        `alter table public.${table} add constraint ${table}_archived_by_internal_user_fk foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users (organisation_id, id)`
      );
    });
  });

  test('derives tenant access from active membership for auth.uid rather than request organisation input', () => {
    expect(migration).toMatch(/create or replace function public\.current_user_has_organisation_access\(p_organisation_id uuid\)/);
    expect(migration).toMatch(/iu\.auth_user_id = auth\.uid\(\)/);
    expect(migration).toMatch(/iu\.is_active = true/);
    expect(migration).toMatch(/m\.is_active = true/);

    tenantTables.forEach((table) => {
      expect(migration).toContain(`create policy ${table}_tenant_access on public.${table}`);
      expect(migration).toContain('public.current_user_has_organisation_access(organisation_id)');
    });
  });

  test('grants authenticated applications access only through the tenant RLS boundary', () => {
    browserCrudTables.forEach((table) => {
      expect(migration).toContain(
        `grant select, insert, update, delete on table public.${table} to authenticated`
      );
    });
  });

  test('reserves authorisation administration for trusted server-side roles', () => {
    authorisationTables.forEach((table) => {
      expect(migration).toContain(`revoke all on table public.${table} from authenticated`);
      expect(migration).toContain(`revoke all on table public.${table} from anon`);
      expect(migration).toContain(
        `grant select, insert, update, delete on table public.${table} to service_role`
      );
      expect(migration).not.toContain(
        `grant select, insert, update, delete on table public.${table} to authenticated`
      );
      expect(migration).toContain(
        `create policy ${table}_tenant_access on public.${table} for select to authenticated`
      );
      expect(migration).not.toContain(
        `create policy ${table}_tenant_access on public.${table} for all to authenticated`
      );
    });
  });

  test('makes audit and transactional outbox records append-only for authenticated application roles', () => {
    ['audit_events', 'transactional_outbox'].forEach((table) => {
      expect(migration).toContain(`create trigger ${table}_reject_mutation`);
      expect(migration).toContain(`revoke update, delete on table public.${table} from authenticated`);
      expect(migration).toContain(`grant select, insert on table public.${table} to authenticated`);
      expect(migration).toContain(`create policy ${table}_append on public.${table} for insert`);
      expect(migration).not.toContain(`create policy ${table}_update`);
      expect(migration).not.toContain(`create policy ${table}_delete`);
    });
  });
});
