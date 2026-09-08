const{calculateDeltaT,assessSprayCondition,findBestSprayWindow,assessInversionPotential}=require('../../server/spray-weather');

test('calculates agricultural Delta T from wet bulb rather than dew point',()=>{
 expect(calculateDeltaT(30,40)).toBeCloseTo(9.6,1);
});

test('returns advisory spray conditions with plain reasons',()=>{
 expect(assessSprayCondition({deltaT:5,windSpeedKmh:12,windGustKmh:18,rainProbability:5})).toEqual(expect.objectContaining({status:'GO'}));
 expect(assessSprayCondition({deltaT:11,windSpeedKmh:12,windGustKmh:18,rainProbability:5})).toEqual(expect.objectContaining({status:'NO_GO',reasons:expect.arrayContaining([expect.stringMatching(/Delta T/i)])}));
});

test('chooses the strongest contiguous advisory spray window',()=>{
 const hours=[6,7,8,9].map((hour,index)=>({time:`2026-08-06T${String(hour).padStart(2,'0')}:00`,sprayCondition:{status:index<3?'GO':'POOR'}}));
 expect(findBestSprayWindow(hours)).toEqual({start:hours[0].time,end:hours[2].time,status:'GO'});
});

test('reports high medium and low inversion potential without claiming an observation',()=>{
 expect(assessInversionPotential({isDay:false,windSpeedKmh:3,cloudCoverPercent:5,humidityPercent:94,temperatureTrendC:-1})).toEqual(expect.objectContaining({rating:'high',score:2,label:'High',message:expect.stringMatching(/checked on site/i)}));
 expect(assessInversionPotential({isDay:false,windSpeedKmh:9,cloudCoverPercent:70,humidityPercent:60})).toEqual(expect.objectContaining({rating:'moderate',score:1,label:'Medium'}));
 expect(assessInversionPotential({isDay:true,windSpeedKmh:20,cloudCoverPercent:70,humidityPercent:60})).toEqual(expect.objectContaining({rating:'low',score:0,label:'Low'}));
 expect(assessInversionPotential({isDay:undefined,windSpeedKmh:20,cloudCoverPercent:70,humidityPercent:60})).toEqual(expect.objectContaining({rating:'unknown',score:null,label:'Unknown'}));
 expect(assessInversionPotential({isDay:false,windSpeedKmh:3,cloudCoverPercent:5,humidityPercent:94,temperatureTrendC:-1}).factors).toEqual(expect.arrayContaining(['Night-time','Light wind','Clear sky','High humidity','Cooling trend']));
});
