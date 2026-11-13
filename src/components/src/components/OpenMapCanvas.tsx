import React, {useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
export const OpenMapCanvas = (props:any) => {
 const [warning,setWarning]=useState('');
 useEffect(()=>{const receive=(e:any)=>setWarning(e.detail);window.addEventListener('open-route-warning',receive);return()=>window.removeEventListener('open-route-warning',receive);},[]);
 const root=useRef<HTMLDivElement>(null), map=useRef<L.Map|null>(null), layer=useRef<L.LayerGroup|null>(null);
 useEffect(()=>{if(!root.current)return; const m=L.map(root.current).setView([props.cityCenter.lat,props.cityCenter.lng],11);map.current=m;
 L.tileLayer(import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',maxZoom:18,keepBuffer:0}).addTo(m);layer.current=L.layerGroup().addTo(m);
 const ro=new ResizeObserver(()=>m.invalidateSize());ro.observe(root.current);return()=>{ro.disconnect();m.remove();map.current=null;};},[]);
 useEffect(()=>{const g=layer.current,m=map.current;if(!g||!m)return;g.clearLayers();const points:L.LatLngExpression[]=[];
 for(const s of props.stops||[]){if(!Number.isFinite(s.location?.lat)||!Number.isFinite(s.location?.lng))continue;const pos:L.LatLngExpression=[s.location.lat,s.location.lng];points.push(pos);const marker=L.circleMarker(pos,{radius:s.id==='depot'?10:7,color:s.id==='depot'?'#ef4444':'#2563eb',fillOpacity:.9}).addTo(g);const label=document.createElement('span');label.textContent=s.name;marker.bindTooltip(label);marker.on('click',()=>props.onSelectStop(s));}
 const legs=(props.vehicleRoutes||[]).flatMap((v:any)=>(v.legs||[]).map((l:any)=>({...l,roadVerified:v.roadVerified})));for(const l of props.hasOptimized?(legs.length?legs:props.legs||[]):[]){const coords=(l.pathCoordinates||[]).map((x:any)=>[x.lat,x.lng]);if(coords.length>1)L.polyline(coords,{color:l.color||'#2563eb',weight:4,dashArray:l.roadVerified===false?'8 8':undefined}).addTo(g);}
 if(points.length>1)m.fitBounds(L.latLngBounds(points),{padding:[35,35],maxZoom:14});
 },[props.stops,props.legs,props.vehicleRoutes,props.fitBoundsKey]);
 return <div className="relative w-full h-full min-h-[220px] isolate z-0"><div ref={root} className="absolute inset-0"/><div style={{position:'absolute',top:10,left:50,zIndex:450,background:'white',color:'#172033',padding:'8px 12px',borderRadius:8,fontSize:12,maxWidth:'75%'}}>Open maps / OSRM road routes, no traffic. {warning || 'If routing fails, estimates are not road directions.'}</div></div>;
};
