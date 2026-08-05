import {fireEvent,render,screen}from'@testing-library/react';
import CasaComplianceOverview from'../CasaComplianceOverview';

jest.mock('../../services/complianceApi',()=>({createComplianceApi:()=>({overview:jest.fn().mockResolvedValue({evaluatedAt:'2026-08-05T00:00:00Z',reoc:{instrument_number:'CASA.REOC.123',expiry_date:'2027-08-05',daysRemaining:365,status:'CURRENT'},operationsManual:null,warnings:{renewalsOverdue:1,legalHolds:0,missingEvidence:2},personnel:{missingCertificates:1,unverifiedCertificates:2},aircraft:{missingEvidence:1},training:{outstanding:3},checklists:{missing:1},healthScore:{modelVersion:'AU-CASA-HEALTH-1',evaluationTimestamp:'2026-08-05T00:00:00Z',percentage:92,status:'CRITICAL',criticalBlockers:[{criticalRuleCode:'REOC_EVIDENCE_MISSING',criticalRuleVersion:1,reason:'ReOC evidence is missing.',sourceEntityType:'organisation_compliance_instrument',sourceEntityId:'11111111-1111-4111-8111-111111111111',sourceRowVersion:2,affectedArea:'ReOC',evaluationTimestamp:'2026-08-05T00:00:00Z',route:'/compliance'}],categories:[{code:'REOC',label:'ReOC and organisation certificates',earnedPoints:0,weight:20,counts:{assessed:1,missing:1,blocking:0,due30:0,due90:0},sources:[{state:'MISSING',reason:'ReOC evidence is missing.',sourceEntityType:'organisation_compliance_instrument',sourceEntityId:'11111111-1111-4111-8111-111111111111',sourceRowVersion:2,route:'/compliance'}]}]},calendar:{events:[{eventKey:'REOC:1:EXPIRY',title:'ReOC expiry',recordType:'REOC',dueDate:'2026-08-20',daysRemaining:15,state:'DUE_30',requiredAction:'Review the ReOC certificate.',route:'/compliance'}],facets:{recordTypes:['REOC']}}}),saveInstrument:jest.fn(),publishManual:jest.fn()})}));

test('puts compliance status, plain-language issue and next action first',async()=>{
 render(<CasaComplianceOverview/>);
 expect(await screen.findByText('92%')).toBeInTheDocument();
 expect(screen.getByText('Critical attention required')).toBeInTheDocument();
 expect(screen.getByText('ReOC certificate evidence missing')).toBeInTheDocument();
 expect(screen.getByText('Add the current ReOC certificate evidence to clear this critical issue.')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Upload ReOC'})).toBeInTheDocument();
 expect(screen.getByText(/Last updated 5 Aug 2026/i)).toBeInTheDocument();
 expect(screen.getByText(/not legal certification/i)).toBeInTheDocument();
});

test('keeps technical provenance behind issue details',async()=>{
 render(<CasaComplianceOverview/>);
 await screen.findByText('92%');
 expect(screen.queryByText(/organisation_compliance_instrument/)).not.toBeInTheDocument();
 expect(screen.queryByText(/11111111-1111/)).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'View issue details'}));
 expect(screen.getByText(/organisation_compliance_instrument/)).toBeInTheDocument();
 expect(screen.getByText(/11111111-1111/)).toBeInTheDocument();
 expect(screen.getByText(/AU-CASA-HEALTH-1/)).toBeInTheDocument();
});

test('shows five action-oriented categories and a concise next-events section',async()=>{
 render(<CasaComplianceOverview/>);
 await screen.findByText('92%');
 for(const label of['ReOC and Organisation','Operations Manual','Personnel and Licences','Aircraft and Technical','Checklists and Actions'])expect(screen.getByText(label)).toBeInTheDocument();
 expect(screen.getByText('No checklist or corrective-action evidence is available yet.')).toBeInTheDocument();
 expect(screen.queryByText('Personnel Credentials')).not.toBeInTheDocument();
 expect(screen.getByText('Next 90 days')).toBeInTheDocument();
 expect(screen.getByText('ReOC renewal due')).toBeInTheDocument();
 expect(screen.getByText(/15 days remaining/)).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'View calendar'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'View ReOC and Organisation details'})).toBeInTheDocument();
});

test('reveals existing evidence workflows from the relevant operator action',async()=>{
 render(<CasaComplianceOverview/>);
 await screen.findByText('92%');
 expect(screen.queryByLabelText('ReOC number')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Upload ReOC'}));
 expect(screen.getByLabelText('ReOC number')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Save ReOC certificate'})).toBeInTheDocument();
});
