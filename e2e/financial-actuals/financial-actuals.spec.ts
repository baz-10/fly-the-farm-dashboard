import { expect, test } from '@playwright/test';
const user='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222',base='33333333-3333-4333-8333-333333333333',actual='44444444-4444-4444-8444-444444444444';
test('renders only the development-gated authoritative Financial list responsively',async({page})=>{
  await page.route('**/api/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:[],pagination:{page:1,pageSize:100,total:0}})}));
  await page.route('**/api/v1/financial-actuals*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{schemaVersion:'FINANCIAL_ACTUAL_LIST_V1',rows:[{id:actual,reference:'FA-000001',operatingLocation:{id:base,label:'Fly The Farm Base'},client:{id:user,label:'Controlled Client'},job:{id:org,label:'JOB-001'},mission:null,lifecycle:'FINAL',activeDraft:null,currentFinalRevisionNumber:1,finalCalculation:{revenue:'300.0000',totalCost:'1.0000',grossProfit:'299.0000',grossMarginPercentage:'99.6667'},sourceDrift:'UNCHANGED',archived:false}],nextCursor:null}})}));
  await page.route('**/api/v1/session',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{user:{id:user},organisation:{id:org,name:'Fly The Farm'},roles:['organisation_admin'],permissions:['financial_actuals.read'],operatingLocationIds:[base]}})}));
  await page.route('**/api/auth',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:{id:user,email:'founder@example.test',name:'Founder',role:'admin',identityPlane:'organisation',entitlements:[]}})}));
  await page.goto('/financials');
  await expect(page.getByRole('heading',{name:'Financial Actuals'})).toBeVisible();
  await expect(page.getByText('FA-000001')).toBeVisible();
  await expect(page.getByText('$299.00')).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow-x','scroll');
});
