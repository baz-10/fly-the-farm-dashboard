import { composeDevelopmentChecklist, developmentProfiles, getOrganisationUpdateState } from '../prepreparedChecklistEngine';

const context={aircraft:{id:'aircraft-1',manufacturer:'DJI',model:'T100'},mission:{id:'mission-1'},operatingLocation:{id:'base-1'},fleetReady:true,configuration:'SPRAY' as const,rtk:'ENABLED' as const,compassCalibrationRequired:false,flowCalibrationRequired:false};

test('composes T100 SPRAY with resolved authority and the accepted physical outcomes',()=>{
 const result=composeDevelopmentChecklist(developmentProfiles.T100_PRE_FLIGHT,context);
 expect(result.status).toBe('READY');
 expect(result.operatorItems).toHaveLength(19);
 expect(result.resolvedEvidence.map(x=>x.code)).toEqual(expect.arrayContaining(['MISSION','AIRCRAFT','BASE','FLEET_READINESS','RTK_CONFIGURATION']));
 expect(result.operatorItems.map(x=>x.outcome)).toEqual(expect.arrayContaining(['AIRCRAFT_PHYSICAL_CONDITION','PROPULSION_CONDITION','BATTERY_POWER_CONDITION','SPRAY_SYSTEM_CONDITION','LIDAR_CONDITION']));
 expect(result.operatorItems.some(x=>x.outcome==='SPREAD_SYSTEM_CONDITION')).toBe(false);
 expect(result.takeOffConfirmation.map(x=>x.outcome)).toContain('FLIGHT_CONTROL_RESPONSE');
});

test('composes T100 SPREAD without artificial spray symmetry',()=>{
 const result=composeDevelopmentChecklist(developmentProfiles.T100_PRE_FLIGHT,{...context,configuration:'SPREAD'});
 expect(result.status).toBe('READY');
 expect(result.operatorItems).toHaveLength(20);
 expect(result.operatorItems.map(x=>x.outcome)).toContain('SPREAD_SYSTEM_CONDITION');
 expect(result.operatorItems.map(x=>x.outcome)).not.toContain('SPRAY_SYSTEM_CONDITION');
});

test('fails closed when configuration or conditional authority cannot be resolved',()=>{
 expect(composeDevelopmentChecklist(developmentProfiles.T100_PRE_FLIGHT,{...context,configuration:null}).status).toBe('REVIEW_REQUIRED');
 expect(composeDevelopmentChecklist(developmentProfiles.T100_PRE_FLIGHT,{...context,rtk:'UNKNOWN'})).toMatchObject({status:'REVIEW_REQUIRED',unresolved:['RTK_CONFIGURATION']});
});

test('shows calibration only when authoritative context requires it',()=>{
 const routine=composeDevelopmentChecklist(developmentProfiles.T100_PRE_FLIGHT,context);
 const required=composeDevelopmentChecklist(developmentProfiles.T100_PRE_FLIGHT,{...context,compassCalibrationRequired:true,flowCalibrationRequired:true});
 expect(routine.operatorItems.map(x=>x.outcome)).not.toEqual(expect.arrayContaining(['COMPASS_CALIBRATION','FLOW_CALIBRATION']));
 expect(required.operatorItems.map(x=>x.outcome)).toEqual(expect.arrayContaining(['COMPASS_CALIBRATION','FLOW_CALIBRATION']));
});

test.each(['T50','T25P','T25'] as const)('retains only evidenced %s capabilities',model=>{
 const result=composeDevelopmentChecklist(developmentProfiles[`${model}_PRE_FLIGHT`],{...context,aircraft:{...context.aircraft,model}});
 expect(result.status).toBe('READY');
 expect(result.operatorItems.map(x=>x.outcome)).not.toContain('LIDAR_CONDITION');
 expect(result.takeOffConfirmation.map(x=>x.outcome)).not.toContain('FLIGHT_CONTROL_RESPONSE');
});

test('reports an update without mutating an inherited organisation version',()=>{
 expect(getOrganisationUpdateState({sourceVersion:1,frozenSections:[{id:'kept'}]},2)).toEqual({updateAvailable:true,currentSourceVersion:1,availableSourceVersion:2});
});
