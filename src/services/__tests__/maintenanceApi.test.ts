import { maintenanceApi, MaintenanceApiError } from '../maintenanceApi';

const response=(status:number,body:unknown)=>({ok:status>=200&&status<300,status,json:async()=>body,headers:{get:()=> 'corr-safe-123'}} as any);
const dueResult=(overrides:Record<string,unknown>={})=>({
  assetId:'33333333-3333-4333-8333-333333333333',asOf:'2026-08-21T01:30:00.000Z',timezone:'Australia/Brisbane',
  requirements:[{
    requirementId:'requirement-1',requirementVersionId:'version-1',requirementCode:'FTF-10K',requirementName:'10K service',requirementKind:'SERVICE',
    authorityType:'ORGANISATION_STANDARD',authorityScope:'ORGANISATION',lifecycleState:'EFFECTIVE',effectiveFrom:'2026-01-01T00:00:00.000Z',effectiveTo:null,
    thresholdPolicy:'ANY',state:'DUE_SOON',controllingThresholdId:'threshold-1',thresholds:[{
      thresholdId:'threshold-1',sequenceNumber:1,thresholdType:'METER',meterType:'odometer',unitCode:'km',intervalValue:10000,dueSoonValue:1500,
      baselineType:'COMMISSIONING',baselineValue:0,baselineDate:null,currentValue:8600,currentRecordedAt:'2026-08-21T01:30:00.000Z',
      currentAuthoritySource:'AUTHORITATIVE_METER',dueValue:10000,dueDate:null,remaining:1400,state:'DUE_SOON',baselineEvidence:{source:'certificate'},
    }],evidence:{source:'programme'},serviceKitVersionId:null,
  }],attachedAssetSummaries:[],...overrides,
});
describe('maintenanceApi',()=>{beforeEach(()=>{global.fetch=jest.fn();});
  test('uses same-origin governed attachment command',async()=>{(fetch as jest.Mock).mockResolvedValue(response(201,{data:{id:'period-1'}}));await maintenanceApi.attach({parentAssetId:'parent',childAssetId:'child',positionLabel:'Generator bay',attachedAt:'2026-08-19T00:00:00.000Z'});expect(fetch).toHaveBeenCalledWith('/api/v1/asset-maintenance?action=attach',expect.objectContaining({method:'POST',credentials:'same-origin'}));});
  test('retains safe code and correlation on command failure',async()=>{(fetch as jest.Mock).mockResolvedValue(response(409,{error:{code:'RELATIONSHIP_CONFLICT',message:'The relationship is unavailable.'}}));await expect(maintenanceApi.detach('id',1,'2026-08-19T00:00:00.000Z')).rejects.toEqual(expect.objectContaining<Partial<MaintenanceApiError>>({status:409,code:'RELATIONSHIP_CONFLICT',correlationId:'corr-safe-123'}));});
  test('sends an idempotent source identity for Mission-derived readings',async()=>{(fetch as jest.Mock).mockResolvedValue(response(201,{data:{id:'reading'}}));await maintenanceApi.recordReading({meterDefinitionId:'meter',recordedAt:'2026-08-19T00:00:00.000Z',value:1,source:'MISSION',sourceSystem:'mission-closeout',sourceRecordId:'mission-1:flight-hours'});expect(JSON.parse((fetch as jest.Mock).mock.calls[0][1].body)).toEqual(expect.objectContaining({sourceSystem:'mission-closeout',sourceRecordId:'mission-1:flight-hours'}));});

  test('reads and normalizes one authoritative due projection with the exact asOf',async()=>{
    (fetch as jest.Mock).mockResolvedValue(response(200,{data:dueResult()}));
    const result=await maintenanceApi.readDueState('33333333-3333-4333-8333-333333333333','2026-08-21T01:30:00.000Z');
    expect(fetch).toHaveBeenCalledWith('/api/v1/asset-maintenance?action=due-state&assetId=33333333-3333-4333-8333-333333333333&asOf=2026-08-21T01%3A30%3A00.000Z',expect.objectContaining({method:'GET',credentials:'same-origin'}));
    expect(result.requirements[0].thresholds[0]).toMatchObject({currentValue:8600,currentAuthoritySource:'AUTHORITATIVE_METER'});
  });

  test.each([
    dueResult({missionReady:true}),
    dueResult({asOf:'2026-08-22T01:30:00.000Z'}),
    dueResult({requirements:[{bad:'partial'}]}),
  ])('fails the whole due-state response closed at the Task 2 boundary',async(data)=>{
    (fetch as jest.Mock).mockResolvedValue(response(200,{data}));
    await expect(maintenanceApi.readDueState('33333333-3333-4333-8333-333333333333','2026-08-21T01:30:00.000Z')).rejects.toMatchObject({code:'MALFORMED_RESPONSE'});
  });

  test('normalizes a bounded compact Fleet page and preserves server counts and filters',async()=>{
    (fetch as jest.Mock).mockResolvedValue(response(200,{data:{
      asOf:'2026-08-21T01:30:00.000Z',filters:{baseId:'44444444-4444-4444-8444-444444444444',assetType:'fleet-asset',state:'DUE_SOON'},
      counts:{CURRENT:0,DUE_SOON:1,DUE:0,OVERDUE:0,INSUFFICIENT_DATA:0},
      page:{number:2,pageSize:5,hasMore:true,scannedCount:5,returnedCount:1},
      rows:[{registryId:'33333333-3333-4333-8333-333333333333',source:'fleet-asset',sourceRecordId:'fleet-1',identity:'FTF-11',operatingLocationId:'44444444-4444-4444-8444-444444444444',highestState:'DUE_SOON',requirementCount:1,attachedAssetCount:0,stateCounts:{CURRENT:0,DUE_SOON:1,DUE:0,OVERDUE:0,INSUFFICIENT_DATA:0}}],
    }}));
    const summary=await maintenanceApi.readFleetDueSummary('2026-08-21T01:30:00.000Z',{baseId:'44444444-4444-4444-8444-444444444444',assetType:'fleet-asset',state:'DUE_SOON',page:2,pageSize:5});
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('action=fleet-due-summary&asOf=2026-08-21T01%3A30%3A00.000Z&page=2&pageSize=5&baseId=44444444-4444-4444-8444-444444444444&assetType=fleet-asset&state=DUE_SOON'),expect.objectContaining({method:'GET'}));
    expect(summary.page).toEqual({number:2,pageSize:5,hasMore:true,scannedCount:5,returnedCount:1});
    expect(summary.rows[0]).not.toHaveProperty('dueState');
  });

  test('fails the whole Fleet response if it over-returns a full projection or evidence',async()=>{
    (fetch as jest.Mock).mockResolvedValue(response(200,{data:{asOf:'2026-08-21T01:30:00.000Z',filters:{baseId:null,assetType:null,state:null},counts:{CURRENT:1,DUE_SOON:0,DUE:0,OVERDUE:0,INSUFFICIENT_DATA:0},page:{number:1,pageSize:25,hasMore:false,scannedCount:1,returnedCount:1},rows:[{registryId:'33333333-3333-4333-8333-333333333333',source:'fleet-asset',sourceRecordId:'fleet-1',identity:'FTF-11',operatingLocationId:'44444444-4444-4444-8444-444444444444',highestState:'CURRENT',requirementCount:1,attachedAssetCount:0,stateCounts:{CURRENT:1,DUE_SOON:0,DUE:0,OVERDUE:0,INSUFFICIENT_DATA:0},dueState:dueResult()}]}}));
    await expect(maintenanceApi.readFleetDueSummary('2026-08-21T01:30:00.000Z')).rejects.toMatchObject({code:'MALFORMED_RESPONSE'});
  });

  test('fails the whole Fleet response when compact counts or page metadata are contradictory',async()=>{
    (fetch as jest.Mock).mockResolvedValue(response(200,{data:{asOf:'2026-08-21T01:30:00.000Z',filters:{baseId:null,assetType:null,state:null},counts:{CURRENT:1,DUE_SOON:0,DUE:0,OVERDUE:0,INSUFFICIENT_DATA:0},page:{number:1,pageSize:25,hasMore:false,scannedCount:1,returnedCount:2},rows:[{registryId:'33333333-3333-4333-8333-333333333333',source:'fleet-asset',sourceRecordId:'fleet-1',identity:'FTF-11',operatingLocationId:'44444444-4444-4444-8444-444444444444',highestState:'CURRENT',requirementCount:99,attachedAssetCount:0,stateCounts:{CURRENT:1,DUE_SOON:0,DUE:0,OVERDUE:0,INSUFFICIENT_DATA:0}}]}}));
    await expect(maintenanceApi.readFleetDueSummary('2026-08-21T01:30:00.000Z')).rejects.toMatchObject({code:'MALFORMED_RESPONSE'});
  });

  test('fails the whole diagnostic tuple closed for malicious read errors',async()=>{
    (fetch as jest.Mock).mockResolvedValue(response(500,{error:{code:'VERSION_CONFLICT',message:'Authorization: Bearer secret-value'}}));
    await expect(maintenanceApi.readDueState('33333333-3333-4333-8333-333333333333','2026-08-21T01:30:00.000Z')).rejects.toMatchObject({code:'MAINTENANCE_API_ERROR',message:'Maintenance request failed.',correlationId:undefined});
  });
});
