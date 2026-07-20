import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, Stack, Tab, Tabs, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BuildCircleOutlinedIcon from '@mui/icons-material/BuildCircleOutlined';
import EngineeringOutlinedIcon from '@mui/icons-material/EngineeringOutlined';
import FlightOutlinedIcon from '@mui/icons-material/FlightOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import { useMaintenance } from '../contexts/MaintenanceContext';
import MaintenanceAssetPanel from '../components/maintenance/MaintenanceAssetPanel';
import MaintenanceRecordDialog from '../components/maintenance/MaintenanceRecordDialog';
import MaintenanceStatusChip from '../components/maintenance/MaintenanceStatusChip';

export default function MaintenanceCommand(){
 const {assets,records,schedules,isLoading,loadError,submitRecord}=useMaintenance();const [scope,setScope]=React.useState<'all'|'rpas'|'fleet'>('all');const [selected,setSelected]=React.useState<string>();const [quick,setQuick]=React.useState(false);
 const shown=assets.filter(a=>scope==='all'||a.scope===scope);const unserviceable=assets.filter(a=>a.status==='unserviceable').length;const awaiting=records.filter(r=>r.status==='awaiting-release').length;const open=records.filter(r=>!['serviceable','deferred'].includes(r.status));const defaultAsset=assets[0];
 if(isLoading)return <Stack alignItems="center" sx={{py:10}}><CircularProgress/></Stack>;
 return <Box sx={{maxWidth:1500,mx:'auto',p:{xs:2,md:4}}}>
  <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={2} mb={3}><Box><Typography component="h1" variant="h3" fontWeight={900}>Maintenance Command</Typography><Typography color="text.secondary" sx={{mt:.5}}>One view for RPAS technical records, vehicle servicing, defects, firmware and release.</Typography></Box><Button variant="contained" size="large" startIcon={<AddIcon/>} disabled={!defaultAsset} onClick={()=>setQuick(true)}>Quick maintenance entry</Button></Stack>
  {loadError&&<Alert severity="error" sx={{mb:2}}>{loadError}</Alert>}
  <Alert severity="info" sx={{mb:3}}>RPAS records are CASA-aligned operational records. The operator and Maintenance Controller remain responsible for their approved procedures and regulatory compliance.</Alert>
  <Grid container spacing={2} mb={3}>{[
   ['Ready assets',assets.filter(a=>a.status==='serviceable').length,'success.main',<BuildCircleOutlinedIcon/>],['Unserviceable',unserviceable,'error.main',<EngineeringOutlinedIcon/>],['Awaiting release',awaiting,'warning.main',<FlightOutlinedIcon/>],['Schedules',schedules.length,'info.main',<LocalShippingOutlinedIcon/>]
  ].map(([label,value,colour,icon])=><Grid key={String(label)} size={{xs:6,md:3}}><Card sx={{height:'100%',borderTop:'4px solid',borderColor:colour as string}}><CardContent><Stack direction="row" justifyContent="space-between"><Box><Typography color="text.secondary" fontWeight={700}>{label as string}</Typography><Typography variant="h3" fontWeight={900}>{value as number}</Typography></Box>{icon as React.ReactNode}</Stack></CardContent></Card></Grid>)}</Grid>
  <Card sx={{mb:3}}><Tabs value={scope} onChange={(_,v)=>setScope(v)} variant="scrollable"><Tab value="all" label="All maintenance"/><Tab value="rpas" label="RPAS Compliance"/><Tab value="fleet" label="Vehicle & Support Fleet"/></Tabs></Card>
  <Grid container spacing={3}><Grid size={{xs:12,lg:5}}><Card><CardContent><Typography variant="h5" fontWeight={850} mb={2}>Action queue</Typography>{open.length===0?<Typography color="text.secondary">No maintenance actions waiting.</Typography>:<Stack spacing={1.5}>{open.map(r=>{const asset=assets.find(a=>a.id===r.assetId);return <Box key={r.id} onClick={()=>setSelected(r.assetId)} sx={{p:1.5,border:'1px solid',borderColor:'divider',borderRadius:2,cursor:'pointer','&:hover':{bgcolor:'action.hover'}}}><Stack direction="row" justifyContent="space-between" gap={1}><Box><Typography fontWeight={800}>{r.title}</Typography><Typography variant="body2" color="text.secondary">{asset?.name||'Unknown asset'} · {new Date(r.occurredAt).toLocaleDateString()}</Typography></Box><MaintenanceStatusChip status={r.status}/></Stack></Box>})}</Stack>}</CardContent></Card></Grid>
   <Grid size={{xs:12,lg:7}}><Card><CardContent><Stack direction="row" justifyContent="space-between" mb={2}><Typography variant="h5" fontWeight={850}>Asset readiness</Typography><Chip label={`${shown.length} assets`}/></Stack><Stack spacing={1}>{shown.map(a=><Box key={a.id} onClick={()=>setSelected(a.id)} sx={{display:'flex',justifyContent:'space-between',alignItems:'center',p:1.5,borderBottom:'1px solid',borderColor:'divider',cursor:'pointer'}}><Box><Typography fontWeight={800}>{a.name}</Typography><Typography variant="body2" color="text.secondary">{a.assetClass.replace('-',' ')} · {a.scope==='rpas'?'RPAS technical record':'Internal fleet record'}</Typography></Box><MaintenanceStatusChip status={a.status}/></Box>)}{shown.length===0&&<Typography color="text.secondary">No assets in this group yet.</Typography>}</Stack></CardContent></Card></Grid>
  </Grid>
  {selected&&<Box sx={{mt:3}}><MaintenanceAssetPanel assetId={selected}/></Box>}
  <MaintenanceRecordDialog open={quick} asset={defaultAsset} onClose={()=>setQuick(false)} onSubmit={submitRecord}/>
 </Box>;
}
