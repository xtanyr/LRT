import { useEffect, useState } from 'react';
import { api } from './api';
export function useRatingThresholds() {
 const [thresholds,setThresholds]=useState({green:80,red:60});
 useEffect(()=>{let active=true;api.get('/admin/rating-color-config').then(r=>{const c=r.data.data||r.data;if(!c||c.greenThreshold==null||c.redThreshold==null)return;const green=Number(c.greenThreshold),red=Number(c.redThreshold);if(active&&Number.isFinite(green)&&Number.isFinite(red)&&red>=0&&green<=100&&red<green)setThresholds({green,red});}).catch(()=>{});return()=>{active=false;};},[]);
 return thresholds;
}
export function useRatingColors() {
 const thresholds=useRatingThresholds();
 return (score:number|null|undefined) => score==null?'var(--ink-2)':score>=thresholds.green?'var(--success)':score<=thresholds.red?'var(--danger)':'var(--warning)';
}
