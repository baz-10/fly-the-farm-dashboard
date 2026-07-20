import React from 'react';
import { Alert, Box, Button, Card, CardContent, Divider, Stack, Typography } from '@mui/material';
import BuildIcon from '@mui/icons-material/Build';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import { useMaintenance } from '../../contexts/MaintenanceContext';
import { MaintenanceRecordType } from '../../types/maintenance';
import MaintenanceRecordDialog from './MaintenanceRecordDialog';
import MaintenanceStatusChip from './MaintenanceStatusChip';
import { downloadRpasTechnicalLogCsv } from '../../utils/maintenanceExport';
import { useAuth } from '../../contexts/AuthContext';

export default function MaintenanceAssetPanel({assetId}:{assetId:string}){
 const maintenance=useMaintenance();const {assets,records,schedules,submitRecord,transitionRecord}=maintenance;const {user}=useAuth();const asset=assets.find(a=>a.id===assetId);const [activity,setActivity]=React.useState<MaintenanceRecordType>();
 if(!asset)return <Alert severity="info">Maintenance profile is being prepared for this asset.</Alert>;
 const history=records.filter(r=>r.assetId===assetId).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt));const due=schedules.filter(s=>s.assetId===assetId);const blockingRecord=history.find(r=>r.affectsServiceability&&!['serviceable','deferred'].includes(r.status));
 return <Card variant="outlined"><CardContent><Stack spacing={2}>
  <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}><Box><Typography variant="h6">{asset.name}</Typography><Typography color="text.secondary" variant="body2">{asset.scope==='rpas'?'CASA-aligned RPAS technical log':'Internal fleet-maintenance record'}</Typography></Box><MaintenanceStatusChip status={asset.status}/></Stack>
  {asset.status==='unserviceable'&&<Alert severity="error">Unserviceable — resolve the blocking defect and complete authorised release before use.</Alert>}
  <Stack direction="row" gap={1} flexWrap="wrap"><Button startIcon={<ReportProblemOutlinedIcon/>} variant="outlined" color="error" onClick={()=>setActivity('defect')}>Report defect</Button><Button startIcon={<BuildIcon/>} variant="contained" onClick={()=>setActivity('maintenance')}>Record work</Button><Button onClick={()=>setActivity('inspection')}>Inspection</Button><Button onClick={()=>setActivity('reading')}>Update meter</Button><Button onClick={()=>setActivity('firmware')}>Firmware</Button>{asset.scope==='rpas'&&<Button onClick={()=>downloadRpasTechnicalLogCsv(asset.id,maintenance)}>Export technical log</Button>}{user?.role==='admin'&&blockingRecord&&<Button color="success" variant="contained" onClick={()=>transitionRecord(blockingRecord.id,'serviceable',{certifiedBy:user.id,certifiedByName:user.name,authority:'maintenance-controller',certifiedAt:new Date().toISOString(),statement:'Inspected and certified serviceable for return to operation.'})}>Authorised release</Button>}</Stack>
  <Divider/><Typography fontWeight={800}>Due work ({due.length})</Typography>{due.length===0&&<Typography color="text.secondary">No maintenance schedules recorded.</Typography>}
  <Typography fontWeight={800}>History</Typography>{history.length===0?<Typography color="text.secondary">No maintenance entries yet.</Typography>:history.slice(0,8).map(r=><Box key={r.id} sx={{borderLeft:'3px solid',borderColor:r.affectsServiceability?'error.main':'divider',pl:1.5}}><Stack direction="row" justifyContent="space-between"><Typography fontWeight={750}>{r.title}</Typography><MaintenanceStatusChip status={r.status}/></Stack><Typography variant="body2" color="text.secondary">{new Date(r.occurredAt).toLocaleString()} · {r.createdByName}</Typography>{r.description&&<Typography variant="body2" sx={{mt:.5,whiteSpace:'pre-wrap'}}>{r.description}</Typography>}</Box>)}
 </Stack></CardContent><MaintenanceRecordDialog open={Boolean(activity)} asset={asset} activity={activity} onClose={()=>setActivity(undefined)} onSubmit={submitRecord}/></Card>;
}
