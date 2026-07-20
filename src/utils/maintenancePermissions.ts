import { MaintenanceActor } from '../types/maintenance';
export const canReleaseRpas=(actor:MaintenanceActor)=>actor.maintenanceAuthority==='maintenance-controller'||actor.maintenanceAuthority==='authorised-maintainer';
export const canViewMaintenanceFinancials=(actor:MaintenanceActor)=>actor.role==='admin';
export const canSubmitMaintenance=(actor:MaintenanceActor)=>actor.role==='admin'||actor.role==='contractor';
