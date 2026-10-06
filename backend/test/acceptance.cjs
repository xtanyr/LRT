const assert = require('node:assert/strict');
const base = `${process.env.LRT_BASE_URL || 'http://localhost:8080'}/api`;
const email = process.env.UAT_LEADER_EMAIL || 'anna.lebedeva.test@skuratovcoffee.ru';
const password = process.env.UAT_PASSWORD;
if (process.env.UAT_MUTATING_SMOKE !== 'true') throw new Error('Set UAT_MUTATING_SMOKE=true: this test creates and submits a report');
if (!password) throw new Error('UAT_PASSWORD is required');
async function request(path, token, method='GET', body) {
  const response = await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();
  return {status:response.status,data:data?.data === undefined ? data : data.data};
}
(async()=>{
 const login=await request('/auth/login',null,'POST',{email,password});
 assert.equal(login.status,200);
 const token=login.data.accessToken;assert.ok(token);
 const shops=await request('/coffee-shops',token);assert.equal(shops.status,200);assert.equal(shops.data.length,1);
 const shop=shops.data[0];
 assert.equal((await request('/coffee-shops/2',token)).status,403);
 assert.equal((await request('/comments/coffee-shop/2',token)).status,403);
 const now=new Date(Date.now()+10800000);const date=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1));
 const period={coffeeShopId:shop.id,year:date.getUTCFullYear(),month:date.getUTCMonth()+1};
 assert.equal((await request('/reports/draft',token,'POST',{...period,revenue:'123abc'})).status,400);
 const metrics=(await request('/metrics',token)).data;
 const ratios=new Set(['LABOR_COST','DESSERT_WRITEOFF','PRODUCT_WRITEOFF','FREE_ACCESS','DEPOSIT']);
 const metricValues=metrics.map(m=>({metricId:m.id,absoluteValue:ratios.has(m.code)?0:m.code==='PERFORMANCE'?12:Number(m.thresholdStrong)}));
 const draft=await request('/reports/draft',token,'POST',{...period,revenue:'100000,25',drinksCount:14000,metricValues,formData:{gifts:0,giftsPlan:100,giftsLink:'https://example.org'},analyses:[]});
 assert.equal(draft.status,201,JSON.stringify(draft.data));assert.equal(draft.data.score.rating,100);
 const id=draft.data.id;
 const submitted=await request('/reports/'+id+'/submit',token,'POST',{});
 assert.equal(submitted.status,201,JSON.stringify(submitted.data));assert.equal(submitted.data.status,'SUBMITTED');
 const edited=await request('/reports/'+id+'/analysis/summary_problems',token,'PATCH',{content:'Тестовая запись после отправки'});
 assert.equal(edited.status,200,JSON.stringify(edited.data));assert.equal(edited.data.status,'SUBMITTED');
 const dashboard=await request('/dashboard/leader',token);assert.equal(dashboard.status,200);assert.ok(dashboard.data.reports.some(r=>r.id===id&&r.score.rating===100));
 assert.equal((await request('/reports/draft',token,'POST',{...period,year:2020,month:1,revenue:100})).status,403);
 for(const path of ['/reports/'+id+'/edit-logs','/reports/edit-logs','/admin/config-logs']) assert.equal((await request(path,token)).status,403);
 console.log('Acceptance passed: login, scope, strict numbers, 100-point draft, optional analysis, submit, post-submit edit, dashboard, history lock, admin-only audit access.');
})().catch(e=>{console.error(e);process.exitCode=1;});
