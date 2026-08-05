const { supabaseRequest } = require('./supabase');

class ComplianceRepository {
  async readOverview(context) {
    return supabaseRequest('rest/v1/rpc/ftf_read_casa_compliance_overview', {
      method: 'POST',
      body: JSON.stringify({ p_organisation_id: context.organisation.id }),
      publicMessage: 'CASA Compliance overview could not be loaded.',
    });
  }
}

module.exports = { ComplianceRepository };
