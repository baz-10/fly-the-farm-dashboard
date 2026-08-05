const{calculateDeltaT,assessSprayCondition,findBestSprayWindow}=require('../../server/spray-weather');

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
