const{createOperationsBriefHandler}=require('../../server/operations-brief-api');
const context={organisation:{id:'org-1',name:'Fly The Farm'},internalUser:{id:'user-1'},permissions:['missions.read','missions.create','clients.create','compliance.read'],operatingLocationIds:['loc-1']};
const response=()=>{const r={statusCode:200,body:null,headers:{}};r.setHeader=(k,v)=>r.headers[k]=v;r.status=n=>(r.statusCode=n,r);r.json=b=>(r.body=b,r);return r;};
const req=(method='GET',query={},body={})=>({method,query,body,headers:{origin:'https://spray.test',host:'spray.test','x-forwarded-proto':'https'}});

test('builds a scoped brief and auto-selects the sole operating location',async()=>{
 const repository={list:jest.fn(async resource=>resource==='operating_locations'?[{id:'loc-1',name:'Fly The Farm Base',address:'Dalby QLD'}]:resource==='missions'?[{id:'m1',title:'Spray north field',status:'planning',scheduled_start_at:'2026-08-05T08:00:00+10:00',operating_location_id:'loc-1'}]:[]),listMissionSetupDrafts:jest.fn().mockResolvedValue([]),readOperationsPreference:jest.fn().mockResolvedValue({recent_weather_searches:[]})};
 const weather={geocode:jest.fn().mockResolvedValue({latitude:-27.18,longitude:151.26}),reverse:jest.fn().mockResolvedValue({label:'Dalby, QLD 4405',locality:'Dalby',state:'QLD',postcode:'4405'}),forecast:jest.fn().mockResolvedValue({current:{temperatureC:24},hourly:[],daily:[],retrievedAt:'2026-08-05T00:00:00Z'})};
 const compliance={readOverview:jest.fn().mockResolvedValue({healthScore:{criticalBlockers:[{criticalRuleCode:'REOC_MISSING',reason:'Required ReOC record is missing.',route:'/compliance'}]}})};
 const res=response();await createOperationsBriefHandler({repository,weatherProvider:weather,complianceRepository:compliance,resolveContext:jest.fn().mockResolvedValue(context),now:()=>new Date('2026-08-04T22:00:00Z')})(req(),res);
 expect(res.statusCode).toBe(200);expect(res.body.data.location).toEqual(expect.objectContaining({id:'loc-1',name:'Fly The Farm Base'}));
 expect(res.body.data.weather).toEqual(expect.objectContaining({resolvedLocation:expect.objectContaining({label:'Dalby, QLD 4405'}),sourceLabel:'Fly The Farm Base'}));
 expect(res.body.data.schedule[0]).toEqual(expect.objectContaining({id:'m1',action:{label:'Open Mission',route:'/missions/m1'}}));
 expect(res.body.data.quickActions.map(x=>x.label)).toEqual(expect.arrayContaining(['New Client','Search']));
 expect(res.body.data.quickActions.map(x=>x.label)).not.toContain('New Mission');
 expect(res.body.data.quickActions.map(x=>x.label)).not.toContain('Open Schedule');
 expect(res.body.data.alerts[0]).toEqual(expect.objectContaining({title:'ReOC certificate missing',blocking:false}));
});

test('missing location coordinates informs without removing quick actions',async()=>{
 const repository={list:jest.fn(async resource=>resource==='operating_locations'?[{id:'loc-1',name:'Base',address:''}]:[]),listMissionSetupDrafts:jest.fn().mockResolvedValue([]),readOperationsPreference:jest.fn().mockResolvedValue(null)};
 const res=response();await createOperationsBriefHandler({repository,weatherProvider:{geocode:jest.fn().mockResolvedValue(null)},complianceRepository:{readOverview:jest.fn().mockResolvedValue({})},resolveContext:jest.fn().mockResolvedValue(context)})(req(),res);
 expect(res.body.data.weather.state).toBe('LOCATION_REQUIRED');expect(res.body.data.quickActions.some(x=>x.label==='New Client')).toBe(true);
});

