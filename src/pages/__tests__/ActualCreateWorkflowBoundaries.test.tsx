import React from'react';import{render,screen}from'@testing-library/react';import ActualCreate from'../ActualCreate';
jest.mock('react-router-dom',()=>({useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('../../contexts/OperationalDataContext',()=>({useOperationalData:()=>({status:'loading',operatingLocations:[],clients:[],properties:[],fields:[],jobs:[],missions:[]})}));
jest.mock('../../services/financialActualsApi',()=>({createFinancialActualsApi:()=>({create:jest.fn()})}));
test('fails closed while authoritative operational context is unresolved',()=>{render(<ActualCreate/>);expect(screen.getByRole('button',{name:'Create authoritative Draft'})).toBeDisabled();expect(screen.getByText(/context is loading/i)).toBeVisible()});
