import React from 'react';
import { render, screen } from '@testing-library/react';
import { AssetWorkspaceNavigation } from '../components/maintenance/AssetWorkspaceNavigation';
import { AttachedAssetsSummary } from '../components/maintenance/AttachedAssetsSummary';
import AssetWorkspace from './AssetWorkspace';

const mockNavigate=jest.fn();
let mockParams={source:'fleet-asset',id:'source-ftf-11',section:'components'};
let mockUser={id:'user-1',tenantId:'organisation-1'};
const mockUseFleetAssets=jest.fn(()=>({loading:false,assets:[
 {id:'source-ftf-11',assetIdentifier:'FTF-11',operatingLocationId:'base-1',status:'available'},
 {id:'source-ftf-12',assetIdentifier:'FTF-12',operatingLocationId:'base-1',status:'available'},
]}));
const mockUseAircraft=jest.fn(()=>({isLoading:false,aircraft:[],equipmentKits:[{id:'borrowed-kit',name:'Borrowed kit',operatingLocationId:'base-1',status:'available'}]}));
jest.mock('react-router-dom', () => ({useLocation:()=>({pathname:`/assets/${mockParams.source}/${mockParams.id}/${mockParams.section}`}),useNavigate:()=>mockNavigate,useParams:()=>mockParams,Navigate:({to}:{to:string})=><span>{to}</span>}), { virtual: true });
jest.mock('../contexts/FleetAssetContext',()=>({useFleetAssets:()=>mockUseFleetAssets()}));
jest.mock('../contexts/AircraftContext',()=>({useAircraft:()=>mockUseAircraft()}));
jest.mock('../contexts/AuthContext',()=>({useAuth:()=>({user:mockUser})}));
jest.mock('../components/maintenance/PartsFluidsWorkspace',()=>({PartsFluidsWorkspace:({assetSource,sourceRecordId,view,asOf}:{assetSource:string;sourceRecordId:string;view:string;asOf:string})=><div data-testid="technical-workspace" data-as-of={asOf}>{assetSource}:{sourceRecordId}:{view}</div>}));
jest.mock('../components/maintenance/MaintenanceWorkspace',()=>({MaintenanceWorkspace:({assetSource,sourceRecordId,asOf}:{assetSource:string;sourceRecordId:string;asOf:string})=><div data-testid="maintenance-workspace" data-as-of={asOf}>{assetSource}:{sourceRecordId}:maintenance</div>}));

