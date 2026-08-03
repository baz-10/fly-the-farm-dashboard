async function fetchOpenMeteoPlanningForecast({latitude,longitude,validFrom,validTo,fetchImpl=global.fetch}){
  const start=new Date(validFrom),end=new Date(validTo);if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw new Error('Invalid forecast window.');
  const startDate=start.toISOString().slice(0,10),endDate=end.toISOString().slice(0,10);
  const query=new URLSearchParams({latitude:String(latitude),longitude:String(longitude),start_date:startDate,end_date:endDate,timezone:'auto',hourly:'temperature_2m,relative_humidity_2m,dew_point_2m,precipitation_probability,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m'});
  const response=await fetchImpl(`https://api.open-meteo.com/v1/forecast?${query.toString()}`,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`Open-Meteo forecast failed (${response.status}).`);
  const snapshot=await response.json();if(!snapshot?.hourly?.time)throw new Error('Open-Meteo returned no hourly forecast.');
  return{provider:'OPEN_METEO',providerModel:'best_match',issuedAt:new Date().toISOString(),validFrom:start.toISOString(),validTo:end.toISOString(),latitude:Number(snapshot.latitude??latitude),longitude:Number(snapshot.longitude??longitude),snapshot,transformationMetadata:{requestedLatitude:latitude,requestedLongitude:longitude,requestedAt:new Date().toISOString(),attribution:'Weather data by Open-Meteo.com (CC BY 4.0)'}};
}
module.exports={fetchOpenMeteoPlanningForecast};
