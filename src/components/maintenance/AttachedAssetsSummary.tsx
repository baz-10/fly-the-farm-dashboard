import React from 'react';
import { Card, CardContent, Typography, Button, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
export interface AttachedAssetSummary {id:string;source:'aircraft'|'equipment-kit'|'fleet-asset';identity:string;position:string;}
export function AttachedAssetsSummary({assets=[]}:{assets?:AttachedAssetSummary[]}){const navigate=useNavigate();return <Card variant="outlined"><CardContent><Typography variant="h6">Attached assets</Typography>{assets.length===0?<Typography color="text.secondary" sx={{mt:1}}>No maintainable assets are currently attached.</Typography>:<Stack sx={{mt:1}}>{assets.map(a=><Button key={a.id} onClick={()=>navigate(`/assets/${a.source}/${a.id}/overview`)} sx={{justifyContent:'space-between'}}><span>{a.identity}</span><span>{a.position}</span></Button>)}</Stack>}</CardContent></Card>}
