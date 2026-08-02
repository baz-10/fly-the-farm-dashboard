import { MissionMapFeature, MissionMapFeatureType } from '../types/missionMap';

export const MISSION_MAP_FEATURE_DEFINITIONS: Record<MissionMapFeatureType,{label:string;color:string;geometry:'Point'|'LineString'|'Polygon'}> = {
  building:{label:'Buildings',color:'#7b5e3b',geometry:'Polygon'}, obstacle:{label:'Obstacles',color:'#c62828',geometry:'Point'},
  'point-of-interest':{label:'Points of interest',color:'#6a1b9a',geometry:'Point'}, 'primary-landing-zone':{label:'Primary landing zone',color:'#00897b',geometry:'Point'},
  'secondary-landing-zone':{label:'Secondary landing zone',color:'#1565c0',geometry:'Point'}, signage:{label:'Signage',color:'#ef6c00',geometry:'Point'},
  'exclusion-zone':{label:'Exclusion zones',color:'#d32f2f',geometry:'Polygon'}, 'restricted-area':{label:'No-fly / restricted areas',color:'#7f0000',geometry:'Polygon'},
  'access-point':{label:'Access points',color:'#2e7d32',geometry:'Point'}, 'access-route':{label:'Access routes',color:'#388e3c',geometry:'LineString'},
  'staging-area':{label:'Staging areas',color:'#5d4037',geometry:'Polygon'}, 'launch-point':{label:'Launch points',color:'#00695c',geometry:'Point'},
  'landing-point':{label:'Landing points',color:'#0277bd',geometry:'Point'}, 'water-point':{label:'Water points',color:'#0097a7',geometry:'Point'},
  'point-annotation':{label:'Point annotations',color:'#8e24aa',geometry:'Point'}, 'line-annotation':{label:'Line annotations',color:'#6a1b9a',geometry:'LineString'},
  'polygon-annotation':{label:'Polygon annotations',color:'#ab47bc',geometry:'Polygon'}, 'imported-source-geometry':{label:'Imported source geometry',color:'#455a64',geometry:'Polygon'},
  'railway-corridor':{label:'Railway corridors',color:'#37474f',geometry:'LineString'},
};

export function createMissionMapFeatureAt(type:MissionMapFeatureType,lat:number,lng:number,id:string):MissionMapFeature {
  const definition=MISSION_MAP_FEATURE_DEFINITIONS[type]; const delta=0.00008;
  const geometry = definition.geometry==='Point' ? {type:'Point' as const,coordinates:[lng,lat] as [number,number]}
    : definition.geometry==='LineString' ? {type:'LineString' as const,coordinates:[[lng-delta,lat],[lng+delta,lat]] as Array<[number,number]>}
      : {type:'Polygon' as const,coordinates:[[[lng-delta,lat-delta],[lng+delta,lat-delta],[lng+delta,lat+delta],[lng-delta,lat+delta],[lng-delta,lat-delta]]] as Array<Array<[number,number]>>};
  return {id,type,label:definition.label,geometry};
}

const AUTHORITATIVE_ROLE_BY_TYPE: Record<MissionMapFeatureType,string> = {
  building:'obstacle',obstacle:'obstacle','point-of-interest':'point_annotation','primary-landing-zone':'launch_point','secondary-landing-zone':'landing_point',signage:'point_annotation',
  'exclusion-zone':'exclusion_zone','restricted-area':'no_fly_zone','access-point':'access_point','access-route':'access_route','staging-area':'staging_area',
  'launch-point':'launch_point','landing-point':'landing_point','water-point':'water_point','point-annotation':'point_annotation','line-annotation':'line_annotation',
  'polygon-annotation':'polygon_annotation','imported-source-geometry':'imported_source_geometry','railway-corridor':'corridor',
};
const UI_TYPE_BY_AUTHORITATIVE_ROLE: Record<string,MissionMapFeatureType> = {
  obstacle:'obstacle',exclusion_zone:'exclusion-zone',no_fly_zone:'restricted-area',access_point:'access-point',access_route:'access-route',staging_area:'staging-area',
  launch_point:'launch-point',landing_point:'landing-point',water_point:'water-point',point_annotation:'point-annotation',line_annotation:'line-annotation',
  polygon_annotation:'polygon-annotation',imported_source_geometry:'imported-source-geometry',corridor:'railway-corridor',regulatory_overlay:'restricted-area',safety_overlay:'polygon-annotation',
};
export const missionMapFeatureRole=(type:MissionMapFeatureType)=>AUTHORITATIVE_ROLE_BY_TYPE[type];
export const missionMapFeatureTypeForRole=(role:string)=>UI_TYPE_BY_AUTHORITATIVE_ROLE[role]||'point-annotation';
