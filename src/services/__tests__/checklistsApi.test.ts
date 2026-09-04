import { createChecklistsApi } from '../checklistsApi';

const locationId = '11111111-1111-4111-8111-111111111111';
const missionId = '22222222-2222-4222-8222-222222222222';

test('requests checked applicability with exact Base and Mission scope', async () => {
  const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { records: [] } }) });
  await createChecklistsApi(fetcher as any).templates({ operatingLocationId: locationId, lifecycleStage: 'PRE_FLIGHT', missionId });
  expect(fetcher.mock.calls[0][0]).toContain(`operatingLocationId=${locationId}`);
  expect(fetcher.mock.calls[0][0]).toContain(`missionId=${missionId}`);
});

test('fails whole on malformed applicable-template authority', async () => {
  const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { records: [{ template: { id: 'not-a-uuid' } }] } }) });
  await expect(createChecklistsApi(fetcher as any).templates({ operatingLocationId: locationId, lifecycleStage: 'PRE_FLIGHT' }))
    .rejects.toThrow('Checklist response was invalid.');
});

test('does not expose arbitrary server diagnostics', async () => {
  const fetcher = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: 'Bearer secret-value' } }) });
  await expect(createChecklistsApi(fetcher as any).mission(missionId)).rejects.toThrow('Checklist request failed.');
});

test('strictly decodes a checked composition preview and preserves provenance',async()=>{
 const version='33333333-3333-4333-8333-333333333333',template='44444444-4444-4444-8444-444444444444';
 const data={schemaVersion:1,compositionDigest:'a'.repeat(64),profileId:'55555555-5555-4555-8555-555555555555',profileVersionId:version,profileVersionNumber:1,authorityScope:'ORGANISATION',sourceProvenance:{authority:'fixture'},applicability:{},assetContext:{organisationId:locationId,operatingLocationId:locationId,missionId,aircraftId:null,maintainableAssetId:null,configurationCode:'SPRAY',equipmentKitId:null},resolvedEvidence:[{code:'MISSION',status:'RESOLVED',recordId:missionId}],modules:[{ordinal:1,stableSectionCode:'aircraft',required:true,templateVersionId:version,templateId:template,versionNumber:1,authorityScope:'ORGANISATION',sourceProvenance:{}}],sections:[{id:'aircraft',title:'Aircraft',module:{stableSectionCode:'aircraft',ordinal:1,templateVersionId:version,templateId:template,versionNumber:1,authorityScope:'ORGANISATION',sourceSystemTemplateVersionId:null,sourceProvenance:{}},items:[]}]};
 const fetcher=jest.fn().mockResolvedValue({ok:true,json:async()=>({data})});
 await expect(createChecklistsApi(fetcher as any).previewComposition(version,{operatingLocationId:locationId,lifecycleStage:'PRE_FLIGHT',missionId})).resolves.toMatchObject({profileVersionId:version,modules:[{stableSectionCode:'aircraft'}]});
});

test('fails whole on malformed nested composition provenance',async()=>{
 const fetcher=jest.fn().mockResolvedValue({ok:true,json:async()=>({data:{schemaVersion:1,profileId:locationId,profileVersionId:missionId,profileVersionNumber:1,authorityScope:'PLATFORM_SYSTEM',sourceProvenance:[],applicability:{},assetContext:{},resolvedEvidence:[],modules:[],sections:[]}})});
 await expect(createChecklistsApi(fetcher as any).previewComposition(missionId,{operatingLocationId:locationId,lifecycleStage:'PRE_FLIGHT'})).rejects.toThrow('Checklist response was invalid.');
});

test('rejects an oversized nested provenance value',async()=>{const fetcher=jest.fn().mockResolvedValue({ok:true,json:async()=>({data:{schemaVersion:1,compositionDigest:'a'.repeat(64),profileId:locationId,profileVersionId:missionId,profileVersionNumber:1,authorityScope:'ORGANISATION',sourceProvenance:{note:'x'.repeat(2001)},applicability:{},assetContext:{organisationId:locationId,operatingLocationId:locationId,missionId:null,aircraftId:null,maintainableAssetId:null,configurationCode:null,equipmentKitId:null},resolvedEvidence:[],modules:[],sections:[]}})});await expect(createChecklistsApi(fetcher as any).previewComposition(missionId,{operatingLocationId:locationId,lifecycleStage:'PRE_FLIGHT'})).rejects.toThrow('Checklist response was invalid.');});

test('rejects a recursively valid-looking response that exceeds the global authority budget',async()=>{const branch=Array.from({length:100},()=>Array.from({length:100},()=>({value:'bounded'})));const fetcher=jest.fn().mockResolvedValue({ok:true,json:async()=>({data:{schemaVersion:1,compositionDigest:'a'.repeat(64),profileId:locationId,profileVersionId:missionId,profileVersionNumber:1,authorityScope:'ORGANISATION',sourceProvenance:{branch},applicability:{},assetContext:{organisationId:locationId,operatingLocationId:locationId,missionId:null,aircraftId:null,maintainableAssetId:null,configurationCode:null,equipmentKitId:null},resolvedEvidence:[],modules:[],sections:[]}})});await expect(createChecklistsApi(fetcher as any).previewComposition(missionId,{operatingLocationId:locationId,lifecycleStage:'PRE_FLIGHT'})).rejects.toThrow('Checklist response was invalid.');});

test('strictly decodes the complete frozen composed execution and fails whole on a malformed child',async()=>{const version='33333333-3333-4333-8333-333333333333',execution='44444444-4444-4444-8444-444444444444',compositionData={schemaVersion:1,compositionDigest:'b'.repeat(64),profileId:'55555555-5555-4555-8555-555555555555',profileVersionId:version,profileVersionNumber:1,authorityScope:'ORGANISATION',sourceProvenance:{},applicability:{},assetContext:{organisationId:locationId,operatingLocationId:locationId,missionId,aircraftId:null,maintainableAssetId:null,configurationCode:null,equipmentKitId:null},resolvedEvidence:[],modules:[],sections:[]};const record={id:execution,organisation_id:locationId,operating_location_id:locationId,mission_id:missionId,template_id:version,template_version_id:version,lifecycle_stage:'PRE_FLIGHT',completing_personnel_id:version,status:'DRAFT',row_version:1,aircraft_id:null,maintainable_asset_id:null,composition_profile_version_id:version,frozen_composition_snapshot:compositionData,created_at:'2026-08-25T00:00:00.000Z'};const fetcher=jest.fn().mockResolvedValueOnce({ok:true,json:async()=>({data:{record,composition:compositionData}})}).mockResolvedValueOnce({ok:true,json:async()=>({data:{record:{...record,frozen_composition_snapshot:{...compositionData,sections:[{id:'bad',title:'Bad',module:{},items:[{id:'bad',prompt:'Bad',responseType:'EXECUTE_SQL'}]}]}},composition:compositionData}})});const api=createChecklistsApi(fetcher as any);await expect(api.startComposition({profileVersionId:version,expectedCompositionDigest:'b'.repeat(64),operatingLocationId:locationId,lifecycleStage:'PRE_FLIGHT'})).resolves.toMatchObject({record:{id:execution,status:'DRAFT'},composition:{compositionDigest:'b'.repeat(64)}});await expect(api.startComposition({profileVersionId:version,expectedCompositionDigest:'b'.repeat(64),operatingLocationId:locationId,lifecycleStage:'PRE_FLIGHT'})).rejects.toThrow('Checklist response was invalid.');});
