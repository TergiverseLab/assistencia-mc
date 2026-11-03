// ===== 3b. LOLI (Casal de la Dona): lo que hay que entregarle, mes a mes =====
// Desde septiembre de 2026: 15 % de las cuotas de cada mes + 20 € por cada alta del Casal cobrada ese mes.
// Se cuenta POR MES DE CUOTA (decisión de Mario, 3/11/2026): los 400 € de Oskia cuentan 40 € cada mes.
// "Entregado" se guarda en Config como loli:AAAA-MM = {data, importe}; el puente lo apunta en el Historial.
const LOLI_DESDE="2026-09", LOLI_PCT=0.15;
const r2 = x => Math.round(x*100)/100;
const eur = x => (Math.round(x*100)/100).toLocaleString("es-ES",{minimumFractionDigits:0,maximumFractionDigits:2})+" €";
function loliDe(mes){
  const rows=(data.pagos[mes]||{rows:{}}).rows||{}; const cuotas=Object.values(rows).reduce((a,r)=>a+(Number(r.amount)||0),0);
  const altas=Object.values(data.persons).filter(p=>p.socia&&p.socia.casal&&String(p.socia.casal.date||"").slice(0,7)===mes);
  const parte=r2(cuotas*LOLI_PCT), altasEur=altas.reduce((a,p)=>a+(Number(p.socia.casal.amount)||0),0);
  const ent=data.settings&&data.settings["loli:"+mes];
  return {mes, cuotas, parte, altas, altasEur, total:r2(parte+altasEur), tuyo:r2(cuotas-parte), entregado: ent||null};
}
function mesesLoli(hasta){ const ms=new Set(Object.keys(data.pagos)); Object.values(data.persons).forEach(p=>{ if(p.socia&&p.socia.casal&&p.socia.casal.date) ms.add(String(p.socia.casal.date).slice(0,7)); });
  return [...ms].filter(m=>m>=LOLI_DESDE && m<=hasta).sort(); }
