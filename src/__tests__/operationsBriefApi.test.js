const{createOperationsBriefHandler}=require('../../server/operations-brief-api');
const context={organisation:{id:'org-1',name:'Fly The Farm'},internalUser:{id:'user-1'},permissions:['missions.read','missions.create','clients.create','compliance.read'],operatingLocationIds:['loc-1']};
const response=()=>{const r={statusCode:200,body:null,headers:{}};r.setHeader=(k,v)=>r.headers[k]=v;r.status=n=>(r.statusCode=n,r);r.json=b=>(r.body=b,r);return r;};
const req=(method='GET',query={},body={})=>({method,query,body,headers:{origin:'https://spray.test',host:'spray.test','x-forwarded-proto':'https'}});

test('builds a scoped brief and auto-selects the sole operating location',async()=>{
 const repository={list:jest.fn(async resource=>resource==='operating_locations'?[{id:'loc-1',name:'Fly The Farm Base',address:'Dalby QLD'}]:resource==='missions'?[{id:'m1',title:'Spray north field',status:'planning',scheduled_start_at:'2026-08-05T08:00:00+10:00',operating_location_id:'loc-1'}]:[]),listMissionSetupDrafts:jest.fn().mockResolvedValue([]),readPreference:jest.fn().mockResolvedValue(null)};
 const weather={geocode:jest.fn().mockResolvedValue({latitude:-27.18,longitude:151.26}),forecast:jest.fn().mockResolvedValue({current:{temperatureC:24},hourly:[],daily:[],retrievedAt:'2026-08-05T00:00:00Z'})};
 const compliance={readOverview:jest.fn().mockResolvedValue({healthScore:{criticalBlockers:[{criticalRuleCode:'REOC_MISSING',reason:'Required ReOC record is missing.',route:'/compliance'}]}})};
 const res=response();await createOperationsBriefHandler({repository,weatherProvider:weather,complianceRepository:compliance,resolveContext:jest.fn().mockResolvedValue(context),now:()=>new Date('2026-08-04T22:00:00Z')})(req(),res);
 expect(res.statusCode).toBe(200);expect(res.body.data.location).toEqual(expect.objectContaining({id:'loc-1',name:'Fly The Farm Base'}));
 expect(res.body.data.schedule[0]).toEqual(expect.objectContaining({id:'m1',action:{label:'Open Mission',route:'/missions/m1'}}));
 expect(res.body.data.quickActions.map(x=>x.label)).toEqual(expect.arrayContaining(['New Mission','New Client']));
 expect(res.body.data.alerts[0]).toEqual(expect.objectContaining({title:'ReOC certificate missing',blocking:false}));
});

test('missing location coordinates informs without removing quick actions',async()=>{
 const repository={list:jest.fn(async resource=>resource==='operating_locations'?[{id:'loc-1',name:'Base',address:''}]:[]),listMissionSetupDrafts:jest.fn().mockResolvedValue([]),readPreference:jest.fn().mockResolvedValue(null)};
 const res=response();await createOperationsBriefHandler({repository,weatherProvider:{geocode:jest.fn().mockResolvedValue(null)},complianceRepository:{readOverview:jest.fn().mockResolvedValue({})},resolveContext:jest.fn().mockResolvedValue(context)})(req(),res);
 expect(res.body.data.weather.state).toBe('LOCATION_REQUIRED');expect(res.body.data.quickActions.some(x=>x.label==='New Mission')).toBe(true);
});

test('persists an explicitly selected authorised operating location',async()=>{
 const repository={list:jest.fn().mockResolvedValue([{id:'loc-1'},{id:'loc-2'}]),saveOperationsPreference:jest.fn().mockResolvedValue({})};
 const res=response();await createOperationsBriefHandler({repository,complianceRepository:{},resolveContext:jest.fn().mockResolvedValue(context)})(req('POST',{action:'select-location'},{operatingLocationId:'loc-2'}),res);
 expect(res.statusCode).toBe(200);expect(repository.saveOperationsPreference).toHaveBeenCalledWith(context,'loc-2');
});

test('returns advisory weather for explicitly supplied device coordinates without persisting them',async()=>{
 const repository={list:jest.fn().mockResolvedValue([])},weather={forecast:jest.fn().mockResolvedValue({current:{temperatureC:25}})},res=response();
 await createOperationsBriefHandler({repository,weatherProvider:weather,complianceRepository:{},resolveContext:jest.fn().mockResolvedValue(context)})(req('POST',{action:'device-weather'},{latitude:-27.18,longitude:151.26}),res);
 expect(res.body.data).toEqual(expect.objectContaining({state:'READY',locationSource:'DEVICE'}));expect(weather.forecast).toHaveBeenCalledWith({latitude:-27.18,longitude:151.26});
});