describe('Asset Workspace composition',()=>{
 beforeEach(()=>{
  mockParams={source:'fleet-asset',id:'source-ftf-11',section:'components'};
  mockUser={id:'user-1',tenantId:'organisation-1'};
  mockNavigate.mockClear();
  mockUseFleetAssets.mockImplementation(()=>({loading:false,assets:[
   {id:'source-ftf-11',assetIdentifier:'FTF-11',operatingLocationId:'base-1',status:'available'},
   {id:'source-ftf-12',assetIdentifier:'FTF-12',operatingLocationId:'base-1',status:'available'},
  ]}));
  mockUseAircraft.mockImplementation(()=>({isLoading:false,aircraft:[],equipmentKits:[{id:'borrowed-kit',name:'Borrowed kit',operatingLocationId:'base-1',status:'available'}]}));
 });
 test('keeps the complete workspace visible with one active route section',()=>{mockParams={source:'fleet-asset',id:'a',section:'components'};render(<AssetWorkspaceNavigation basePath="/assets/fleet-asset/a"/>);expect(screen.getByRole('navigation',{name:'Asset workspace sections'})).toBeVisible();expect(screen.getByRole('button',{name:'Components'})).toHaveAttribute('aria-current','page');for(const label of ['Overview','Maintenance','Components','Parts & Fluids','Service Kits','Defects','Documents','History'])expect(screen.getByRole('button',{name:new RegExp(label)})).toBeVisible();});
 test('attached asset links open the child workspace',()=>{render(<AttachedAssetsSummary assets={[{id:'child',source:'equipment-kit',identity:'Spray kit 1',position:'Rear mount'}]}/>);screen.getByRole('button',{name:/Spray kit 1/}).click();expect(mockNavigate).toHaveBeenCalledWith('/assets/equipment-kit/child/overview');});
 test('empty attachments remain an honest valid state',()=>{render(<AttachedAssetsSummary/>);expect(screen.getByText(/No maintainable assets/)).toBeVisible();});
 test.each([['parts-fluids','parts-fluids'],['service-kits','service-kits']])('connects the %s route through authoritative source identity resolution',section=>{mockParams={source:'fleet-asset',id:'source-ftf-11',section};render(<AssetWorkspace/>);expect(screen.getByTestId('technical-workspace')).toHaveTextContent(`fleet-asset:source-ftf-11:${section}`);});
 test('connects Maintenance to the same authoritative asset route and scoped instant',()=>{mockParams={source:'fleet-asset',id:'source-ftf-11',section:'maintenance'};render(<AssetWorkspace/>);expect(screen.getByTestId('maintenance-workspace')).toHaveTextContent('fleet-asset:source-ftf-11:maintenance');expect(screen.getByTestId('maintenance-workspace')).toHaveAttribute('data-as-of',expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));});
 test('keeps one catalogue instant across rerenders and Parts/Service Kit routes, then resets for asset or organisation scope',()=>{
  jest.useFakeTimers();
  try{
   jest.setSystemTime(new Date('2026-08-20T01:00:00.000Z'));
   mockParams={source:'fleet-asset',id:'source-ftf-11',section:'parts-fluids'};
   const view=render(<AssetWorkspace/>);
   expect(screen.getByTestId('technical-workspace')).toHaveAttribute('data-as-of','2026-08-20T01:00:00.000Z');
   jest.setSystemTime(new Date('2026-08-20T02:00:00.000Z'));
   view.rerender(<AssetWorkspace/>);
   expect(screen.getByTestId('technical-workspace')).toHaveAttribute('data-as-of','2026-08-20T01:00:00.000Z');
   mockParams={...mockParams,section:'service-kits'};
   view.rerender(<AssetWorkspace/>);
   expect(screen.getByTestId('technical-workspace')).toHaveAttribute('data-as-of','2026-08-20T01:00:00.000Z');
   mockParams={...mockParams,section:'maintenance'};
   view.rerender(<AssetWorkspace/>);
   expect(screen.getByTestId('maintenance-workspace')).toHaveAttribute('data-as-of','2026-08-20T01:00:00.000Z');
   jest.setSystemTime(new Date('2026-08-20T03:00:00.000Z'));
   mockParams={source:'fleet-asset',id:'source-ftf-12',section:'parts-fluids'};
   view.rerender(<AssetWorkspace/>);
   expect(screen.getByTestId('technical-workspace')).toHaveAttribute('data-as-of','2026-08-20T03:00:00.000Z');
   jest.setSystemTime(new Date('2026-08-20T04:00:00.000Z'));
   mockUser={id:'user-1',tenantId:'organisation-2'};
   view.rerender(<AssetWorkspace/>);
   expect(screen.getByTestId('technical-workspace')).toHaveAttribute('data-as-of','2026-08-20T04:00:00.000Z');
  }finally{jest.useRealTimers();}
 });
 test('rejects an unknown source before consulting local asset records or the technical API',()=>{
  mockParams={source:'untrusted-source',id:'borrowed-kit',section:'parts-fluids'};
  render(<AssetWorkspace/>);
  expect(screen.getByRole('alert')).toHaveTextContent('Unsupported asset source');
  expect(screen.queryByText('Borrowed kit')).not.toBeInTheDocument();
  expect(screen.queryByTestId('technical-workspace')).not.toBeInTheDocument();
  expect(mockUseFleetAssets).not.toHaveBeenCalled();
  expect(mockUseAircraft).not.toHaveBeenCalled();
 });
});
