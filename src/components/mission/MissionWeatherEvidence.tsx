import React from 'react';
import { Alert, Button, Chip, Divider, Grid, LinearProgress, Stack, TextField, Typography } from '@mui/material';
import { createMissionWeatherEvidenceApi } from '../../services/missionWeatherEvidenceApi';
import { createPersonnelApi } from '../../services/personnelApi';
import { PersonnelRecord } from '../../types/personnel';

type WeatherRecord=Record<string,any>;
type Readiness={ready:boolean;blockers?:Array<{code:string;message:string}>;warnings?:Array<{code:string;message:string}>};
type WeatherApi={read:(missionId:string)=>Promise<any>;readiness:(missionId:string)=>Promise<Readiness>;createManual:(missionId:string,input:Record<string,unknown>)=>Promise<WeatherRecord>;select:(missionId:string,observationId:string,expectedVersion:number)=>Promise<WeatherRecord>};
type PersonnelApi={list:(operatingLocationId?:string)=>Promise<PersonnelRecord[]>};
const defaultWeatherApi=createMissionWeatherEvidenceApi();
const defaultPersonnelApi=createPersonnelApi();

const localDateTime=()=>{const now=new Date(Date.now()-new Date().getTimezoneOffset()*60000);return now.toISOString().slice(0,16);};
const value=(record:WeatherRecord,...keys:string[])=>keys.map((key)=>record?.[key]).find((item)=>item!==undefined&&item!==null);

