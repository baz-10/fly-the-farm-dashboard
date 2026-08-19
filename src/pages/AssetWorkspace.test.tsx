import React from 'react';
import { render, screen } from '@testing-library/react';
import { AssetWorkspaceNavigation } from '../components/maintenance/AssetWorkspaceNavigation';
import { AttachedAssetsSummary } from '../components/maintenance/AttachedAssetsSummary';

const mockNavigate=jest.fn();
jest.mock('react-router-dom', () => ({useLocation:()=>({pathname:'/assets/fleet-asset/a/components'}),useNavigate:()=>mockNavigate}), { virtual: true });

describe('Asset Workspace composition',()=>{
 test('keeps the complete workspace visible with one active route section',()=>{render(<AssetWorkspaceNavigation basePath="/assets/fleet-asset/a"/>);expect(screen.getByRole('navigation',{name:'Asset workspace sections'})).toBeVisible();expect(screen.getByRole('button',{name:'Components'})).toHaveAttribute('aria-current','page');for(const label of ['Overview','Maintenance','Components','Parts & Fluids','Defects','Documents','History'])expect(screen.getByRole('button',{name:new RegExp(label)})).toBeVisible();});
 test('attached asset links open the child workspace',()=>{render(<AttachedAssetsSummary assets={[{id:'child',source:'equipment-kit',identity:'Spray kit 1',position:'Rear mount'}]}/>);screen.getByRole('button',{name:/Spray kit 1/}).click();expect(mockNavigate).toHaveBeenCalledWith('/assets/equipment-kit/child/overview');});
 test('empty attachments remain an honest valid state',()=>{render(<AttachedAssetsSummary/>);expect(screen.getByText(/No maintainable assets/)).toBeVisible();});
});
