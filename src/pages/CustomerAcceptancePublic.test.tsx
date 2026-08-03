import React from 'react';
import {render,screen}from'@testing-library/react';
import CustomerAcceptancePublic from './CustomerAcceptancePublic';
jest.mock('react-router-dom',()=>({useParams:()=>({token:'secret'})}),{virtual:true});

test('shows only the customer-safe completed Mission summary and optional evidence workflow',async()=>{const api={resolvePublic:jest.fn().mockResolvedValue({organisationName:'Fly The Farm',missionReference:'M-1',customerName:'Acme',completedAt:'2026-08-03T00:00:00Z',states:[{code:'ACCEPTED',displayName:'Accepted'}],satisfactionLevels:[{code:'SATISFIED',displayName:'Satisfied'}]})};render(<CustomerAcceptancePublic api={api}/>);expect(await screen.findByText('Customer Outcome')).toBeInTheDocument();expect(screen.getByText('M-1')).toBeInTheDocument();expect(screen.getByLabelText('I confirm this Customer Outcome is accurate')).toBeInTheDocument();expect(screen.getByLabelText(/Digital signature.*optional/i)).toBeInTheDocument();expect(screen.getByText(/Add outcome photos.*optional/i)).toBeInTheDocument();expect(screen.getByLabelText(/Outcome summary/i)).toBeInTheDocument();expect(screen.queryByText(/chemical/i)).not.toBeInTheDocument();});