test('persists an explicitly selected authorised operating location',async()=>{
 const repository={list:jest.fn().mockResolvedValue([{id:'loc-1'},{id:'loc-2'}]),saveOperationsPreference:jest.fn().mockResolvedValue({})};
 const res=response();await createOperationsBriefHandler({repository,complianceRepository:{},resolveContext:jest.fn().mockResolvedValue(context)})(req('POST',{action:'select-location'},{operatingLocationId:'loc-2'}),res);
 expect(res.statusCode).toBe(200);expect(repository.saveOperationsPreference).toHaveBeenCalledWith(context,'loc-2');
});

test('returns geographically labelled advisory weather for explicitly supplied device coordinates without persisting them',async()=>{
 const repository={list:jest.fn().mockResolvedValue([])},weather={forecast:jest.fn().mockResolvedValue({current:{temperatureC:25}}),reverse:jest.fn().mockResolvedValue({label:'Molendinar, QLD 4214'})},res=response();
 await createOperationsBriefHandler({repository,weatherProvider:weather,complianceRepository:{},resolveContext:jest.fn().mockResolvedValue(context)})(req('POST',{action:'device-weather'},{latitude:-27.18,longitude:151.26}),res);
 expect(res.body.data).toEqual(expect.objectContaining({state:'READY',locationSource:'DEVICE',resolvedLocation:{label:'Molendinar, QLD 4214'},sourceLabel:'Device location'}));expect(weather.forecast).toHaveBeenCalledWith({latitude:-27.18,longitude:151.26});
});

test('searches weather locations and returns advisory weather without changing the Home default',async()=>{
 const repository={list:jest.fn().mockResolvedValue([]),saveRecentWeatherSearch:jest.fn().mockResolvedValue([{label:'Toowoomba, QLD 4350'}])};
 const weather={search:jest.fn().mockResolvedValue([{label:'Toowoomba, QLD 4350',latitude:-27.56,longitude:151.95}]),forecast:jest.fn().mockResolvedValue({current:{temperatureC:21}})};
 const handler=createOperationsBriefHandler({repository,weatherProvider:weather,complianceRepository:{},resolveContext:jest.fn().mockResolvedValue(context)});
 const searchRes=response();await handler(req('POST',{action:'search-weather'},{query:'Toowoomba'}),searchRes);
 expect(searchRes.body.data.results[0]).toEqual(expect.objectContaining({label:'Toowoomba, QLD 4350'}));
 const weatherRes=response();await handler(req('POST',{action:'searched-weather'},{location:{label:'Toowoomba, QLD 4350',latitude:-27.56,longitude:151.95}}),weatherRes);
 expect(weatherRes.body.data).toEqual(expect.objectContaining({state:'READY',locationSource:'SEARCH',sourceLabel:'Searched location',resolvedLocation:expect.objectContaining({label:'Toowoomba, QLD 4350'})}));
 expect(repository.saveRecentWeatherSearch).toHaveBeenCalled();
 expect(repository.saveOperationsPreference).toBeUndefined();
});

test('adds and removes only the signed-in users bounded weather favourites',async()=>{
 const repository={list:jest.fn().mockResolvedValue([]),saveFavouriteWeatherLocation:jest.fn().mockResolvedValue([{label:'Emerald, QLD 4720',latitude:-23.53,longitude:148.16}]),removeFavouriteWeatherLocation:jest.fn().mockResolvedValue([])};
 const handler=createOperationsBriefHandler({repository,weatherProvider:{},complianceRepository:{},resolveContext:jest.fn().mockResolvedValue(context)}),location={label:'Emerald, QLD 4720',latitude:-23.53,longitude:148.16};
 const add=response();await handler(req('POST',{action:'favourite-weather'},{location}),add);
 expect(add.statusCode).toBe(200);expect(repository.saveFavouriteWeatherLocation).toHaveBeenCalledWith(context,expect.objectContaining(location));
 const remove=response();await handler(req('POST',{action:'unfavourite-weather'},{location}),remove);
 expect(remove.statusCode).toBe(200);expect(repository.removeFavouriteWeatherLocation).toHaveBeenCalledWith(context,expect.objectContaining(location));
});
