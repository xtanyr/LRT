import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
export default function NotificationBanner() {
 const [items,setItems]=useState<{id:number;message:string;isRead:boolean;ipvStatusId?:number}[]>([]);
 useEffect(()=>{
  let alive=true,requestId=0;
  const refresh=()=>{const id=++requestId;return api.get('/notifications').then(r=>{if(alive&&id===requestId)setItems(r.data.data||r.data||[]);}).catch(()=>{});};
  void refresh();const interval=window.setInterval(refresh,60000);
  window.addEventListener('ipv-updated',refresh);
  window.addEventListener('focus',refresh);
  return()=>{alive=false;window.clearInterval(interval);window.removeEventListener('ipv-updated',refresh);window.removeEventListener('focus',refresh);};
 },[]);
 const active=items.filter(i=>!i.isRead&&i.ipvStatusId);
 if(!active.length)return null;
 return <div className="card" role="status">{active.map(i=><p key={i.id}>🔔 {i.message}</p>)}<Link to="/triggers">Перейти к ИПВ</Link></div>;
}
