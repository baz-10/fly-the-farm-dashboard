import { financialActualsAcceptanceEnabled } from '../financialActualsAcceptance';

test('permits the exact acceptance flag only in development',()=>{
  expect(financialActualsAcceptanceEnabled({NODE_ENV:'development',REACT_APP_FINANCIAL_ACTUALS_ACCEPTANCE:'enabled'})).toBe(true);
  expect(financialActualsAcceptanceEnabled({NODE_ENV:'production',REACT_APP_FINANCIAL_ACTUALS_ACCEPTANCE:'enabled'})).toBe(false);
  expect(financialActualsAcceptanceEnabled({NODE_ENV:'test',REACT_APP_FINANCIAL_ACTUALS_ACCEPTANCE:'enabled'})).toBe(false);
  expect(financialActualsAcceptanceEnabled({NODE_ENV:'development',REACT_APP_FINANCIAL_ACTUALS_ACCEPTANCE:'true'})).toBe(false);
});
