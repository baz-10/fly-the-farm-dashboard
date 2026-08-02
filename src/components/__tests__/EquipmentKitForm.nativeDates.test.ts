import { reconcileNativeEquipmentKitDates } from '../EquipmentKitForm';

test('uses native Equipment Kit date values when the browser has not emitted a React change event', () => {
  const form=document.createElement('form');
  const date=document.createElement('input'); date.name='lastCalibrationDate'; date.type='date'; date.value='2026-08-01'; form.appendChild(date);
  expect(reconcileNativeEquipmentKitDates(form,{lastCalibrationDate:''})).toEqual({lastCalibrationDate:'2026-08-01'});
});
