import { selectRollingTwoHourly } from '../weatherOutlook';

test('returns two-hour points covering the next 24 hours from the current forecast bucket',()=>{
  const start=Date.parse('2026-09-08T09:00:00Z');
  const points=Array.from({length:40},(_,index)=>({time:new Date(start+index*3600000).toISOString()}));
  const result=selectRollingTwoHourly(points,'2026-09-08T09:00:00.000Z');
  expect(result).toHaveLength(13);
  expect(result[0].time).toBe('2026-09-08T09:00:00.000Z');
  expect(result[1].time).toBe('2026-09-08T11:00:00.000Z');
  expect(result[12].time).toBe('2026-09-09T09:00:00.000Z');
});

test('does not include midnight hours before the current forecast time',()=>{
  const points=['2026-09-08T00:00:00Z','2026-09-08T08:00:00Z','2026-09-08T10:00:00Z'].map(time=>({time}));
  expect(selectRollingTwoHourly(points,'2026-09-08T08:00:00Z').map(point=>point.time)).toEqual(['2026-09-08T08:00:00Z','2026-09-08T10:00:00Z']);
});
