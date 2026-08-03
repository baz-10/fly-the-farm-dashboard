import{PersonnelRecord}from'./personnel';
export type DuplicateIdentitySignal='NAME'|'EMAIL'|'PHONE'|'LICENCE_NUMBER'|'ARN'|'EMPLOYEE_NUMBER';
export interface PersonnelIdentityCandidate{internalUserId:string;membershipId:string;displayName:string;roleCode:string;seatStatus:string;alreadyLinkedPersonnelId:string|null;duplicateIndicators:DuplicateIdentitySignal[];}
export interface PersonnelIdentityComparison{personnel:Pick<PersonnelRecord,'id'|'fullName'|'email'|'phone'|'internalUserId'|'membershipId'|'rowVersion'>;candidates:PersonnelIdentityCandidate[];}
