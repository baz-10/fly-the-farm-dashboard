import React from 'react';
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { MaintenanceAsset, MaintenanceRecordInput, MaintenanceRecordType } from '../../types/maintenance';

const labels:Record<MaintenanceRecordType,string>={defect:'defect',inspection:'inspection',maintenance:'maintenance entry','field-repair':'field repair','part-change':'part change',reading:'meter reading',firmware:'firmware update'};

export default function MaintenanceRecordDialog({open,asset,activity='defect',onClose,onSubmit}:{open:boolean;asset?:MaintenanceAsset;activity?:MaintenanceRecordType;onClose:()=>void;onSubmit:(input:MaintenanceRecordInput)=>Promise<unknown>}){
 const [type,setType]=React.useState<MaintenanceRecordType>(activity);const [description,setDescription]=React.useState('');const [notes,setNotes]=React.useState('');const [unsafe,setUnsafe]=React.useState(false);const [firmware,setFirmware]=React.useState('');const [previousFirmware,setPreviousFirmware]=React.useState('');const [reading,setReading]=React.useState('');const [error,setError]=React.useState('');const [saving,setSaving]=React.useState(false);
 React.useEffect(()=>setType(activity),[activity,open]);
 const submit=async()=>{if(!asset)return;setSaving(true);setError('');try{await onSubmit({assetId:asset.id,type,title:type==='defect'?(description.trim().slice(0,80)||'Reported defect'):`${asset.name} ${labels[type]}`,description:[description,notes].filter(Boolean).join('\n\n'),status:type==='defect'?'reported':type==='maintenance'||type==='field-repair'||type==='firmware'?'awaiting-release':'assessed',occurredAt:new Date().toISOString(),affectsServiceability:unsafe,resultingServiceability:unsafe?'unserviceable':'unchanged',attachments:[],firmwareVersion:firmware||undefined,previousFirmwareVersion:previousFirmware||undefined,readings:reading?{operatingHours:Number(reading)}:undefined});onClose();setDescription('');setNotes('');setUnsafe(false);}catch(e){setError(e instanceof Error?e.message:'Could not save this maintenance entry.');}finally{setSaving(false);}};
 return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"><DialogTitle>Record maintenance · {asset?.name}</DialogTitle><DialogContent><Stack spacing={2} sx={{pt:1}}>
  {error&&<Alert severity="error">{error}</Alert>}
  <TextField select label="Activity" value={type} onChange={e=>setType(e.target.value as MaintenanceRecordType)}>{Object.entries(labels).map(([value,label])=><MenuItem key={value} value={value}>{label.replace(/\b\w/g,c=>c.toUpperCase())}</MenuItem>)}</TextField>
  <Typography variant="caption" color="text.secondary">Time and operator are captured automatically. Entries remain in the asset history.</Typography>
  <TextField required multiline minRows={3} label={type==='defect'?'What happened?':'Work performed / inspection result'} value={description} onChange={e=>setDescription(e.target.value)}/>
  {type==='firmware'&&<Stack direction={{xs:'column',sm:'row'}} spacing={2}><TextField fullWidth label="Previous version" value={previousFirmware} onChange={e=>setPreviousFirmware(e.target.value)}/><TextField fullWidth label="New version" value={firmware} onChange={e=>setFirmware(e.target.value)}/></Stack>}
  {type==='reading'&&<TextField type="number" label="Current operating hours" value={reading} onChange={e=>setReading(e.target.value)}/>} 
  <TextField multiline minRows={2} label="Notes" value={notes} onChange={e=>setNotes(e.target.value)}/>
  <FormControlLabel control={<Checkbox checked={unsafe} onChange={e=>setUnsafe(e.target.checked)}/>} label="This affects safe operation"/>
  {unsafe&&<Alert severity="warning">This asset will be marked unserviceable immediately and cannot be assigned until released.</Alert>}
 </Stack></DialogContent><DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" disabled={saving||!asset||!description.trim()} onClick={submit}>{saving?'Saving…':`Submit ${labels[type]}`}</Button></DialogActions></Dialog>;
}
