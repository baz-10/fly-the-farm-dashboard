type AcceptanceEnvironment={NODE_ENV?:string;REACT_APP_FINANCIAL_ACTUALS_ACCEPTANCE?:string};

export function financialActualsAcceptanceEnabled(environment:AcceptanceEnvironment=process.env):boolean{
  return environment.NODE_ENV==='development'&&environment.REACT_APP_FINANCIAL_ACTUALS_ACCEPTANCE==='enabled';
}
