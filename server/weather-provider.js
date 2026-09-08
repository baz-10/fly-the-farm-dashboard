async function fetchOpenMeteoPlanningForecast({latitude,longitude,validFrom,validTo,fetchImpl=global.fetch}){
  const start=new Date(validFrom),end=new Date(validTo);if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw new Error('Invalid forecast window.');
  // Open-Meteo returns hourly timestamps in the requested coordinate timezone.
  // Pad the UTC request dates so an Australian morning (the previous UTC date)
  // cannot omit the Mission's local operating day from the provider response.
  const startDate=new Date(start.getTime()-24*60*60*1000).toISOString().slice(0,10),endDate=new Date(end.getTime()+24*60*60*1000).toISOString().slice(0,10);
  const query=new URLSearchParams({latitude:String(latitude),longitude:String(longitude),start_date:startDate,end_date:endDate,timezone:'auto',hourly:'temperature_2m,relative_humidity_2m,dew_point_2m,precipitation_probability,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m'});
  const response=await fetchImpl(`https://api.open-meteo.com/v1/forecast?${query.toString()}`,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`Open-Meteo forecast failed (${response.status}).`);
  const snapshot=await response.json();if(!snapshot?.hourly?.time)throw new Error('Open-Meteo returned no hourly forecast.');
  return{provider:'OPEN_METEO',providerModel:'best_match',issuedAt:new Date().toISOString(),validFrom:start.toISOString(),validTo:end.toISOString(),latitude:Number(snapshot.latitude??latitude),longitude:Number(snapshot.longitude??longitude),snapshot,transformationMetadata:{requestedLatitude:latitude,requestedLongitude:longitude,requestedAt:new Date().toISOString(),attribution:'Weather data by Open-Meteo.com (CC BY 4.0)'}};
}
async function fetchOpenMeteoHistoricalWeather({latitude,longitude,intervalStart,intervalEnd,fetchImpl=global.fetch,now=()=>new Date()}){
  const start=new Date(intervalStart),end=new Date(intervalEnd),hourMs=60*60*1000;
  if(!Number.isFinite(Number(latitude))||Number(latitude)<-90||Number(latitude)>90||!Number.isFinite(Number(longitude))||Number(longitude)<-180||Number(longitude)>180||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end-start>1000*hourMs)throw new Error('Invalid historical weather interval.');
  const lastIncluded=new Date(end.getTime()-1),query=new URLSearchParams({latitude:String(latitude),longitude:String(longitude),start_date:start.toISOString().slice(0,10),end_date:lastIncluded.toISOString().slice(0,10),timezone:'GMT',hourly:'temperature_2m,relative_humidity_2m,dew_point_2m,wind_speed_10m,wind_direction_10m,precipitation'});
  const response=await fetchImpl(`https://archive-api.open-meteo.com/v1/archive?${query.toString()}`,{headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error(`Open-Meteo historical weather failed (${response.status}).`);
  const snapshot=await response.json(),hourly=snapshot?.hourly||{},times=Array.isArray(hourly.time)?hourly.time:[];
  if(!['GMT','UTC'].includes(snapshot?.timezone)||snapshot?.utc_offset_seconds!==0){
    throw new Error('Open-Meteo historical timestamps must use an explicit UTC/GMT zero offset.');
  }
  if(typeof snapshot?.latitude!=='number'||typeof snapshot?.longitude!=='number'){
    throw new Error('Open-Meteo returned invalid historical coordinates.');
  }
  const responseLatitude=snapshot.latitude,responseLongitude=snapshot.longitude;
  if(!Number.isFinite(responseLatitude)||responseLatitude < -90||responseLatitude > 90
    ||!Number.isFinite(responseLongitude)||responseLongitude < -180||responseLongitude > 180){
    throw new Error('Open-Meteo returned invalid historical coordinates.');
  }
  const arrays=['temperature_2m','relative_humidity_2m','dew_point_2m','wind_speed_10m','wind_direction_10m','precipitation'];
  if(!arrays.every((key)=>Array.isArray(hourly[key])&&hourly[key].length===times.length)){
    throw new Error('Open-Meteo must return aligned finite hourly observations.');
  }
  const ranges={temperature_2m:[-100,100],relative_humidity_2m:[0,100],dew_point_2m:[-150,100],wind_speed_10m:[0,500],wind_direction_10m:[0,359.999999],precipitation:[0,10000]};
  if(!arrays.every((key)=>hourly[key].every((value)=>Number.isFinite(value)&&value>=ranges[key][0]&&value<=ranges[key][1]))){
    throw new Error('Open-Meteo must return aligned finite hourly observations.');
  }
  let previous=-Infinity;
  const allObservations=times.map((value,index)=>{
    const timestamp=String(value);
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:00(?::00(?:\.0{1,3})?)?(?:Z|\+00:00)?$/.test(timestamp)){
      throw new Error('Open-Meteo historical timestamps must be unambiguous UTC hourly buckets.');
    }
    const parsed=new Date(/[zZ]|\+00:00$/.test(timestamp)?timestamp:`${timestamp}Z`),at=parsed.getTime();
    if(!Number.isFinite(at)||at%hourMs!==0||at<=previous){
      throw new Error('Open-Meteo historical timestamps must be unique ordered UTC hourly buckets.');
    }
    previous=at;
    return{observedAt:parsed.toISOString(),temperatureC:hourly.temperature_2m[index],relativeHumidity:hourly.relative_humidity_2m[index],dewPointC:hourly.dew_point_2m[index],windSpeedKmh:hourly.wind_speed_10m[index],windDirectionDegrees:hourly.wind_direction_10m[index],precipitationMm:hourly.precipitation[index]};
  });
  const observations=allObservations.filter(item=>{const value=Date.parse(item.observedAt);return value>=Math.ceil(start.getTime()/hourMs)*hourMs&&value<end.getTime();});
  if(!observations.length)throw new Error('Open-Meteo returned no historical observations for the operating interval.');
  const present=new Set(observations.map(item=>item.observedAt)),coverageGaps=[];
  for(let value=Math.ceil(start.getTime()/hourMs)*hourMs;value<end.getTime();value+=hourMs){const observedAt=new Date(value).toISOString();if(!present.has(observedAt))coverageGaps.push({observedAt,reason:'PROVIDER_HOUR_MISSING'});}
  return{source:'OPEN_METEO',providerIdentifier:'OPEN_METEO_ARCHIVE_V1',providerRetrievedAt:now().toISOString(),hourlyObservations:observations,inversionInputs:{method:'OPEN_METEO_HOURLY_PROXY_V1',inputsAvailable:false,temperatureAndWindHours:observations.length},inversionResults:{assessment:'UNABLE_TO_DETERMINE',reason:'Open-Meteo hourly surface observations do not provide an authoritative vertical temperature profile.'},coverageGaps,manualReason:null,sourceMetadata:{requestedLatitude:Number(latitude),requestedLongitude:Number(longitude),requestedIntervalStart:start.toISOString(),requestedIntervalEnd:end.toISOString(),responseLatitude,responseLongitude,providerTimezone:snapshot.timezone,utcOffsetSeconds:snapshot.utc_offset_seconds,attribution:'Weather data by Open-Meteo.com (CC BY 4.0)'}};
}
const AU_STATE_ABBREVIATIONS={
  'Australian Capital Territory':'ACT','New South Wales':'NSW','Northern Territory':'NT',
  Queensland:'QLD','South Australia':'SA',Tasmania:'TAS',Victoria:'VIC','Western Australia':'WA',
};
async function geocodeOpenMeteoLocation(address,fetchImpl=global.fetch){if(!address?.trim())return null;const query=new URLSearchParams({name:address,count:'1',language:'en',format:'json',countryCode:'AU'}),response=await fetchImpl(`https://geocoding-api.open-meteo.com/v1/search?${query}`,{headers:{Accept:'application/json'}});if(!response.ok)return null;const data=await response.json(),result=data?.results?.[0];if(!result)return null;const locality=String(result.name||''),state=AU_STATE_ABBREVIATIONS[result.admin1]||String(result.admin1||''),postcode=String(result.postcode||result.postcodes?.[0]||''),label=[locality,state].filter(Boolean).join(', ')+(postcode?` ${postcode}`:'');return{latitude:Number(result.latitude),longitude:Number(result.longitude),resolvedLocation:{label:label||'Australian location',locality,state,postcode}};}
function normaliseAustralianPlace(address={}){
  const locality=address.suburb||address.town||address.city||address.village||address.hamlet||address.locality||address.municipality||address.region||address.state_district||address.county||address.isolated_dwelling||address.farm||address.road||'';
  const state=AU_STATE_ABBREVIATIONS[address.state]||address['ISO3166-2-lvl4']?.replace('AU-','')||address.state||'';
  const postcode=address.postcode||'';
  const label=[locality,state].filter(Boolean).join(', ')+(postcode?` ${postcode}`:'');
  return{label:label||'Australian location',locality,state,postcode};
}
function deriveAustralianPlaceFromAddress(value){
  const address=String(value||'').trim(),match=address.match(/(?:^|,)\s*([^,]+?)\s+(ACT|NSW|NT|QLD|SA|TAS|VIC|WA)\s+(\d{4})\s*$/i);
  if(!match)return null;const locality=match[1].trim(),state=match[2].toUpperCase(),postcode=match[3];return{label:`${locality}, ${state} ${postcode}`,locality,state,postcode};
}
function mergeAustralianPlace(primary={},fallback={}){const locality=primary.locality||fallback.locality||'',state=primary.state||fallback.state||'',postcode=primary.postcode||fallback.postcode||'',label=[locality,state].filter(Boolean).join(', ')+(postcode?` ${postcode}`:'');return{...fallback,...primary,label:label||primary.label||fallback.label||'Australian location',locality,state,postcode};}
async function searchAustralianWeatherLocations(search,fetchImpl=global.fetch){
  const value=String(search||'').trim();if(value.length<3)return[];
  const query=new URLSearchParams({q:value,format:'jsonv2',addressdetails:'1',countrycodes:'au',limit:'5'});
  const response=await fetchImpl(`https://nominatim.openstreetmap.org/search?${query}`,{headers:{Accept:'application/json','User-Agent':'SprayCommand/1.0 (+https://spray-command-production-beta.vercel.app)'}});
  if(!response.ok)throw new Error(`Location search failed (${response.status}).`);
  const results=await response.json();return(results||[]).map(item=>({...normaliseAustralianPlace(item.address),latitude:Number(item.lat),longitude:Number(item.lon),displayName:item.display_name})).filter(item=>Number.isFinite(item.latitude)&&Number.isFinite(item.longitude));
}
async function reverseGeocodeAustralianLocation({latitude,longitude},fetchImpl=global.fetch){
  const query=new URLSearchParams({lat:String(latitude),lon:String(longitude),format:'jsonv2',addressdetails:'1'});
  const response=await fetchImpl(`https://nominatim.openstreetmap.org/reverse?${query}`,{headers:{Accept:'application/json','User-Agent':'SprayCommand/1.0 (+https://spray-command-production-beta.vercel.app)'}});
  if(!response.ok)return null;const data=await response.json();return{...normaliseAustralianPlace(data?.address),latitude:Number(latitude),longitude:Number(longitude)};
}
function timezoneOffsetSeconds(timezone,instant){
  try{
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(instant).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
    return Math.round((Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second))-instant.getTime())/1000);
  }catch{return null;}
}
function assertOperationsForecast(snapshot,retrievedAt){
  if(typeof snapshot.timezone!=='string'||!snapshot.timezone.trim()||typeof snapshot.utc_offset_seconds!=='number'||!Number.isFinite(snapshot.utc_offset_seconds)||Math.abs(snapshot.utc_offset_seconds)>50400)throw new Error('Open-Meteo operations forecast UTC offset is invalid.');
  if(timezoneOffsetSeconds(snapshot.timezone,retrievedAt)!==snapshot.utc_offset_seconds)throw new Error('Open-Meteo operations forecast timezone and UTC offset disagree.');
  const hourly=snapshot.hourly||{},times=hourly.time;
  const fields={temperature_2m:[-100,100],relative_humidity_2m:[0,100],precipitation_probability:[0,100],precipitation:[0,10000],wind_speed_10m:[0,500],wind_gusts_10m:[0,500],wind_direction_10m:[0,360]};
  if(!Array.isArray(times)||times.length<25||!Object.entries(fields).every(([key,range])=>Array.isArray(hourly[key])&&hourly[key].length===times.length&&hourly[key].every(value=>Number.isFinite(value)&&value>=range[0]&&value<=range[1])))throw new Error('Open-Meteo operations forecast must return aligned finite hourly values.');
  for(const key of ['cloud_cover','is_day'])if(hourly[key]!==undefined&&(!Array.isArray(hourly[key])||hourly[key].length!==times.length))throw new Error('Open-Meteo operations forecast must return aligned finite hourly values.');
  let previous='';
  for(const time of times){if(typeof time!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(time)||time<=previous)throw new Error('Open-Meteo operations forecast timestamps must be unique ordered local hourly buckets.');previous=time;}
  const current=snapshot.current||{},currentFields={temperature_2m:[-100,100],apparent_temperature:[-150,100],relative_humidity_2m:[0,100],wind_speed_10m:[0,500],wind_gusts_10m:[0,500],wind_direction_10m:[0,360]};
  if(typeof current.time!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(current.time)||!Object.entries(currentFields).every(([key,range])=>Number.isFinite(current[key])&&current[key]>=range[0]&&current[key]<=range[1]))throw new Error('Open-Meteo operations forecast current conditions are invalid.');
  const providerNow=Date.parse(`${current.time}Z`),expectedNow=retrievedAt.getTime()+snapshot.utc_offset_seconds*1000;
  if(!Number.isFinite(providerNow)||providerNow<expectedNow-2*3600000||providerNow>expectedNow+15*60000)throw new Error('Open-Meteo operations forecast current conditions are stale.');
}
async function fetchOpenMeteoOperationsForecast({latitude,longitude,fetchImpl=global.fetch,now=()=>new Date()}){
  const{calculateDeltaT,assessSprayCondition,findBestSprayWindow,assessInversionPotential}=require('./spray-weather');
  const query=new URLSearchParams({latitude:String(latitude),longitude:String(longitude),timezone:'auto',forecast_days:'7',current:'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,rain,is_day',hourly:'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,cloud_cover,is_day,wind_speed_10m,wind_gusts_10m,wind_direction_10m',daily:'temperature_2m_min,temperature_2m_max,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max'});
  const response=await fetchImpl(`https://api.open-meteo.com/v1/forecast?${query}`,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`Open-Meteo operations forecast failed (${response.status}).`);
  const d=await response.json(),retrievedAt=now();assertOperationsForecast(d,retrievedAt);
  const localNow=new Date(Math.ceil((retrievedAt.getTime()+d.utc_offset_seconds*1000)/3600000)*3600000).toISOString().slice(0,13)+':00';
  const compass=deg=>['N','NE','E','SE','S','SW','W','NW'][Math.round(Number(deg||0)/45)%8],allHourly=(d.hourly?.time||[]).map((time,i)=>{const deltaT=calculateDeltaT(d.hourly.temperature_2m[i],d.hourly.relative_humidity_2m[i]),trend=i?d.hourly.temperature_2m[i]-d.hourly.temperature_2m[i-1]:0,isDay=d.hourly.is_day?.[i],inversionPotential=assessInversionPotential({isDay:isDay===0?false:isDay===1?true:undefined,windSpeedKmh:d.hourly.wind_speed_10m[i],cloudCoverPercent:d.hourly.cloud_cover?.[i],humidityPercent:d.hourly.relative_humidity_2m[i],temperatureTrendC:trend});return{time,temperatureC:d.hourly.temperature_2m[i],humidityPercent:d.hourly.relative_humidity_2m[i],windSpeedKmh:d.hourly.wind_speed_10m[i],windGustKmh:d.hourly.wind_gusts_10m[i],windDirection:compass(d.hourly.wind_direction_10m[i]),isDay:isDay===1,rainProbability:d.hourly.precipitation_probability[i],rainAmountMm:d.hourly.precipitation[i],deltaTC:deltaT,inversionPotential,sprayCondition:assessSprayCondition({deltaT,windSpeedKmh:d.hourly.wind_speed_10m[i],windGustKmh:d.hourly.wind_gusts_10m[i],rainProbability:d.hourly.precipitation_probability[i]})};}),matchedIndex=allHourly.findIndex(item=>item.time>=localNow),startIndex=matchedIndex<0?allHourly.length:matchedIndex,hourly=allHourly.slice(startIndex,startIndex+25),currentDelta=calculateDeltaT(d.current.temperature_2m,d.current.relative_humidity_2m),daily=(d.daily?.time||[]).map((date,i)=>({date,minTemperatureC:d.daily.temperature_2m_min[i],maxTemperatureC:d.daily.temperature_2m_max[i],rainProbability:d.daily.precipitation_probability_max[i],rainAmountMm:d.daily.precipitation_sum[i],windSpeedKmh:d.daily.wind_speed_10m_max[i],windGustKmh:d.daily.wind_gusts_10m_max[i]})),currentInversion=hourly[0]?.inversionPotential;
  if(hourly.length<25)throw new Error('Open-Meteo operations forecast does not cover the next 24 hours.');
  return{provider:'Open-Meteo',retrievedAt:retrievedAt.toISOString(),timezone:d.timezone,latitude:Number(d.latitude??latitude),longitude:Number(d.longitude??longitude),current:{time:d.current.time,temperatureC:d.current.temperature_2m,apparentTemperatureC:d.current.apparent_temperature,humidityPercent:d.current.relative_humidity_2m,windSpeedKmh:d.current.wind_speed_10m,windGustKmh:d.current.wind_gusts_10m,windDirection:compass(d.current.wind_direction_10m),isDay:d.current.is_day===1,rainAmountMm:Number(d.current.precipitation||d.current.rain||0),rainProbability:hourly[0]?.rainProbability??0,deltaTC:currentDelta,inversionPotential:currentInversion,condition:'Current conditions',minTemperatureC:daily[0]?.minTemperatureC,maxTemperatureC:daily[0]?.maxTemperatureC,sprayCondition:assessSprayCondition({deltaT:currentDelta,windSpeedKmh:d.current.wind_speed_10m,windGustKmh:d.current.wind_gusts_10m,rainProbability:hourly[0]?.rainProbability??0})},hourly,daily,bestSprayWindow:findBestSprayWindow(hourly)};
}
module.exports={fetchOpenMeteoPlanningForecast,fetchOpenMeteoHistoricalWeather,fetchOpenMeteoOperationsForecast,geocodeOpenMeteoLocation,searchAustralianWeatherLocations,reverseGeocodeAustralianLocation,deriveAustralianPlaceFromAddress,mergeAustralianPlace};