function renderLoli(){
  const box=$("p-loli"); if(!box) return;
  const hoyD=todayISO(), hoy=hoyD.slice(0,7);
  if(curMonth<LOLI_DESDE){ box.innerHTML=`<h2>Loli · Casal de la Dona</h2><p class="note">${curMonth>"2026-06"?"Julio y agosto: sin taller.":"En la T1 (febrero–junio 2026) eran 30 € fijos al mes."}</p>`; return; }
  // Plazo del Casal: lo de cada mes se paga en su oficina del 1 al 10 de ESE mes.
  const limite=m=>m+"-10", tarde=m=>hoyD>limite(m), diaLim=m=>`10 de ${MESES[+m.slice(5,7)-1]}`;
  const yaEnt=x=>Number(x.entregado&&x.entregado.importe)||0, falta=x=>r2(Math.max(0,x.total-yaEnt(x)));
  const v=loliDe(curMonth);
  const pend=mesesLoli(hoy).map(loliDe).filter(x=>falta(x)>0);
  const totalPend=r2(pend.reduce((a,x)=>a+falta(x),0)), algunoTarde=pend.some(x=>tarde(x.mes));
  // Última entrega (todos los meses marcados el mismo día): se puede deshacer por si se marcó sin haber pagado
  const ents=Object.entries(data.settings||{}).filter(([k,v])=>/^loli:\d{4}-\d{2}$/.test(k)&&v&&v.data);
  const sello=v=>v.ts||v.data;   /* cada entrega lleva su hora: dos entregas del mismo día no se mezclan */
  const ultSello=ents.map(([k,v])=>sello(v)).sort().pop();
  const ultE=ultSello?ents.filter(([k,v])=>sello(v)===ultSello):[]; const ultData=ultE.length?ultE[0][1].data:null;
  const ult=ultData?{data:ultData, meses:ultE.map(([k])=>k.slice(5)).sort(), total:r2(ultE.reduce((a,[k,v])=>a+(Number(v.importe)||0)-(Number(v.antes&&v.antes.importe)||0),0)), ents:ultE}:null;
  const estadoMes = falta(v)===0&&v.entregado ? `${CANDADO}<b>Entregado</b>${v.entregado.data?" el "+esc(fmt(v.entregado.data)):""}`
                  : v.total===0 ? "" : tarde(curMonth) ? `<b class="tarde">Fuera de plazo</b>: se tenía que entregar antes del ${diaLim(curMonth)}.` : `Se entrega en el Casal antes del <b>${diaLim(curMonth)}</b>.`;
  box.innerHTML=`<h2>Loli · Casal de la Dona</h2>
    <div class="loli-mes">
      <div class="lm-row"><span>Cuotas de ${esc(monthName(curMonth))}</span><b>${eur(v.cuotas)}</b></div>
      <div class="lm-row"><span>15 % para Loli</span><b>${eur(v.parte)}</b></div>
      ${v.altas.length?`<div class="lm-row"><span>Altas del Casal (${v.altas.map(p=>esc(p.name)).join(", ")})</span><b>${eur(v.altasEur)}</b></div>`:""}
      <div class="lm-row lm-tot"><span>Para Loli este mes</span><b>${eur(v.total)}</b></div>
      <div class="lm-row lm-tuyo"><span>Tuyo</span><b>${eur(v.tuyo)}</b></div>
      ${estadoMes?`<p class="lm-estado">${estadoMes}</p>`:""}
    </div>
    <div class="loli-pend ${totalPend?"":"cero"}">
      <div class="lp-tit">Pendiente de entregar a Loli</div>
      <div class="lp-num">${eur(totalPend)}</div>
      <div class="lp-det">${pend.length?pend.map(x=>`${esc(monthName(x.mes))}: ${eur(falta(x))}${yaEnt(x)?" (lo que faltaba)":""} · ${tarde(x.mes)?'<b class="tarde">fuera de plazo</b>':"antes del "+diaLim(x.mes)}`).join("<br>"):"Nada pendiente."}</div>
      ${totalPend?`<button class="btn small" id="lp-entregar" type="button">Entregado a Loli: ${eur(totalPend)}</button>`:""}
    </div>
    ${ult?`<div class="loli-ult" id="lp-ult"><span>Última entrega: <b>${eur(ult.total)}</b> el ${esc(fmt(ult.data))} (${ult.meses.map(m=>esc(monthName(m))).join(" y ")})</span><button class="btn small" id="lp-deshacer" type="button">Deshacer</button></div>`:""}`;
  const u=$("lp-deshacer"); if(u) u.addEventListener("click",()=>{
    confirmar($("lp-ult"), `¿Deshacer la entrega de ${eur(ult.total)} del ${fmt(ult.data)}? Volverá a salir como pendiente.`, "Sí, deshacer", async()=>{
      const set={}; ult.ents.forEach(([k,v])=>{ set[k]=v.antes||null; });   // vuelve a como estaba antes de esa entrega
      const op={action:"settings", key:"c:loli", data:set}; aplicarOp(data,op); renderLoli(); updPendientes();
      try{ await store.send(op); }catch(e){ setStatus("p-status","La hoja ha rechazado el cambio: "+e.message,"err"); refresh(); }
      renderLoli(); updPendientes();
    }, true);
  });
  const b=$("lp-entregar"); if(b) b.addEventListener("click",()=>{
    confirmar(b, `¿Has entregado ${eur(totalPend)} a Loli? Quedará apuntado como entregado (${pend.map(x=>monthName(x.mes)).join(", ")}), con fecha de hoy.`, "Sí, entregado", async()=>{
      const set={}; pend.forEach(x=>{ const e=x.entregado; set["loli:"+x.mes]={data:hoyD, ts:new Date().toISOString(), importe:x.total, ...(e&&e.importe?{antes:e}:{})}; });
      const op={action:"settings", key:"c:loli", data:set}; aplicarOp(data,op); renderLoli(); updPendientes();
      try{ await store.send(op); }catch(e){ setStatus("p-status","La hoja ha rechazado el cambio: "+e.message,"err"); refresh(); }
      renderLoli(); updPendientes();
    });
  });
}
