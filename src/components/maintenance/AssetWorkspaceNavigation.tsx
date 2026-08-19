import React from 'react';
import { Box, Button, Chip } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';

export const ASSET_WORKSPACE_SECTIONS=[['overview','Overview'],['maintenance','Maintenance'],['components','Components'],['parts-fluids','Parts & Fluids'],['defects','Defects'],['documents','Documents'],['history','History']] as const;
export function AssetWorkspaceNavigation({basePath}:{basePath:string}){const location=useLocation(),navigate=useNavigate();return <Box component="nav" aria-label="Asset workspace sections" sx={{display:'flex',gap:1,overflowX:'auto',pb:1}}>{ASSET_WORKSPACE_SECTIONS.map(([key,label])=>{const active=location.pathname===`${basePath}/${key}`||(key==='overview'&&location.pathname===basePath);return <Button key={key} aria-current={active?'page':undefined} onClick={()=>navigate(`${basePath}/${key}`)} sx={{whiteSpace:'nowrap',borderBottom:active?'3px solid':'3px solid transparent',borderRadius:0,color:'text.primary'}}>{label}{key!=='overview'&&key!=='components'&&<Chip label="Beta" size="small" sx={{ml:1}}/>}</Button>;})}</Box>}
