import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import DeliveryTest from './DeliveryTest';
const DeliveryView=import.meta.env.VITE_LOCAL_TEST==='true'&&new URLSearchParams(location.search).get('view')==='delivery';
import './index.css';

(window as any).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};
const origError = console.error;
console.error = (...args: unknown[]) => {
  origError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {DeliveryView?<DeliveryTest/>:<><App/>{import.meta.env.VITE_LOCAL_TEST==='true'&&<a style={{position:'fixed',left:16,bottom:16,zIndex:9999,background:'#e6edda',color:'#173b32',padding:'12px 18px',borderRadius:8,fontSize:12,fontWeight:700}} href='?view=delivery'>Water delivery test →</a>}</>}
  </StrictMode>,
);
