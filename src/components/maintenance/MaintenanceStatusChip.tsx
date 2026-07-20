import React from 'react';
import { Chip } from '@mui/material';

const colours: Record<string,'success'|'error'|'warning'|'info'|'default'>={serviceable:'success',current:'success',unserviceable:'error',overdue:'error',maintenance:'warning','due-soon':'warning',due:'warning','awaiting-release':'info',reported:'error'};

export default function MaintenanceStatusChip({status}:{status:string}) {
 return <Chip size="small" color={colours[status]||'default'} label={status.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}/>;
}
