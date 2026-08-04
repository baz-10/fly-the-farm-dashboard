import React from 'react';
import { Alert, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { listPlatformSupport, startSupportSession } from '../../services/platformApi';

export default function AssistedSupport(){const[items,setItems]=React.useState<any[]>([]);const[error,setError]=React.useState('');
 const load=React.useCallback(()=>{void listPlatformSupport().then(setItems).catch(e=>setError(e instanceof Error?e.message:'Support queue failed.'));},[]);React.useEffect(load,[load]);
 const start=async(id:string)=>{try{await startSupportSession(id);load();}catch(e){setError(e instanceof Error?e.message:'Session could not start.');}};
 return <Stack spacing={2} sx={{mt:3}}><Typography variant="h5" fontWeight={800}>Assisted Support</Typography>{error&&<Alert severity="error">{error}</Alert>}{items.length===0?<Alert severity="info">No approved organisation support requests are waiting.</Alert>:items.map(item=><Card key={item.id} variant="outlined"><CardContent><Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={2}><span><Typography fontWeight={750}>{item.organisations?.name||'Organisation support request'}</Typography><Typography variant="body2" color="text.secondary">{item.reason}</Typography><Stack direction="row" spacing={1} sx={{mt:1}}><Chip size="small" label={item.access_mode}/><Chip size="small" label={item.scope_type}/></Stack></span>{item.state==='APPROVED'&&<Button variant="contained" onClick={()=>start(item.id)}>Start approved session</Button>}</Stack></CardContent></Card>)}</Stack>;
}