export default function MissionWeatherEvidence({missionId,operatingLocationId,weatherApi=defaultWeatherApi,personnelApi=defaultPersonnelApi}:{missionId:string;operatingLocationId:string;weatherApi?:WeatherApi;personnelApi?:PersonnelApi}){
  const [observers,setObservers]=React.useState<PersonnelRecord[]>([]),[records,setRecords]=React.useState<WeatherRecord[]>([]),[readiness,setReadiness]=React.useState<Readiness>({ready:false}),[selectionVersion,setSelectionVersion]=React.useState(0);
  const [loading,setLoading]=React.useState(true),[saving,setSaving]=React.useState(false),[error,setError]=React.useState('');
  const [form,setForm]=React.useState<Record<string,string>>({observerPersonnelId:'',observedAt:localDateTime(),observationLocation:'',latitude:'',longitude:'',temperatureC:'',relativeHumidityPct:'',windSpeedKmh:'',windDirectionDegrees:'',cloudDescription:'',precipitationMm:'0',additionalNotes:'',manualReason:'',inversionAssessment:'NOT_ASSESSED'});
  const update=(key:string)=>(event:React.ChangeEvent<HTMLInputElement>)=>setForm((current)=>({...current,[key]:event.target.value}));
  const load=React.useCallback(async()=>{setLoading(true);setError('');try{const [weather,assessment,people]=await Promise.all([weatherApi.read(missionId),weatherApi.readiness(missionId),personnelApi.list(operatingLocationId)]);const history=Array.isArray(weather)?weather:(weather?.observations||weather?.records||[]);setRecords(history);setSelectionVersion(history.reduce((maximum:number,record:WeatherRecord)=>Math.max(maximum,Number(value(record,'selection_version','selectionVersion')||0)),Number(weather?.selection_version??weather?.selectionVersion??0)));setReadiness(assessment||{ready:false});setObservers(people.filter((person)=>person.isActive&&person.operatingLocationIds.includes(operatingLocationId)));}catch(caught){setError(caught instanceof Error?caught.message:'Mission Weather could not be loaded.');}finally{setLoading(false);}},[missionId,operatingLocationId,personnelApi,weatherApi]);
  React.useEffect(()=>{void load();},[load]);
  const save=async()=>{setSaving(true);setError('');try{const expectedVersion=records.reduce((maximum,record)=>Math.max(maximum,Number(value(record,'version_number','versionNumber')||0)),0);const observation=await weatherApi.createManual(missionId,{observerPersonnelId:form.observerPersonnelId,expectedVersion,observedAt:new Date(form.observedAt).toISOString(),observationLocation:form.observationLocation,latitude:Number(form.latitude),longitude:Number(form.longitude),temperatureC:Number(form.temperatureC),relativeHumidity:Number(form.relativeHumidityPct),windSpeedKmh:Number(form.windSpeedKmh),windDirectionDegrees:Number(form.windDirectionDegrees),cloudDescription:form.cloudDescription,precipitationMm:Number(form.precipitationMm||0),manualReason:form.manualReason,inversionAssessment:form.inversionAssessment,notes:form.additionalNotes});await weatherApi.select(missionId,String(value(observation,'id')),selectionVersion);setRecords((current)=>[{...observation,selected:true,selection_version:selectionVersion+1},...current.map((record)=>({...record,selected:false}))]);setSelectionVersion((current)=>current+1);setReadiness(await weatherApi.readiness(missionId));}catch(caught){setError(caught instanceof Error?caught.message:'Manual Weather could not be saved.');}finally{setSaving(false);}};
  return <Stack spacing={2}>
    {loading&&<LinearProgress/>}{error&&<Alert severity="error">{error} No browser-stored Weather has been substituted.</Alert>}
    <Alert severity={readiness.ready?'success':(readiness.blockers?.length?'warning':'info')}>{readiness.ready?'Mission Weather evidence is ready.':'Mission Weather is not ready.'}</Alert>
    {(readiness.blockers||[]).map((item)=><Alert key={item.code} severity="error">{item.message}</Alert>)}
    {(readiness.warnings||[]).map((item)=><Alert key={item.code} severity="warning">{item.message}</Alert>)}
    <Grid container spacing={1.5}>
      <Grid size={{xs:12,md:6}}><TextField select required fullWidth label="Weather observer" value={form.observerPersonnelId} onChange={update('observerPersonnelId')} SelectProps={{native:true}}><option value="">Select authoritative Personnel</option>{observers.map((observer)=><option key={observer.id} value={observer.id}>{observer.fullName}</option>)}</TextField></Grid>
      <Grid size={{xs:12,md:6}}><TextField required fullWidth type="datetime-local" label="Observation time" inputProps={{'aria-label':'Observation time'}} InputLabelProps={{shrink:true}} value={form.observedAt} onChange={update('observedAt')}/></Grid>
      <Grid size={{xs:12,md:6}}><TextField required fullWidth label="Observation location" inputProps={{'aria-label':'Observation location'}} value={form.observationLocation} onChange={update('observationLocation')}/></Grid>
      <Grid size={{xs:6,md:3}}><TextField required fullWidth type="number" label="Latitude" inputProps={{'aria-label':'Latitude'}} value={form.latitude} onChange={update('latitude')}/></Grid>
      <Grid size={{xs:6,md:3}}><TextField required fullWidth type="number" label="Longitude" inputProps={{'aria-label':'Longitude'}} value={form.longitude} onChange={update('longitude')}/></Grid>
      <Grid size={{xs:6,md:3}}><TextField required fullWidth type="number" label="Temperature (°C)" inputProps={{'aria-label':'Temperature (°C)'}} value={form.temperatureC} onChange={update('temperatureC')}/></Grid>
      <Grid size={{xs:6,md:3}}><TextField required fullWidth type="number" label="Relative humidity (%)" inputProps={{'aria-label':'Relative humidity (%)'}} value={form.relativeHumidityPct} onChange={update('relativeHumidityPct')}/></Grid>
      <Grid size={{xs:6,md:3}}><TextField required fullWidth type="number" label="Wind speed (km/h)" inputProps={{'aria-label':'Wind speed (km/h)'}} value={form.windSpeedKmh} onChange={update('windSpeedKmh')}/></Grid>
      <Grid size={{xs:6,md:3}}><TextField required fullWidth type="number" label="Wind direction (degrees)" inputProps={{'aria-label':'Wind direction (degrees)'}} value={form.windDirectionDegrees} onChange={update('windDirectionDegrees')}/></Grid>
      <Grid size={{xs:12,md:6}}><TextField select required fullWidth label="Inversion assessment" value={form.inversionAssessment} onChange={update('inversionAssessment')} SelectProps={{native:true}}><option value="NOT_ASSESSED">Not assessed</option><option value="UNLIKELY">Unlikely</option><option value="POSSIBLE">Possible</option><option value="LIKELY">Likely</option><option value="CONFIRMED">Confirmed</option><option value="UNABLE_TO_DETERMINE">Unable to determine</option></TextField></Grid>
      <Grid size={{xs:12,md:6}}><TextField fullWidth label="Cloud description" value={form.cloudDescription} onChange={update('cloudDescription')}/></Grid>
      <Grid size={{xs:12,md:6}}><TextField fullWidth type="number" label="Rain or precipitation (mm)" value={form.precipitationMm} onChange={update('precipitationMm')}/></Grid>
      <Grid size={{xs:12}}><TextField required fullWidth multiline minRows={2} label="Reason for manual entry" inputProps={{'aria-label':'Reason for manual entry'}} value={form.manualReason} onChange={update('manualReason')}/></Grid>
      <Grid size={{xs:12}}><TextField fullWidth multiline minRows={2} label="Additional notes" value={form.additionalNotes} onChange={update('additionalNotes')}/></Grid>
    </Grid>
    <Button variant="contained" disabled={saving||loading} onClick={()=>void save()}>{saving?'Saving authoritative Weather…':'Save Manual Weather'}</Button>
    {records.length>0&&<><Divider/><Typography variant="subtitle2" fontWeight={800}>Authoritative observation history</Typography>{records.map((record,index)=><Stack key={String(value(record,'id')||index)} direction={{xs:'column',sm:'row'}} spacing={1} alignItems={{sm:'center'}}><Chip size="small" color={index===0?'success':'default'} label={`Version ${value(record,'version_number','versionNumber')||'—'}`}/><Typography variant="body2">{value(record,'source')||'MANUAL'} · Delta T {value(record,'delta_t_c','deltaTC')??'—'} °C · {value(record,'freshness_state','freshnessState')||'Freshness evaluated on retrieval'}</Typography></Stack>)}</>}
  </Stack>;
}
