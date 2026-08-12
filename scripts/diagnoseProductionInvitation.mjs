const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`DIAGNOSTIC_CONFIGURATION_MISSING:${name}`);
  return value;
};

const supabaseUrl = new URL(required('SUPABASE_URL')).origin;
const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY');
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' };
const rest = async (path) => {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`DIAGNOSTIC_DATABASE_READ_FAILED:${response.status}`);
  return body;
};

const applications = await rest('commercial_onboarding_applications?submitted_at=gte.2026-08-12T01%3A05%3A00Z&submitted_at=lte.2026-08-12T01%3A08%3A00Z&select=id,application_reference,intended_administrator_email,status,row_version,submitted_at,reviewed_at,updated_at&order=submitted_at.desc');
if (applications.length !== 1) throw new Error(`DIAGNOSTIC_APPLICATION_MATCH_COUNT:${applications.length}`);
const application = applications[0];
const invitations = await rest(`commercial_onboarding_invitations?application_id=eq.${encodeURIComponent(application.id)}&select=id,application_id,status,delivery_status,delivery_provider,expires_at,sent_at,revoked_at,accepted_at,row_version,created_at,updated_at&order=created_at.desc`);
if (invitations.length !== 1) throw new Error(`DIAGNOSTIC_INVITATION_MATCH_COUNT:${invitations.length}`);
const invitation = invitations[0];
const events = await rest(`commercial_onboarding_invitation_events?invitation_id=eq.${encodeURIComponent(invitation.id)}&select=event_type,from_status,to_status,created_at&order=created_at.asc`);

const authResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`, { headers });
const authBody = await authResponse.json().catch(() => ({}));
if (!authResponse.ok) throw new Error(`DIAGNOSTIC_AUTH_READ_FAILED:${authResponse.status}`);
const authUsers = Array.isArray(authBody?.users) ? authBody.users : Array.isArray(authBody) ? authBody : [];
const authUser = authUsers.find((user) => String(user?.email || '').toLowerCase() === application.intended_administrator_email);

const aliasTimestamp = application.intended_administrator_email.match(/sc-onboarding-e(\d{8})t(\d{6})(\d{3})zonboarding@/i);
if (!aliasTimestamp) throw new Error('DIAGNOSTIC_ALIAS_TIMESTAMP_MISSING');
const [, date, time, milliseconds] = aliasTimestamp;
const runStartedAt = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}.${milliseconds}Z`;
const mailboxAfter = new Date(Date.parse(runStartedAt) - 5000).toISOString();

const mailbox = new URL(required('E2E_ONBOARDING_MAILBOX_URL'));
mailbox.searchParams.set('recipient', application.intended_administrator_email);
mailbox.searchParams.set('after', mailboxAfter);
const mailboxResponse = await fetch(mailbox, { headers: { Authorization: `Bearer ${required('E2E_ONBOARDING_MAILBOX_TOKEN')}`, Accept: 'application/json' } });
const mailboxBody = await mailboxResponse.json().catch(() => ({}));
const messages = Array.isArray(mailboxBody?.messages) ? mailboxBody.messages : [];
const matchingLinks = messages.flatMap((message) => Array.isArray(message?.links) ? message.links : []).filter((value) => {
  try {
    const link = new URL(String(value));
    const redirect = link.searchParams.get('redirect_to');
    return link.searchParams.get('type') && redirect && new URL(redirect).searchParams.get('invitation') === invitation.id;
  } catch { return false; }
});

console.log(JSON.stringify({
  applicantAlias: application.intended_administrator_email,
  application: { exists: true, reference: application.application_reference, status: application.status, submittedAt: application.submitted_at, reviewedAt: application.reviewed_at },
  invitation: { exists: true, id: invitation.id, status: invitation.status, deliveryStatus: invitation.delivery_status, deliveryProvider: invitation.delivery_provider, createdAt: invitation.created_at, sentAt: invitation.sent_at, expiresAt: invitation.expires_at, revokedAt: invitation.revoked_at, acceptedAt: invitation.accepted_at },
  invitationEvents: events,
  supabaseAuth: { userExists: Boolean(authUser), createdAt: authUser?.created_at || null, emailMatches: String(authUser?.email || '').toLowerCase() === application.intended_administrator_email },
  mailbox: { recipient: application.intended_administrator_email, after: mailboxAfter, status: mailboxResponse.status, errorCode: mailboxBody?.error?.code || null, messageCount: messages.length, matchingLinkCount: matchingLinks.length, receivedAt: messages.map((message) => message.receivedAt) },
}, null, 2));
