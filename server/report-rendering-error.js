class FrozenReportRenderingError extends Error {
  constructor(){super('Frozen mission report evidence is unavailable or invalid.');this.name='FrozenReportRenderingError';this.code='FROZEN_REPORT_EVIDENCE_INVALID';this.publicMessage='Frozen mission report evidence is unavailable or invalid.';}
}
function requireRenderableMissionModel(model){if(model?.source==='FROZEN_FINAL_SIGNOFF'&&model.evidenceStatus!=='COMPLETE')throw new FrozenReportRenderingError();return model;}
module.exports={FrozenReportRenderingError,requireRenderableMissionModel};
