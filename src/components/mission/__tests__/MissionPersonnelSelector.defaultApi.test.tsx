import {render,screen}from'@testing-library/react';

jest.mock('../../../services/personnelApi',()=>({
 createPersonnelApi:()=>({list:async()=>[],readMissionAssignments:async()=>null}),
 PersonnelApiError:class extends Error{},
}));
const MissionPersonnelSelector=require('../MissionPersonnelSelector').default;

test('the default Personnel API loads once instead of restarting after every render',async()=>{
 render(<MissionPersonnelSelector missionId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" operatingLocationId="cccccccc-cccc-4ccc-8ccc-cccccccccccc" scheduledStartAt="2026-08-02T10:00:00Z"/>);
 await screen.findByRole('button',{name:'Save Personnel · version 0'});
});
