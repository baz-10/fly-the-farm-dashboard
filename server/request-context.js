const { createHttpError, supabaseRequest } = require('./supabase');

const ACCESS_COOKIE = 'ftf_access_token';

function parseCookies(req) {
  const cookies = {};
  String(req.headers?.cookie || '').split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index === -1) return;
    const key = part.slice(0, index).trim();
    if (key) cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
  });
  return cookies;
}

function firstRow(rows) {
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

function query(table, filters, select) {
  return supabaseRequest(`rest/v1/${table}?${filters.join('&')}&select=${select}`, {
    publicMessage: 'Authenticated organisation context could not be loaded.',
  });
}

function accessError(code, message) {
  const error = createHttpError(403, message);
  error.code = code;
  return error;
}

async function resolveRequestContext(req) {
  const accessToken = parseCookies(req)[ACCESS_COOKIE];
  if (!accessToken) throw createHttpError(401, 'Authentication is required.');

  const authUser = await supabaseRequest('auth/v1/user', {
    keyType: 'anon',
    accessToken,
    publicMessage: 'Authentication is required.',
  });
  if (!authUser?.id) throw createHttpError(401, 'Authentication is required.');

  const internalUsers = await query('internal_users', [
    `auth_user_id=eq.${encodeURIComponent(authUser.id)}`,
    'is_active=is.true',
    'archived_at=is.null',
  ], 'id,organisation_id,display_name');
  let internalUser = null;
  let memberships = [];
  for (const candidate of Array.isArray(internalUsers) ? internalUsers : []) {
    const candidateMemberships = await query('memberships', [
      `organisation_id=eq.${encodeURIComponent(candidate.organisation_id)}`,
      `internal_user_id=eq.${encodeURIComponent(candidate.id)}`,
      'is_active=is.true',
      'archived_at=is.null',
    ], 'id,role_id');
    if (Array.isArray(candidateMemberships) && candidateMemberships.length > 0) {
      internalUser = candidate;
      memberships = candidateMemberships;
      break;
    }
  }
  if (!internalUser) {
    throw createHttpError(403, 'No active organisation membership was found.');
  }

  const roleIds = memberships.map((membership) => membership.role_id).filter(Boolean);
  const roles = roleIds.length ? await query('roles', [
    `organisation_id=eq.${encodeURIComponent(internalUser.organisation_id)}`,
    `id=in.(${roleIds.map(encodeURIComponent).join(',')})`,
    'archived_at=is.null',
  ], 'id,code') : [];
  const activeRoleIds = (Array.isArray(roles) ? roles : []).map((role) => role.id).filter(Boolean);
  const permissions = activeRoleIds.length ? await query('role_permissions', [
    `organisation_id=eq.${encodeURIComponent(internalUser.organisation_id)}`,
    `role_id=in.(${activeRoleIds.map(encodeURIComponent).join(',')})`,
    'archived_at=is.null',
  ], 'permissions!inner(code,archived_at)') : [];
  const organisation = firstRow(await query('organisations', [
    `id=eq.${encodeURIComponent(internalUser.organisation_id)}`,
    'archived_at=is.null',
    'limit=1',
  ], 'id,name'));
  if (!organisation) throw createHttpError(403, 'Your organisation is not active.');

  const seatAssignments = await query('internal_user_seat_assignments', [
    `organisation_id=eq.${encodeURIComponent(internalUser.organisation_id)}`,
    `internal_user_id=eq.${encodeURIComponent(internalUser.id)}`,
    'limit=2',
  ], 'id,organisation_seat_allocation_id,status,archived_at');
  const seatAssignment = firstRow(seatAssignments);
  if (!seatAssignment) {
    throw accessError('SEAT_MIGRATION_REQUIRED', 'Your Fly the Farm seat assignment requires migration.');
  }
  if (seatAssignment.status !== 'active' || seatAssignment.archived_at) {
    const status = seatAssignment.status === 'revoked' || seatAssignment.archived_at ? 'revoked' : 'inactive';
    throw accessError('SEAT_INACTIVE', `Your Fly the Farm seat is ${status}.`);
  }
  const seatAllocation = firstRow(await query('organisation_seat_allocations', [
    `organisation_id=eq.${encodeURIComponent(internalUser.organisation_id)}`,
    `id=eq.${encodeURIComponent(seatAssignment.organisation_seat_allocation_id)}`,
    'archived_at=is.null',
    'allocated_seats=gt.0',
    'limit=1',
  ], 'id,allocated_seats'));
  if (!seatAllocation) {
    throw accessError('SEAT_INACTIVE', 'Your Fly the Farm seat allocation is inactive.');
  }
  const rankedSeatAssignments = await query('internal_user_seat_assignments', [
    `organisation_id=eq.${encodeURIComponent(internalUser.organisation_id)}`,
    'status=eq.active',
    'archived_at=is.null',
    'order=assigned_at.asc,id.asc',
  ], 'id,internal_user_id');
  const seatRank = (Array.isArray(rankedSeatAssignments) ? rankedSeatAssignments : [])
    .findIndex((assignment) => assignment.id === seatAssignment.id);
  if (seatRank < 0 || seatRank >= Number(seatAllocation.allocated_seats)) {
    throw accessError('SEAT_CAP_EXCEEDED', 'Your Fly the Farm seat is beyond the active organisation allocation.');
  }

  const membershipIds = memberships.map((membership) => membership.id).filter(Boolean);
  const locationAssignments = membershipIds.length ? await query('membership_operating_location_assignments', [
    `organisation_id=eq.${encodeURIComponent(internalUser.organisation_id)}`,
    `membership_id=in.(${membershipIds.map(encodeURIComponent).join(',')})`,
    'is_active=is.true',
    'archived_at=is.null',
  ], 'operating_location_id') : [];
  const assignedLocationIds = [...new Set((Array.isArray(locationAssignments) ? locationAssignments : [])
    .map((assignment) => assignment.operating_location_id)
    .filter(Boolean))];
  const activeLocations = assignedLocationIds.length ? await query('operating_locations', [
    `organisation_id=eq.${encodeURIComponent(internalUser.organisation_id)}`,
    `id=in.(${assignedLocationIds.map(encodeURIComponent).join(',')})`,
    'archived_at=is.null',
  ], 'id') : [];

  // Entitlement is legacy-compatible metadata only; it never grants permissions.
  const profile = firstRow(await query('ftf_profiles', [
    `user_id=eq.${encodeURIComponent(authUser.id)}`,
    'limit=1',
  ], 'tier'));

  return {
    user: { id: authUser.id, email: authUser.email || null, name: internalUser.display_name },
    organisation: { id: organisation.id, name: organisation.name },
    internalUser: { id: internalUser.id, name: internalUser.display_name },
    roles: (Array.isArray(roles) ? roles : []).map((role) => role.code).filter(Boolean),
    permissions: (Array.isArray(permissions) ? permissions : [])
      .filter((entry) => entry.permissions?.archived_at == null)
      .map((entry) => entry.permissions?.code)
      .filter(Boolean),
    operatingLocationIds: (Array.isArray(activeLocations) ? activeLocations : []).map((location) => location.id).filter(Boolean),
    entitlement: { tier: profile?.tier || null, seatActive: true, seatStatus: 'active' },
  };
}

module.exports = { parseCookies, resolveRequestContext };
