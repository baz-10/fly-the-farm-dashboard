import React from'react';import{fireEvent,render,screen,waitFor}from'@testing-library/react';import MissionOperationalCloseout from'../MissionOperationalCloseout';import{PRODUCT_MATURITY_REGISTRY}from'../../../productMaturity/registry';import{ProductMaturityEntry}from'../../../productMaturity/types';
const mockReportStatusMount=jest.fn();jest.mock('../../reports/ReportArtefactStatus',()=>({__esModule:true,default:({reportType}:any)=>{mockReportStatusMount(reportType);return <button>Generate {reportType}</button>}}));
const state={authorisation:{id:'a1',evidence_manifest:{planning:{aircraft:[{aircraftId:'ac1',snapshot:{registration:'FTF-T100'}}],equipmentKits:[{equipmentKitId:'k1',snapshot:{name:'Broadcast Kit'}}],personnel:{assignments:[{personnelId:'p1',snapshot:{name:'Ben Trollope'}}]},chemicals:{products:[{productName:'Grazon Extra',rate:2}],application_volume_l_ha:40,treatment_area_ha:10.9}}}},imports:[{id:'i1',evidence_type:'FINAL_KML',parse_status:'PARSED',original_filename:'flight.kml'}],resources:null,chemicals:null,events:[],operationalRevision:null,completion:null};
const api={read:jest.fn().mockResolvedValue(state),upload:jest.fn(),saveResources:jest.fn().mockResolvedValue({id:'r1',version_number:1}),saveChemicals:jest.fn().mockResolvedValue({id:'c1',version_number:1}),saveEvents:jest.fn().mockResolvedValue([{id:'e1',batch_version:1}]),submit:jest.fn().mockResolvedValue({id:'o1',version_number:1}),complete:jest.fn().mockResolvedValue({id:'x1',version_number:1})};
beforeEach(()=>{jest.clearAllMocks();api.read.mockResolvedValue(state);api.upload.mockResolvedValue({id:'i2'});api.saveResources.mockResolvedValue({id:'r1',version_number:1});api.saveChemicals.mockResolvedValue({id:'c1',version_number:1});api.saveEvents.mockResolvedValue([{id:'e1',batch_version:1}]);api.submit.mockResolvedValue({id:'o1',version_number:1});api.complete.mockResolvedValue({id:'x1',version_number:1});});

