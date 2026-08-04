import React from 'react';
import { Alert, Box, Button, Card, CardContent, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { createSupportRequest, decideSupportRequest, listOrganisationSupport } from '../../services/platformApi';

interface SupportAccessApi { list: typeof listOrganisationSupport; create: typeof createSupportRequest; decide: typeof decideSupportRequest; }
const defaultApi: SupportAccessApi = { list: listOrganisationSupport, create: createSupportRequest, decide: decideSupportRequest };

export default function OrganisationSupportAccess({ api = defaultApi }: { api?: SupportAccessApi }) {
  const [reason,setReason]=React.useState('');const[mode,setMode]=React.useState<'READ_ONLY'|'READ_WRITE'>('READ_ONLY');
  const[message,setMessage]=React.useState('');const[error,setError]=React.useState('');const[pending,setPending]=React.useState<any>(null);
  const[history,setHistory]=React.useState<any[]>([]);
  React.useEffect(()=>{void api.list().then(setHistory).catch(()=>setHistory([]));},[api]);
  const create=async()=>{setError('');try{const record=await api.create({reason,accessMode:mode,scopeType:'ORGANISATION',durationMinutes:120});setPending(record);setMessage('Support request recorded. Approval is a separate authoritative action.');}catch(e){setError(e instanceof Error?e.message:'Support request failed.');}};
  const approve=async()=>{try{const result=await api.decide({requestId:pending.request_id,expectedVersion:pending.row_version,decision:'APPROVE',notes:'Organisation approved assisted support.'});setPending({...pending,state:result.state});setMessage(result.requester_is_approver?'Approved. Requester and approver are the same person; both events were recorded independently.':'Approved by a different Organisation Administrator.');}catch(e){setError(e instanceof Error?e.message:'Approval failed.');}};
  return <Card variant="outlined"><CardContent>
    <Typography variant="overline" color="text.secondary">Organisation Assisted Support</Typography>
    <Typography variant="h6" fontWeight={750} gutterBottom>Grant temporary Spray Command support</Typography>
    <Typography color="text.secondary" sx={{mb:2}}>No platform user can see operational data until this organisation requests and approves a time-limited scope.</Typography>
    {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}{message&&<Alert severity="info" sx={{mb:2}}>{message}</Alert>}
    <Stack spacing={2}>
      <TextField label="Support reason" value={reason} onChange={e=>setReason(e.target.value)} required multiline minRows={2}/>
      <FormControl><InputLabel>Access mode</InputLabel><Select label="Access mode" value={mode} onChange={e=>setMode(e.target.value as any)}><MenuItem value="READ_ONLY">Read only</MenuItem><MenuItem value="READ_WRITE">Read / write</MenuItem></Select></FormControl>
      <Box><Button variant="contained" onClick={create} disabled={reason.trim().length<3}>Request support</Button></Box>
      {pending?.state==='PENDING'&&<Box sx={{border:'1px solid',borderColor:'divider',borderRadius:2,p:2}}><Typography fontWeight={700}>Organisation approval required</Typography><Typography variant="body2" color="text.secondary" sx={{mb:1.5}}>Default duration: two hours · Scope: whole organisation · Mode: {mode==='READ_ONLY'?'read only':'read / write'}</Typography><Button variant="outlined" onClick={approve}>Approve request</Button></Box>}
      {history.length>0&&<Typography variant="caption" color="text.secondary">{history.length} historical support request{history.length===1?'':'s'} retained.</Typography>}
    </Stack>
  </CardContent></Card>;
}
