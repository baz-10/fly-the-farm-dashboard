export type GeoJsonPolygon={type:string;coordinates:unknown};
export function calculateMissionBoundaryCentroid(geometry:GeoJsonPolygon):{longitude:number;latitude:number}|null{
  if(geometry?.type!=='Polygon'||!Array.isArray(geometry.coordinates))return null;
  const ring=(geometry.coordinates as unknown[])[0];if(!Array.isArray(ring)||ring.length<4)return null;
  const points=ring as unknown[];const first=points[0],last=points[points.length-1];
  if(!Array.isArray(first)||!Array.isArray(last)||Number(first[0])!==Number(last[0])||Number(first[1])!==Number(last[1]))return null;
  let twiceArea=0,xSum=0,ySum=0;
  for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1];if(!Array.isArray(a)||!Array.isArray(b))return null;const x1=Number(a[0]),y1=Number(a[1]),x2=Number(b[0]),y2=Number(b[1]);if(![x1,y1,x2,y2].every(Number.isFinite)||x1< -180||x1>180||x2< -180||x2>180||y1< -90||y1>90||y2< -90||y2>90)return null;const cross=x1*y2-x2*y1;twiceArea+=cross;xSum+=(x1+x2)*cross;ySum+=(y1+y2)*cross;}
  if(Math.abs(twiceArea)<1e-12)return null;
  return{longitude:Number((xSum/(3*twiceArea)).toFixed(6)),latitude:Number((ySum/(3*twiceArea)).toFixed(6))};
}