test('uploads one immutable KMZ with explicit day and aircraft attribution',async()=>{
 const dayId='22222222-2222-4222-8222-222222222222',aircraftId='33333333-3333-4333-8333-333333333333';
 api.read.mockResolvedValue({...state,operatingDays:[{id:dayId,work_date:'2026-09-05',package_revision_id:'44444444-4444-4444-8444-444444444444',state:'IN_PROGRESS',row_version:1}],availableResources:{aircraft:[{id:aircraftId,label:'FTF-T100-001'}],equipmentKits:[],personnel:[]}});
 render(<MissionOperationalCloseout missionId="m1" api={api as any}/>);
 await screen.findByRole('heading',{name:'Operational Data Import'});
 fireEvent.mouseDown(screen.getByLabelText('Attribution operating day'));
 fireEvent.click(await screen.findByRole('option',{name:'2026-09-05'}));
 fireEvent.mouseDown(screen.getByLabelText('Attribution aircraft'));
 fireEvent.click(await screen.findByRole('option',{name:'FTF-T100-001'}));
 fireEvent.click(screen.getByRole('button',{name:'Add evidence attribution'}));
 const file=new File(['PK retained KMZ'],'multi.kmz',{type:'application/vnd.google-earth.kmz'}),input=document.querySelector('input[type="file"]') as HTMLInputElement;
 fireEvent.change(input,{target:{files:[file]}});
 await waitFor(()=>expect(api.upload).toHaveBeenCalledWith('m1',expect.objectContaining({fileType:'kmz',evidenceType:'FLIGHT_LINES',attributions:[{operatingDayId:dayId,aircraftId,confidence:'OPERATOR_CONFIRMED'}]})));
});
test('guides the operator through actual resources, chemicals, events, review and completion',async()=>{render(<MissionOperationalCloseout missionId="m1" api={api as any}/>);expect(await screen.findByRole('heading',{name:'Operational Data Import'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Continue to Actual Resources'}));expect(await screen.findByDisplayValue('FTF-T100')).toBeInTheDocument();expect(screen.getByDisplayValue('Ben Trollope')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Confirm Actual Resources'}));await screen.findByRole('heading',{name:'Actual Chemical Usage'});fireEvent.click(screen.getByRole('button',{name:'Accept Planned Chemical Usage'}));await waitFor(()=>expect(api.saveChemicals).toHaveBeenCalledWith('m1',0,expect.objectContaining({changedFromPlan:false})));await screen.findByRole('heading',{name:'Operational Events'});fireEvent.click(screen.getByRole('button',{name:'No operational events'}));await waitFor(()=>expect(api.saveEvents).toHaveBeenCalledWith('m1',0,[]));expect(await screen.findByText('Planned versus actual')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Submit Operational Evidence'}));await screen.findByRole('heading',{name:'Mission Completion'});fireEvent.click(screen.getByRole('button',{name:'Complete Mission'}));await waitFor(()=>expect(api.complete).toHaveBeenCalledWith('m1','o1',0,expect.any(String),undefined));expect(await screen.findByText('Mission completed · version 1')).toBeInTheDocument();});

test('restores persisted closeout progress and lets the operator review earlier stages before Completion',async()=>{
 const persisted={...state,resources:{id:'r1',version_number:1},chemicals:{id:'c1',version_number:1,changed_from_plan:false},events:[{id:'e1',batch_version:1,no_events_declaration:true}],operationalRevision:{id:'o1',version_number:1}};
 api.read.mockResolvedValue(persisted);
 render(<MissionOperationalCloseout missionId="m1" api={api as any}/>);
 expect(await screen.findByRole('heading',{name:'Operational Review'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Actual Resources'}));
 expect(await screen.findByRole('heading',{name:'Actual Resources'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Operational Review'}));
 expect(await screen.findByRole('heading',{name:'Operational Review'})).toBeInTheDocument();
});

test('uses the latest persisted version when saving a corrected closeout stage',async()=>{
 const persisted={...state,resources:{id:'r2',version_number:2},chemicals:{id:'c1',version_number:1},events:[{id:'e1',batch_version:1,no_events_declaration:true}],operationalRevision:{id:'o1',version_number:1}};
 api.read.mockResolvedValue(persisted);
 render(<MissionOperationalCloseout missionId="m1" api={api as any}/>);
 await screen.findByRole('heading',{name:'Operational Review'});
 fireEvent.click(screen.getByRole('button',{name:'Actual Resources'}));
 fireEvent.click(await screen.findByRole('button',{name:'Save Corrected Resource Revision'}));
 await waitFor(()=>expect(api.saveResources).toHaveBeenCalledWith('m1',2,expect.objectContaining({changedFromPlan:false})));
});

test('restores recorded resource and chemical actuals instead of asking the operator twice',async()=>{
 const persisted={...state,resources:{id:'r2',version_number:2,changed_from_plan:false,actual_resources:{aircraftIds:['ac1'],equipmentKitIds:['k1'],personnelIds:['p1'],batteries:[{sequence:1},{sequence:2}],reloads:[{sequence:1}],refills:[{waterLitres:120}]}},chemicals:{id:'c1',version_number:1,changed_from_plan:false,actual_usage:{actualTreatmentAreaHa:10.9,actualWaterLitres:436,actualBatches:11}},events:[{id:'e1',batch_version:1,no_events_declaration:true}],operationalRevision:{id:'o1',version_number:1,operator_notes:'Completed without interruption.'}};
 api.read.mockResolvedValue(persisted);
 render(<MissionOperationalCloseout missionId="m1" api={api as any}/>);
 await screen.findByRole('heading',{name:'Operational Review'});
 fireEvent.click(screen.getByRole('button',{name:'Actual Resources'}));
 expect(screen.getByRole('spinbutton',{name:'Batteries used'})).toHaveValue(2);
 expect(screen.getByRole('spinbutton',{name:'Reloads'})).toHaveValue(1);
 expect(screen.getByRole('spinbutton',{name:'Water refilled (L)'})).toHaveValue(120);
 fireEvent.click(screen.getByRole('button',{name:'Actual Chemical Usage'}));
 expect(screen.getByRole('spinbutton',{name:'Actual treatment area (ha)'})).toHaveValue(10.9);
 expect(screen.getByRole('spinbutton',{name:'Actual water (L)'})).toHaveValue(436);
 expect(screen.getByRole('spinbutton',{name:'Actual batches'})).toHaveValue(11);
 fireEvent.click(screen.getByRole('button',{name:'Operational Review'}));
 expect(screen.getByRole('textbox',{name:'Operational review notes'})).toHaveValue('Completed without interruption.');
});

test('keeps completed closeout evidence reviewable but removes every mutation action',async()=>{
 const completed={...state,resources:{id:'r1',version_number:1},chemicals:{id:'c1',version_number:1},events:[{id:'e1',batch_version:1,no_events_declaration:true}],operationalRevision:{id:'o1',version_number:1},completion:{id:'x1',version_number:1}};
 api.read.mockResolvedValue(completed);
 render(<MissionOperationalCloseout missionId="m1" api={api as any}/>);
 expect(await screen.findByText('Mission completed · version 1')).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Complete Mission'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Operational Data Import'}));
 expect(await screen.findByRole('heading',{name:'Operational Data Import'})).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Import operational file'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Actual Resources'}));
 expect(screen.queryByRole('button',{name:'Confirm Actual Resources'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Actual Chemical Usage'}));
 expect(screen.queryByRole('button',{name:'Accept Planned Chemical Usage'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Operational Events'}));
 expect(screen.queryByRole('button',{name:'No operational events'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Operational Review'}));
 expect(screen.queryByRole('button',{name:'Submit Operational Evidence'})).not.toBeInTheDocument();
});

test('shows one reports workspace with a unique label and mounts neither completed report status when reports are coming soon',async()=>{
 const completed={...state,resources:{id:'r1',version_number:1},chemicals:{id:'c1',version_number:1},events:[{id:'e1',batch_version:1,no_events_declaration:true}],operationalRevision:{id:'o1',version_number:1},completion:{id:'x1',version_number:1}};
 api.read.mockResolvedValue(completed);mockReportStatusMount.mockClear();
 const entry=(PRODUCT_MATURITY_REGISTRY as ProductMaturityEntry[]).find(item=>item.moduleCode==='mission-workspace'&&item.workflowCode==='reports')!,previous=entry.maturity;entry.maturity='COMING_SOON';
 try{
  render(<MissionOperationalCloseout missionId="m1" api={api as any}/>);
  expect(await screen.findByText('Mission completed · version 1')).toBeVisible();
  const workspaces=screen.getAllByRole('region',{name:'Mission Reports'});
  expect(workspaces).toHaveLength(1);
  expect(workspaces[0]).toHaveAttribute('aria-labelledby','mission-workspace-reports-coming-soon');
  expect(document.querySelectorAll('#mission-workspace-reports-coming-soon')).toHaveLength(1);
  expect(mockReportStatusMount).not.toHaveBeenCalled();
  expect(screen.queryByText('Generate MISSION_SUMMARY')).not.toBeInTheDocument();
  expect(screen.queryByText('Generate MISSION_RECORD')).not.toBeInTheDocument();
 }finally{entry.maturity=previous;}
});
