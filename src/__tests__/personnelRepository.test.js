jest.mock('../../server/supabase',()=>({supabaseRequest:jest.fn()}));
const {supabaseRequest}=require('../../server/supabase');
const {OperationalRepository}=require('../../server/operational-repository');
const context={organisation:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},internalUser:{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}};

test('Personnel repository uses trusted RPCs and normalises control envelopes',async()=>{
 const repository=new OperationalRepository();supabaseRequest.mockResolvedValueOnce([{id:'p'}]).mockResolvedValueOnce({conflict:true,current_version:4}).mockResolvedValueOnce({qualification_blockers:[{code:'BLOCK'}]});
 await expect(repository.listPersonnel(context,{operatingLocationId:null,includePrivate:false})).resolves.toEqual([{id:'p'}]);
 await expect(repository.writePersonnel(context,'update','dddddddd-dddd-4ddd-8ddd-dddddddddddd',2,{})).resolves.toEqual({conflict:true,currentVersion:4});
 await expect(repository.saveMissionPersonnel(context,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',0,[])).resolves.toEqual({qualificationBlockers:[{code:'BLOCK'}]});
 expect(supabaseRequest.mock.calls.map(([path])=>path)).toEqual(['rest/v1/rpc/ftf_list_personnel','rest/v1/rpc/ftf_write_personnel','rest/v1/rpc/ftf_save_mission_personnel']);
});
