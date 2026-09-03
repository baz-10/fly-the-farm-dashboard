import React from 'react';
import { Box, Chip, Typography } from '@mui/material';
export function AssetContextBar({identity,kind,base,status}:{identity:string;kind:string;base?:string;status:string}){return <Box sx={{display:'flex',gap:1.5,alignItems:'center',flexWrap:'wrap',py:2,borderTop:'1px solid',borderBottom:'1px solid',borderColor:'divider'}}><Typography variant="h4" component="h1" sx={{mr:'auto'}}>{identity}</Typography><Chip label={kind}/><Chip label={base||'Base not assigned'} variant="outlined"/><Chip label={status}/></Box>}
