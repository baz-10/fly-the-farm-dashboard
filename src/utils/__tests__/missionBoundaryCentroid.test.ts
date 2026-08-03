import { calculateMissionBoundaryCentroid } from '../missionBoundaryCentroid';

test('calculates the polygon area centroid rather than averaging vertices',()=>{
  expect(calculateMissionBoundaryCentroid({type:'Polygon',coordinates:[[[0,0],[4,0],[0,2],[0,0]]]})).toEqual({longitude:1.333333,latitude:0.666667});
});

test('rejects an unclosed or degenerate boundary',()=>{
  expect(calculateMissionBoundaryCentroid({type:'Polygon',coordinates:[[[0,0],[4,0],[0,2]]]})).toBeNull();
  expect(calculateMissionBoundaryCentroid({type:'Polygon',coordinates:[[[0,0],[1,1],[2,2],[0,0]]]})).toBeNull();
});
