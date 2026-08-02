import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AircraftProvider, useAircraft } from '../AircraftContext';
import { Aircraft, EquipmentKit } from '../../types/aircraft';

const authoritative: Aircraft = {
  id: '44444444-4444-4444-8444-444444444444', operatingLocationId: '33333333-3333-4333-8333-333333333333',
  registration: 'VH-FTF1', manufacturer: 'DJI', model: 'Agras T100', serialNumber: 'T100-001', activationDate: '2026-08-02',
  status: 'operational', serviceabilityState: 'serviceable', missionReady: true, mtow: 149.9, maxAltitude: 120, maxWindSpeed: 28,
  maintenanceDates: { lastInspection: '2026-07-01', nextInspectionDue: '2026-10-01', lastMajorService: '2026-06-01', nextMajorServiceDue: '2026-12-01', totalFlightHours: 12.5, hoursSinceLastService: 2.5 },
  insurance: { policyNumber: 'FTF-001', provider: 'Aviation Cover', expiryDate: '2027-08-01', coverageAmount: 5000000, hullValue: 80000 },
  operationalLimits: { minOperatingTemp: -10, maxOperatingTemp: 45, maxPayloadWeight: 75, batteryCycles: 20, maxFlightTime: 18, serviceRange: 8, minimumCrewSize: 2 },
  documentation: { manuals: [], certificates: [], logbooks: [], complianceChecks: { casaCompliant: true, lastCasaInspection: '2026-07-01', nextCasaInspectionDue: '2027-07-01' } },
  assignedKits: [], notes: '', rowVersion: 1, createdAt: '2026-08-02T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z',
};
const authoritativeKit: EquipmentKit = {
  id:'55555555-5555-4555-8555-555555555555',operatingLocationId:'33333333-3333-4333-8333-333333333333',name:'T100 Kit',type:'spray-system',description:'Kit',
  specifications:{weight:10,dimensions:{length:1,width:1,height:1},powerRequirement:1,operatingVoltage:'48V',temperatureRange:{min:-10,max:45},weatherResistance:'IP54'},
  components:[],operationalData:{status:'available',totalOperatingHours:0,lastCalibrationDate:'',nextCalibrationDue:'',lastMaintenanceDate:'',nextMaintenanceDue:'',averageSetupTime:5,averagePackupTime:5},
  financialData:{purchasePrice:1,currentValue:1,depreciationRate:0,maintenanceCostPerHour:0,insuranceValue:1},compatibleAircraft:[authoritative.id],rowVersion:1,createdAt:'2026-08-02',updatedAt:'2026-08-02',
};

function Probe() {
  const value = useAircraft();
  return <div>
    <span data-testid="loading">{String(value.isLoading)}</span>
    <span data-testid="registrations">{value.aircraft.map((item) => item.registration).join(',')}</span>
    <span data-testid="kits">{value.equipmentKits.map((item) => item.name).join(',')}</span>
    <span data-testid="error">{value.error}</span>
    <button onClick={() => { void value.createAircraft(({ ...authoritative, id: undefined, createdAt: undefined, updatedAt: undefined, rowVersion: undefined } as unknown) as Omit<Aircraft, 'id' | 'createdAt' | 'updatedAt'>).catch(() => undefined); }}>create</button>
    <button onClick={() => { void value.createEquipmentKit(({ ...authoritativeKit, id: undefined, createdAt: undefined, updatedAt: undefined, rowVersion: undefined } as unknown) as Omit<EquipmentKit, 'id' | 'createdAt' | 'updatedAt'>).catch(() => undefined); }}>create kit</button>
  </div>;
}

describe('AircraftContext remote persistence', () => {
  const originalMode = process.env.REACT_APP_PERSISTENCE_MODE;
  const originalFetch = global.fetch;
  beforeEach(() => { process.env.REACT_APP_PERSISTENCE_MODE = 'remote'; localStorage.clear(); });
  afterEach(() => { process.env.REACT_APP_PERSISTENCE_MODE = originalMode; global.fetch = originalFetch; });

  test('loads and creates only confirmed Aircraft through /api/v1/aircraft', async () => {
    global.fetch = jest.fn(async (url:string,init?:RequestInit) => {
      if(String(url).includes('/equipment-kits')) return {ok:true,status:200,json:async()=>({data:[]})} as any;
      return !init?.method
        ? {ok:true,status:200,json:async()=>({data:[authoritative]})} as any
        : {ok:true,status:201,json:async()=>({data:{...authoritative,id:'55555555-5555-4555-8555-555555555555',registration:'VH-FTF2'}})} as any;
    }) as any;
    render(<AircraftProvider><Probe /></AircraftProvider>);
    await waitFor(() => expect(screen.getByTestId('registrations')).toHaveTextContent('VH-FTF1'));
    fireEvent.click(screen.getByRole('button', { name: 'create' }));
    await waitFor(() => expect(screen.getByTestId('registrations')).toHaveTextContent('VH-FTF1,VH-FTF2'));
    expect((global.fetch as jest.Mock).mock.calls.every(([url]) => String(url).startsWith('/api/v1/aircraft') || String(url).startsWith('/api/v1/equipment-kits'))).toBe(true);
    expect(localStorage.getItem('ftf_aircraft_data')).toBeNull();
  });

  test('keeps failed creates out of local state and shows the backend failure', async () => {
    global.fetch = jest.fn(async (url:string,init?:RequestInit) => {
      if(String(url).includes('/equipment-kits')) return {ok:true,status:200,json:async()=>({data:[]})} as any;
      return !init?.method
        ? {ok:true,status:200,json:async()=>({data:[]})} as any
        : {ok:false,status:409,json:async()=>({error:{code:'VERSION_CONFLICT',message:'Aircraft changed.',meta:{currentVersion:2}}})} as any;
    }) as any;
    render(<AircraftProvider><Probe /></AircraftProvider>);
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    fireEvent.click(screen.getByRole('button', { name: 'create' }));
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('Aircraft changed'));
    expect(screen.getByTestId('registrations')).toHaveTextContent(/^$/);
    expect(localStorage.length).toBe(0);
  });

  test('loads and creates only confirmed Equipment Kits through /api/v1/equipment-kits', async () => {
    global.fetch = jest.fn(async (url:string, init?:RequestInit) => {
      if(String(url).includes('/equipment-kits') && !init?.method) return {ok:true,status:200,json:async()=>({data:[authoritativeKit]})} as any;
      if(String(url).includes('/equipment-kits')) return {ok:true,status:201,json:async()=>({data:{...authoritativeKit,id:'66666666-6666-4666-8666-666666666666',name:'Second Kit'}})} as any;
      return {ok:true,status:200,json:async()=>({data:[authoritative]})} as any;
    }) as any;
    render(<AircraftProvider><Probe /></AircraftProvider>);
    await waitFor(()=>expect(screen.getByTestId('kits')).toHaveTextContent('T100 Kit'));
    fireEvent.click(screen.getByRole('button',{name:'create kit'}));
    await waitFor(()=>expect(screen.getByTestId('kits')).toHaveTextContent('T100 Kit,Second Kit'));
    expect(localStorage.getItem('ftf_aircraft_data')).toBeNull();
  });
});
