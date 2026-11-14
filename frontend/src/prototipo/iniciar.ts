/* eslint-disable -- código del prototipo portado tal cual; se limpia al pasarlo a componentes */
// @ts-nocheck
/*
 * Lógica del prototipo (docs/prototipo, versión 2), portada tal cual.
 *
 * Por qué así: el prototipo ya resuelve el mapa, el dibujo del lote, las
 * capas de NASA (HLS/GIBS, terrarium, POWER) y la hoja de comparación.
 * Primero lo llevamos a Next.js sin reescribirlo, para tener la app andando;
 * después cada tarea reemplaza una parte por componentes React y por los
 * datos de /analizar (por ejemplo, strategies/ev/sc pasan al backend).
 *
 * Trabaja sobre el HTML que dibujan los componentes de src/components
 * (mismos ids y clases que el prototipo). No cambiar esos ids sin cambiar acá. *
 * Mapa de secciones (buscá el comentario "---------- X ----------") y qué
 * tarea las va a reemplazar:
 *   Cultivos y reglas ........ C, WIN, OBJ. Igual que backend/app/motor/cultivos.py.
 *   Mapa ..................... Leaflet + Esri (maxNativeZoom 17, maxZoom 18). Tarea 2 de la persona 4.
 *   Dibujar el lote .......... drawUI, addVertex, finishDraw. Tarea 2 (RF1).
 *   NDVI ..................... HLS (Planetary Computer) y GIBS MODIS. Tarea 8 (RF17); el número lo da Back 2.
 *   Pendiente ................ terrarium de AWS + plano ajustado (solve3). Tarea 8 (RF16); el número lo da Back 2.
 *   Clima .................... NASA POWER mensual y terciles. Lo reemplaza /analizar (Back 1). Tarea 5.
 *   Capas, línea de tiempo ... setLayer, legend, timeline. Tarea 8 (RF18).
 *   Formulario ............... goMap y el paso 1 -> 2. Tareas 3 y 4 (RF2, RF4, RF5).
 *   Estrategias .............. strategies, ev, sc: PUNTAJES ILUSTRATIVOS. Los reemplaza
 *                              /analizar con backend/app/motor (PR #4). Solo sc()
 *                              queda en el front, en lib/cercania.ts (persona 5, RF13).
 *   Render, Compartir ........ hoja de comparación, mail y PDF. Persona 5.
 */

const IMG = { intro: "/img/intro.jpg", nubes: "/img/nubes.jpg" };
let iniciado = false;

export function iniciarPrototipo(L) {
  if (iniciado) return; // React en modo estricto monta dos veces en desarrollo
  iniciado = true;


const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const css=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const fmt=(n,d=0)=>Number(n).toLocaleString("es-AR",{minimumFractionDigits:d,maximumFractionDigits:d});
const sgn=n=>(n>0?"+":n<0?"−":"")+fmt(Math.abs(n));
const MES=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const M1=["E","F","M","A","M","J","J","A","S","O","N","D"];
const MK=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const DAYS=[31,28,31,30,31,30,31,31,30,31,30,31];

/* ---------- Lote de la demo (trazado sobre imagen real) ---------- */
const DEMO=[[-33.2436,-64.2381],[-33.2436,-64.2268],[-33.2517,-64.2268],[-33.2517,-64.2381]];
const CITY=[-33.1307,-64.3499];

/* ---------- Cultivos y reglas (prototipo) ---------- */
const C={
  soja:{n:"Soja",g:"verano",fr:false,cons:.9,nfix:5,rast:5,com:true},
  soja2:{n:"Soja 2ª",g:"verano",fr:false,cons:.8,nfix:5,rast:5,com:true},
  maiz:{n:"Maíz",g:"verano",fr:false,cons:1,nfix:0,rast:25,com:true},
  girasol:{n:"Girasol",g:"verano",fr:false,cons:.7,nfix:0,rast:5,com:true},
  sorgo:{n:"Sorgo",g:"verano",fr:false,cons:.65,nfix:0,rast:30,com:true},
  mani:{n:"Maní",g:"verano",fr:false,cons:.8,nfix:5,rast:0,com:true},
  trigo:{n:"Trigo",g:"invierno",fr:true,cons:.6,nfix:0,rast:20,com:true},
  cebada:{n:"Cebada",g:"invierno",fr:true,cons:.5,nfix:0,rast:15,com:true},
  vicia:{n:"Vicia",g:"cobertura",fr:true,cons:.55,nfix:30,rast:15,com:false},
  centeno:{n:"Centeno",g:"cobertura",fr:true,cons:.6,nfix:0,rast:30,com:false},
  barbecho:{n:"Barbecho",g:"barbecho",fr:true,cons:.15,nfix:0,rast:0,com:false}
};
const WIN={soja:[10,11,0,1,2,3],soja2:[11,0,1,2,3],maiz:[9,10,11,0,1,2,3],girasol:[8,9,10,11,0,1],sorgo:[10,11,0,1,2,3],mani:[10,11,0,1,2,3],trigo:[5,6,7,8,9,10],cebada:[5,6,7,8,9,10],vicia:[4,5,6,7,8],centeno:[4,5,6,7,8]};
const OBJ=[{k:"agua",n:"Agua"},{k:"suelo",n:"Suelo"},{k:"erosion",n:"Erosión"},{k:"ingreso",n:"Ingreso"}];
const NOS=["vicia","centeno","trigo","cebada","sorgo","girasol"];
const SCOL={actual:"--s-actual",A:"--s-a",B:"--s-b",C:"--s-c"};

/* Clima: se reemplaza con NASA POWER real si responde. Valores de respaldo ilustrativos. */
const CLIMA0={real:false,tmin:[17,16,14,10,6,3,2,4,7,10,13,16],tmax:[31,29,27,23,19,16,16,19,21,24,27,30],pp:[110,100,105,60,30,12,10,12,35,80,100,115],fr:null,hot:null,n:0,per:""};
const CLIMA=JSON.parse(JSON.stringify(CLIMA0));
const S={verano:"soja",invierno:"barbecho",pasada:"soja",anegable:"no",textura:"franco",lluvia:null,mo:null,
  w:{agua:3,suelo:3,erosion:3,ingreso:3},r:{sinRiego:true,sinHacienda:false,maq:false},no:new Set(),
  month:6,layer:"sat",sel:"actual",open:false,poly:DEMO.map(p=>p.slice()),slope:null,slopeReal:false};

/* ---------- Mapa ---------- */
/* [port] Tarea 2 (persona 4): pasar a un componente react-leaflet. Límites de zoom según frontend/CLAUDE.md. */
const MAXZ=18;
const map=L.map("map",{zoomControl:false,attributionControl:true,minZoom:5,maxZoom:MAXZ,zoomSnap:.25,wheelPxPerZoomLevel:90}).setView([-33.2476,-64.2325],15);
L.control.zoom({position:"topleft"}).addTo(map);window.FS_MAP=map;window.FS_LOTE=()=>loteLayer;
let tileOk=0,tileErr=0;
const sat=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:MAXZ,maxNativeZoom:17,keepBuffer:4,attribution:"Imagen © Esri, Maxar, Earthstar Geographics"}).addTo(map);
/* Si la imagen satelital no carga (sin internet o en un visor que bloquea lo externo), se avisa en vez de mostrar el mapa negro */
sat.on("tileload",()=>{tileOk++;$("#offline").hidden=true});sat.on("tileerror",()=>{tileErr++;if(!tileOk&&tileErr>=3)$("#offline").hidden=false});
setTimeout(()=>{if(!tileOk)$("#offline").hidden=false},8000);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",{maxZoom:MAXZ,maxNativeZoom:17,opacity:.85}).addTo(map);
let slopeOverlay=null,climaRect=null,climaTag=null;
const loteLayer=L.polygon(S.poly,{color:"#fff",weight:3,fillColor:"#fff",fillOpacity:.08}).addTo(map);
loteLayer.bindTooltip("",{permanent:true,direction:"top",className:"lotelabel",offset:[0,-6]});
const pin=L.marker(center(S.poly),{icon:L.divIcon({className:"",html:'<div class="pin"></div>',iconSize:[18,18],iconAnchor:[9,9]}),keyboard:false,bubblingMouseEvents:false,title:"Ir al lote"});
pin.on("click",()=>focus());
function lotePin(){const b=loteLayer.getBounds(),a=map.latLngToContainerPoint(b.getNorthWest()),z=map.latLngToContainerPoint(b.getSouthEast());
  pin.setLatLng(center(S.poly));const small=Math.min(Math.abs(z.x-a.x),Math.abs(z.y-a.y))<28;
  if(small&&!map.hasLayer(pin))pin.addTo(map);else if(!small&&map.hasLayer(pin))map.removeLayer(pin)}
map.on("zoomend moveend",lotePin);

function areaHa(pts){const R=6378137;let a=0;for(let i=0;i<pts.length;i++){const[p1,p2]=[pts[i],pts[(i+1)%pts.length]];a+=(p2[1]-p1[1])*Math.PI/180*(2+Math.sin(p1[0]*Math.PI/180)+Math.sin(p2[0]*Math.PI/180))}return Math.abs(a*R*R/2)/1e4}
function center(pts){let a=0,x=0,y=0;for(let i=0,n=pts.length;i<n;i++){const[p0,p1]=pts[i],[q0,q1]=pts[(i+1)%n],k=p1*q0-q1*p0;a+=k;x+=(p0+q0)*k;y+=(p1+q1)*k}
  if(Math.abs(a)<1e-12)return[pts.reduce((s,p)=>s+p[0],0)/pts.length,pts.reduce((s,p)=>s+p[1],0)/pts.length];return[x/(3*a),y/(3*a)]}
function distKm(a,b){const R=6371,dl=(b[0]-a[0])*Math.PI/180,dn=(b[1]-a[1])*Math.PI/180;const x=Math.sin(dl/2)**2+Math.cos(a[0]*Math.PI/180)*Math.cos(b[0]*Math.PI/180)*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
function inPoly(lat,lng,pts){let c=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const[yi,xi]=pts[i],[yj,xj]=pts[j];if(((yi>lat)!==(yj>lat))&&(lng<(xj-xi)*(lat-yi)/(yj-yi)+xi))c=!c}return c}

/* Tocar el mapa mueve el lote entero, sin perder su forma */
map.on("click",e=>{if(DRAW.on){addVertex(e.latlng);return}const{lat,lng}=e.latlng,c=center(S.poly);
  S.poly=S.poly.map(([a,b])=>[a+lat-c[0],b+lng-c[1]]);loteLayer.setLatLngs(S.poly);onLoteChange()});

/* ---------- Dibujar el lote por puntos ----------
   Cada toque marca una esquina. Se cierra tocando el primer punto o con "Listo".
   Mínimo 1 ha y sin líneas que se crucen; puede ser cóncavo (una L, por ejemplo). */
const MIN_HA=1;
const DRAW={on:false,pts:[],marks:[],line:null,ghost:null};
function segX(p1,p2,p3,p4){const d=(a,b,c)=>(b[1]-a[1])*(c[0]-b[0])-(b[0]-a[0])*(c[1]-b[1]);
  const o1=d(p1,p2,p3),o2=d(p1,p2,p4),o3=d(p3,p4,p1),o4=d(p3,p4,p2);return o1*o2<0&&o3*o4<0}
function selfX(pts,closed){const n=pts.length,segs=[];for(let i=0;i<n-1;i++)segs.push([pts[i],pts[i+1]]);if(closed&&n>2)segs.push([pts[n-1],pts[0]]);
  for(let i=0;i<segs.length;i++)for(let j=i+1;j<segs.length;j++){if(j===i+1||(closed&&i===0&&j===segs.length-1))continue;if(segX(segs[i][0],segs[i][1],segs[j][0],segs[j][1]))return true}return false}
function drawUI(){const n=DRAW.pts.length,ha=n>=3?areaHa(DRAW.pts):0,x=n>=3&&selfX(DRAW.pts,true),ok=n>=3&&ha>=MIN_HA&&!x;
  $("#dw-a").textContent=n<3?`Marcá las esquinas del lote · ${n} punto${n===1?"":"s"}`:x?`${n} puntos`:`${fmt(ha,ha<10?1:0)} ha · ${n} puntos`;
  const h=$("#dw-h");h.classList.toggle("err",n>=3&&!ok);
  h.textContent=n<3?"Tocá el mapa en cada esquina. Puede tener cualquier forma, por ejemplo una L.":x?"Las líneas se cruzan: deshacé el último punto.":ha<MIN_HA?`Muy chico: el mínimo es ${MIN_HA} ha.`:"Tocá el primer punto o «Listo» para cerrarlo.";
  $("#dw-ok").disabled=!ok;$("#dw-undo").disabled=!n;
  if(DRAW.line)DRAW.line.setLatLngs(DRAW.pts);if(DRAW.ghost)DRAW.ghost.setLatLngs(n>=3?DRAW.pts:[])}
function addVertex(ll){if(DRAW.pts.length>=3){const f=map.latLngToContainerPoint(DRAW.pts[0]),p=map.latLngToContainerPoint(ll);if(f.distanceTo(p)<14){finishDraw();return}}
  DRAW.pts.push([ll.lat,ll.lng]);const first=DRAW.pts.length===1;
  const m=L.marker(ll,{icon:L.divIcon({className:"",html:`<div class="vx${first?" first":""}"></div>`,iconSize:first?[18,18]:[14,14],iconAnchor:first?[9,9]:[7,7]}),keyboard:false,bubblingMouseEvents:false}).addTo(map);
  if(first)m.on("click",()=>finishDraw());DRAW.marks.push(m);drawUI()}
function startDraw(){if(DRAW.on)return;DRAW.on=true;DRAW.pts=[];DRAW.marks=[];
  loteLayer.setStyle({opacity:.25,fillOpacity:0});loteLayer.closeTooltip();if(map.hasLayer(pin))map.removeLayer(pin);
  DRAW.ghost=L.polygon([],{stroke:false,fillColor:css("--accent"),fillOpacity:.18,interactive:false}).addTo(map);
  DRAW.line=L.polyline([],{color:css("--accent"),weight:3,dashArray:"6 6",interactive:false}).addTo(map);
  map.getContainer().classList.add("drawing");$("#drawbar").hidden=false;$$(".seg2 button").forEach(b=>b.disabled=true);setEntry("draw");drawUI()}
function endDraw(){DRAW.on=false;$$(".seg2 button").forEach(b=>b.disabled=false);DRAW.marks.forEach(m=>map.removeLayer(m));[DRAW.line,DRAW.ghost].forEach(l=>l&&map.removeLayer(l));DRAW.line=DRAW.ghost=null;DRAW.marks=[];
  map.getContainer().classList.remove("drawing");$("#drawbar").hidden=true;
  loteLayer.setStyle({opacity:1,fillOpacity:.08});loteLayer.openTooltip();lotePin()}
function finishDraw(){const n=DRAW.pts.length;if(n<3||areaHa(DRAW.pts)<MIN_HA||selfX(DRAW.pts,true)){drawUI();return}
  S.poly=DRAW.pts.map(p=>p.slice());endDraw();loteLayer.setLatLngs(S.poly);onLoteChange();focus(loteLayer.getBounds().pad(.3));toast(`Lote dibujado: ${fmt(areaHa(S.poly),1)} ha`)}
const DEMO_POLY=DEMO.map(p=>p.slice());S.entry="demo";
function setEntry(e){S.entry=e;$$("[data-e]").forEach(b=>b.setAttribute("aria-checked",b.dataset.e===e));
  if(document.body.classList.contains("onb"))$("#comparar").textContent=e==="draw"?"Ir al mapa y dibujar mi lote":"Ver mi lote en el mapa"}
$$(".opt").forEach(b=>b.addEventListener("click",()=>setEntry(b.dataset.e)));
$$(".seg2 button").forEach(b=>b.addEventListener("click",()=>{if(DRAW.on)return;
  if(b.dataset.e==="demo"){setEntry("demo");S.poly=DEMO_POLY.map(p=>p.slice());loteLayer.setLatLngs(S.poly);onLoteChange();focus(loteLayer.getBounds().pad(.3))}
  else{setEntry("draw");startDraw()}}));
$("#dw-undo").addEventListener("click",()=>{if(!DRAW.pts.length)return;DRAW.pts.pop();map.removeLayer(DRAW.marks.pop());drawUI()});
$("#dw-cancel").addEventListener("click",()=>{endDraw();if(S.poly.length===DEMO_POLY.length&&S.poly.every((p,i)=>p[0]===DEMO_POLY[i][0]&&p[1]===DEMO_POLY[i][1]))setEntry("demo")});
$("#dw-ok").addEventListener("click",()=>finishDraw());
addEventListener("keydown",e=>{if(!DRAW.on)return;if(e.key==="Escape")endDraw();else if(e.key==="Enter")finishDraw();else if((e.key==="Backspace"||e.key==="z")&&!/INPUT|SELECT/.test(document.activeElement.tagName))$("#dw-undo").click()});

function onLoteChange(){const c=center(S.poly),ha=areaHa(S.poly),d=distKm(c,CITY);
  $("#lote-t").textContent=`Lote a ${fmt(d)} km de Río Cuarto`;
  $("#lote-s").textContent=`${fmt(Math.abs(c[0]),4)}° S · ${fmt(Math.abs(c[1]),4)}° O · tocá el mapa para moverlo o dibujalo`;
  $("#f-ha").textContent=`${fmt(ha)} ha`;loteLayer.setTooltipContent(`Lote · ${fmt(ha)} ha`);
  S.slope=null;$("#f-sl").textContent="…";
  lotePin();loadSlope();loadPower();loadSeen();if(S.layer==="clima")drawClima();if(S.layer==="ndvi")setNdvi();if(S.open)render()}

/* ---------- NDVI real: NASA GIBS, MODIS Terra 8 días, 2024 ---------- */
/* ---------- NDVI ----------
   Principal: NASA HLS (Landsat 8/9 + Sentinel-2 armonizados por NASA), píxel de 30 m, servido por Microsoft Planetary Computer (sin cuenta).
   Por cada mes de la última campaña (julio a junio) se usa la escena con menos nubes. Respaldo: MODIS 250 m de NASA GIBS. */
const PC="https://planetarycomputer.microsoft.com/api";
const HLS_EXPR={"hls2-s30":"(B08-B04)/(B08+B04)","hls2-l30":"(B05-B04)/(B05+B04)"};
const HLS_SENSOR={"hls2-s30":"Sentinel-2","hls2-l30":"Landsat"};
const CAMP0=new Date().getFullYear()-2;/* última campaña completa: la misma con la que termina la serie de lluvia */
const campYear=m=>m>=6?CAMP0:CAMP0+1;
const CAMP_LAB=`${CAMP0}/${String(CAMP0+1).slice(2)}`;
const BAJO=.3;/* NDVI medio del lote por debajo de 0,3 = lote pelado o casi (regla del prototipo, a validar con la persona 3) */
let hlsLayer=null,modisLayer=null,NDVI_SRC=null,ndviToken=0;
const HLS_CACHE=new Map(),SEEN={key:null,m:Array(12).fill(undefined)};
function loteGeo(){const p=S.poly.map(([a,b])=>[b,a]);return{type:"Polygon",coordinates:[[...p,p[0]]]}}
function loteKey(){const c=center(S.poly);return c.map(v=>v.toFixed(4)).join(",")}
async function hlsScene(m){const k=loteKey()+"|"+m;if(HLS_CACHE.has(k))return HLS_CACHE.get(k);
  const job=(async()=>{const y=campYear(m),d0=`${y}-${String(m+1).padStart(2,"0")}-01`,d1=new Date(Date.UTC(y,m+1,0)).toISOString().slice(0,10);
    const r=await fetch(`${PC}/stac/v1/search`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({collections:["hls2-s30","hls2-l30"],intersects:loteGeo(),datetime:`${d0}/${d1}`,query:{"eo:cloud_cover":{lt:30}},sortby:[{field:"eo:cloud_cover",direction:"asc"}],limit:3})});
    if(!r.ok)throw 0;const f=(await r.json()).features[0];if(!f)return null;
    return{col:f.collection,id:f.id,date:f.properties.datetime.slice(0,10),cloud:f.properties["eo:cloud_cover"]}})();
  HLS_CACHE.set(k,job);job.catch(()=>HLS_CACHE.delete(k));return job}
function hlsQuery(sc){return`collection=${sc.col}&item=${encodeURIComponent(sc.id)}&expression=${encodeURIComponent(HLS_EXPR[sc.col])}&asset_as_band=true`}
async function hlsMean(sc){const r=await fetch(`${PC}/data/v1/item/statistics?${hlsQuery(sc)}&max_size=512`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"Feature",properties:{},geometry:loteGeo()})});
  if(!r.ok)throw 0;const st=Object.values((await r.json()).properties.statistics)[0];return{mean:st.mean,n:st.count}}
function fmtDate(d){const[y,m,dd]=d.split("-");return`${+dd} ${MES[+m-1].slice(0,3).toLowerCase()} ${y}`}
async function setNdvi(){const tok=++ndviToken,m=S.month;let sc=null;
  try{sc=await hlsScene(m)}catch(e){sc=null}
  if(tok!==ndviToken||S.layer!=="ndvi")return;
  if(sc){const url=`${PC}/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?${hlsQuery(sc)}&rescale=0,0.9&colormap=${NDVI_CM}&format=png`;
    if(hlsLayer)hlsLayer.setUrl(url);else hlsLayer=L.tileLayer(url,{minZoom:9,maxNativeZoom:16,maxZoom:MAXZ,opacity:.85,className:"px",keepBuffer:4,attribution:"NDVI: NASA HLS vía Microsoft Planetary Computer"});
    if(modisLayer&&map.hasLayer(modisLayer))map.removeLayer(modisLayer);if(!map.hasLayer(hlsLayer))hlsLayer.addTo(map);
    NDVI_SRC={kind:"hls",...sc};map.setMaxZoom(17)}
  else{const url=`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_L3_NDVI_16Day/default/${campYear(m)}-${String(m+1).padStart(2,"0")}-15/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`;
    if(modisLayer)modisLayer.setUrl(url);else modisLayer=L.tileLayer(url,{maxNativeZoom:9,maxZoom:MAXZ,opacity:.72,className:"px",keepBuffer:4,attribution:"NDVI: NASA GIBS · MODIS Terra"});
    if(hlsLayer&&map.hasLayer(hlsLayer))map.removeLayer(hlsLayer);if(!map.hasLayer(modisLayer))modisLayer.addTo(map);
    NDVI_SRC={kind:"modis",y:campYear(m)};/* más allá de 16 un píxel de 250 m tapa la pantalla */map.setMaxZoom(16)}
  legend()}
function clearNdvi(){ndviToken++;[hlsLayer,modisLayer].forEach(l=>{if(l&&map.hasLayer(l))map.removeLayer(l)})}
/* Lo que vio el satélite: NDVI medio del lote en cada mes de la última campaña */
async function loadSeen(){const key=loteKey();SEEN.key=key;SEEN.m=Array(12).fill(undefined);if(S.open)render();
  await Promise.all(MK.map(async(_,m)=>{let v=null;try{const sc=await hlsScene(m);if(sc){const st=await hlsMean(sc);if(st.n>=20)v={...sc,...st}}}catch(e){v=null}
    if(SEEN.key!==key)return;SEEN.m[m]=v}));
  if(SEEN.key!==key)return;if(S.open)render();if(S.layer==="ndvi")legend()}
/* 6 clases: 0–0,15 y 0,15–0,3 = pelado (arena); 0,3 en adelante = vegetación (verdes). Pasos de luminosidad validados con la skill dataviz. */
const NDVI_CL=[0,.15,.3,.45,.6,.75],NDVI_COLS=["#E6D8AE","#CDBA86","#94AF63","#689C49","#3F8139","#1B5E2E"];
const ndviCol=v=>{let i=0;NDVI_CL.forEach((t,k)=>{if(v>=t)i=k});return NDVI_COLS[i]};
const NDVI_CM=encodeURIComponent(JSON.stringify(NDVI_COLS.map((c,i)=>[[Math.round(NDVI_CL[i]/.9*255),i<5?Math.round(NDVI_CL[i+1]/.9*255):256],[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16),255]])));
function seenColor(v){const t=clamp((v+.1)/1,0,1),st=[[0,[165,0,38]],[.25,[244,109,67]],[.45,[254,224,139]],[.6,[217,239,139]],[.8,[102,189,99]],[1,[0,104,55]]];
  for(let i=1;i<st.length;i++)if(t<=st[i][0]){const[a,ca]=st[i-1],[b,cb]=st[i],u=(t-a)/(b-a);return`rgb(${ca.map((x,q)=>Math.round(x+(cb[q]-x)*u)).join(",")})`}return"rgb(0,104,55)"}

/* ---------- Pendiente real: elevación AWS Terrain Tiles (incluye SRTM) ---------- */
let slopeToken=0;
function lon2x(lon,z){return(lon+180)/360*2**z*256}
function lat2y(lat,z){const r=lat*Math.PI/180;return(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*2**z*256}
function x2lon(x,z){return x/(2**z*256)*360-180}
function y2lat(y,z){const n=Math.PI-2*Math.PI*y/(2**z*256);return 180/Math.PI*Math.atan(.5*(Math.exp(n)-Math.exp(-n)))}
async function loadImg(src){const r=await fetch(src,{mode:"cors"});if(!r.ok)throw 0;const b=await r.blob();
  try{return await createImageBitmap(b,{colorSpaceConversion:"none",premultiplyAlpha:"none"})}catch(_){return await createImageBitmap(b)}}
function blur(a,W,H,r){const o=new Float32Array(W*H);for(let j=0;j<H;j++)for(let i=0;i<W;i++){let s=0,n=0;for(let dj=-r;dj<=r;dj++)for(let di=-r;di<=r;di++){const x=i+di,y=j+dj;if(x>=0&&y>=0&&x<W&&y<H){s+=a[y*W+x];n++}}o[j*W+i]=s/n}return o}
async function loadSlope(){const tok=++slopeToken,z=14,pts=S.poly;
  const lats=pts.map(p=>p[0]),lngs=pts.map(p=>p[1]);
  const x0=Math.floor(lon2x(Math.min(...lngs),z))-6,x1=Math.ceil(lon2x(Math.max(...lngs),z))+6,y0=Math.floor(lat2y(Math.max(...lats),z))-6,y1=Math.ceil(lat2y(Math.min(...lats),z))+6;
  const tx0=Math.floor(x0/256),tx1=Math.floor(x1/256),ty0=Math.floor(y0/256),ty1=Math.floor(y1/256);
  try{const mos=document.createElement("canvas");mos.width=(tx1-tx0+1)*256;mos.height=(ty1-ty0+1)*256;const mc=mos.getContext("2d");
    const jobs=[];for(let tx=tx0;tx<=tx1;tx++)for(let ty=ty0;ty<=ty1;ty++)jobs.push(loadImg(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tx}/${ty}.png`).then(im=>mc.drawImage(im,(tx-tx0)*256,(ty-ty0)*256)));
    await Promise.all(jobs);if(tok!==slopeToken)return;
    const ox=tx0*256,oy=ty0*256,W=x1-x0,H=y1-y0;const data=mc.getImageData(x0-ox,y0-oy,W,H).data;
    const raw=new Float32Array(W*H);for(let i=0;i<W*H;i++)raw[i]=data[i*4]*256+data[i*4+1]+data[i*4+2]/256-32768;
    const el=blur(raw,W,H,5);
    const midLat=(Math.min(...lats)+Math.max(...lats))/2,px=156543.03392*Math.cos(midLat*Math.PI/180)/2**z;
    const out=document.createElement("canvas");out.width=W;out.height=H;const oc=out.getContext("2d");const img=oc.createImageData(W,H);
    let sum=0,n=0,max=0;const k=5;
    for(let j=k;j<H-k;j++)for(let i=k;i<W-k;i++){const lat=y2lat(y0+j+.5,z),lng=x2lon(x0+i+.5,z);if(!inPoly(lat,lng,pts))continue;
      const dzx=(el[j*W+i+k]-el[j*W+i-k])/(2*k*px),dzy=(el[(j+k)*W+i]-el[(j-k)*W+i])/(2*k*px);const s=Math.hypot(dzx,dzy)*100;sum+=s;n++;if(s>max)max=s;
      const c=slopeColor(s),o=(j*W+i)*4;img.data[o]=c[0];img.data[o+1]=c[1];img.data[o+2]=c[2];img.data[o+3]=200}
    oc.putImageData(img,0,0);
    /* Pendiente general del lote: plano ajustado por mínimos cuadrados (robusto al ruido del modelo de elevación) */
    let a=[[0,0,0],[0,0,0],[0,0,0]],bv=[0,0,0];
    for(let j=0;j<H;j++)for(let i=0;i<W;i++){const lat=y2lat(y0+j+.5,z),lng=x2lon(x0+i+.5,z);if(!inPoly(lat,lng,pts))continue;const X=i*px,Y=j*px,Z=raw[j*W+i],v=[X,Y,1];
      for(let r=0;r<3;r++){for(let c=0;c<3;c++)a[r][c]+=v[r]*v[c];bv[r]+=v[r]*Z}}
    const sol=solve3(a,bv);
    S.slope=sol?Math.hypot(sol[0],sol[1])*100:(n?sum/n:null);S.slopeMax=max;S.slopeReal=true;
    if(slopeOverlay)map.removeLayer(slopeOverlay);
    slopeOverlay=L.imageOverlay(out.toDataURL(),[[y2lat(y1,z),x2lon(x0,z)],[y2lat(y0,z),x2lon(x1,z)]],{opacity:.85,interactive:false});
    if(S.layer==="slope")slopeOverlay.addTo(map);
  }catch(e){if(tok!==slopeToken)return;S.slope=1.6;S.slopeReal=false}
  $("#f-sl").textContent=S.slope==null?"—":`${fmt(S.slope,1)} %`;legend();if(S.open)render()}
function solve3(A,b){const m=A.map((r,i)=>[...r,b[i]]);for(let c=0;c<3;c++){let p=c;for(let r=c+1;r<3;r++)if(Math.abs(m[r][c])>Math.abs(m[p][c]))p=r;[m[c],m[p]]=[m[p],m[c]];if(Math.abs(m[c][c])<1e-9)return null;
  for(let r=0;r<3;r++){if(r===c)continue;const f=m[r][c]/m[c][c];for(let k=c;k<4;k++)m[r][k]-=f*m[c][k]}}return m.map((r,i)=>r[3]/r[i])}
function slopeColor(s){const st=[[0,[46,125,50]],[1,[124,179,66]],[2.5,[253,216,53]],[4,[245,124,0]],[6,[198,40,40]]];
  for(let i=1;i<st.length;i++){if(s<=st[i][0]){const[a,ca]=st[i-1],[b,cb]=st[i],t=(s-a)/(b-a);return ca.map((v,q)=>Math.round(v+(cb[q]-v)*t))}}return st[st.length-1][1]}

/* [port] Tarea 5: este fetch directo a POWER se reemplaza por la respuesta de /analizar (Back 1). */
/* ---------- Clima real: NASA POWER mensual ----------
   Un solo pedido y un solo período para todo: las últimas 30 campañas completas (julio a junio).
   De ahí salen la lluvia y las temperaturas de cada mes, las heladas, la serie por campaña y los años seco/normal/húmedo. */
const NOMT={seco:"seco",normal:"normal",humedo:"húmedo"};
let SERIE={real:false,c:[]},powerToken=0;
const avgOf=a=>a.reduce((x,y)=>x+y,0)/a.length;
async function loadPower(){const tok=++powerToken,[lat,lng]=center(S.poly),end=new Date().getFullYear()-1,start=end-31;
  try{const u=`https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=PRECTOTCORR_SUM,T2M_MIN,T2M_MAX&community=AG&longitude=${lng.toFixed(4)}&latitude=${lat.toFixed(4)}&start=${start}&end=${end}&format=JSON`;
    const r=await fetch(u);if(!r.ok)throw 0;const j=await r.json();if(tok!==powerToken)return;
    const P=j.properties.parameter,PP=P.PRECTOTCORR_SUM,TN=P.T2M_MIN,TX=P.T2M_MAX,k2=(y,m)=>`${y}${String(m).padStart(2,"0")}`,ok=v=>v!=null&&v>-999;
    let c=[];for(let y=start;y<end;y++){const ks=[7,8,9,10,11,12].map(m=>k2(y,m)).concat([1,2,3,4,5,6].map(m=>k2(y+1,m)));
      if(ks.some(k=>!ok(PP[k])||!ok(TN[k])||!ok(TX[k])))continue;
      c.push({lab:`${y}/${String(y+1).slice(2)}`,ks,mm:Math.round(ks.reduce((a,k)=>a+PP[k],0))})}
    c=c.slice(-30);const n=c.length;if(n<15)throw 0;
    /* Mes m (0 = enero) de cada campaña: la campaña arranca en julio */
    const per=m=>c.map(x=>x.ks[(m+6)%12]);
    Object.assign(CLIMA,{real:true,n,per:`${c[0].lab} a ${c[n-1].lab}`,
      pp:MK.map((_,m)=>avgOf(per(m).map(k=>PP[k]))),
      tmin:MK.map((_,m)=>avgOf(per(m).map(k=>TN[k]))),
      tmax:MK.map((_,m)=>avgOf(per(m).map(k=>TX[k]))),
      fr:MK.map((_,m)=>per(m).filter(k=>TN[k]<0).length),
      hot:MK.map((_,m)=>per(m).filter(k=>TX[k]>=35).length)});
    /* Terciles: las campañas se ordenan por lluvia y se cortan en tres grupos iguales */
    [...c].sort((a,b)=>a.mm-b.mm).forEach((x,i)=>x.tipo=i<Math.round(n/3)?"seco":i<Math.round(2*n/3)?"normal":"humedo");
    const g=t=>c.filter(x=>x.tipo===t);
    SERIE={real:true,c,mean:{seco:avgOf(g("seco").map(x=>x.mm)),normal:avgOf(g("normal").map(x=>x.mm)),humedo:avgOf(g("humedo").map(x=>x.mm))},
      n:{seco:g("seco").length,normal:g("normal").length,humedo:g("humedo").length},
      maxSeco:Math.max(...g("seco").map(x=>x.mm)),maxNormal:Math.max(...g("normal").map(x=>x.mm))}}
  catch(e){if(tok!==powerToken)return;Object.assign(CLIMA,JSON.parse(JSON.stringify(CLIMA0)));SERIE={real:false,c:[]}}
  $("#f-pp").textContent=`${fmt(CLIMA.pp.reduce((a,b)=>a+b,0))} mm`;if(S.layer==="clima")drawClima();legend();if(S.open)render()}
/* Helada frecuente: el mes tuvo helada (mínima < 0 °C) en al menos 1 de cada 3 años */
const helada=m=>CLIMA.real?CLIMA.fr[m]>=CLIMA.n/3:CLIMA.tmin[m]<=3;
const calor=m=>CLIMA.real?CLIMA.hot[m]>=CLIMA.n/2:CLIMA.tmax[m]>=30;
function serieHTML(){if(!SERIE.real)return`<div class="serie off">Serie de campañas: sin conexión a NASA POWER. Años seco, normal y húmedo ilustrativos.</div>`;
  const c=SERIE.c,n=c.length,k=Math.min(10,Math.floor(n/3)),a=c.slice(0,n-k),b=c.slice(n-k),ma=avgOf(a.map(x=>x.mm)),mb=avgOf(b.map(x=>x.mm)),max=Math.max(...c.map(x=>x.mm)),sec=b.filter(x=>x.tipo==="seco").length;
  SERIE.def=`Últimas ${k}: ${fmt(mb)} mm · ${n-k} previas: ${fmt(ma)} mm`;SERIE.sec=`${sec} de las últimas ${k}, en el tercio seco`;
  const mean=avgOf(c.map(x=>x.mm));
  /* Divergente: gris = cerca del promedio; marrón = más seca; azul = más húmeda. 4 pasos por brazo. */
  const tone=mm=>{const a=(mm-mean)/mean,k=Math.abs(a)<.04?0:Math.abs(a)<.10?1:Math.abs(a)<.18?2:Math.abs(a)<.27?3:4;return k?`var(--${a<0?"dry":"wet"}${k})`:"var(--mid)"};
  const grp=(arr,off)=>`<div class="g" style="flex:${arr.length}">${arr.map((x,j)=>`<i data-i="${off+j}" style="--j:${off+j};background:${tone(x.mm)}"></i>`).join("")}</div>`;
  return`<div class="serie"><div class="t"><b>Lluvia por campaña · ${n} campañas</b><span class="r num" id="serie-r">${SERIE.def}</span><span>${SERIE.sec}</span><span class="src">NASA POWER · celda ~50 km · julio a junio</span></div>
    <div><div class="bars" id="bars" role="img" aria-label="Lluvia de cada campaña. ${SERIE.def}. ${SERIE.sec}">${grp(a,0)}${grp(b,n-k)}</div><div class="ax"><span style="flex:${n-k}">${c[0].lab}</span><span style="flex:${k}">últimas ${k} · ${c[n-1].lab}</span></div>
    <div class="dscale"><span>Más seca</span><span class="rp">${[4,3,2,1].map(i=>`<i style="background:var(--dry${i})"></i>`).join("")}<i style="background:var(--mid)"></i>${[1,2,3,4].map(i=>`<i style="background:var(--wet${i})"></i>`).join("")}</span><span>Más húmeda</span><span>· gris: cerca del promedio (${fmt(mean)} mm)</span></div></div></div>`}
function serieOn(i){const r=$("#serie-r");if(!r)return;$$("#bars i").forEach(x=>x.classList.toggle("on",x.dataset.i===String(i)));
  if(i==null){r.textContent=SERIE.def;return}const x=SERIE.c[i];const mean=avgOf(SERIE.c.map(y=>y.mm)),d=Math.round((x.mm-mean)/mean*100);r.textContent=`${x.lab} · ${fmt(x.mm)} mm (${d>0?"+":d<0?"−":""}${Math.abs(d)} % del promedio) · año ${NOMT[x.tipo]}`}
function tipoTitle(t){if(!SERIE.real)return"Ilustrativo: sin serie de NASA POWER";const{maxSeco:a,maxNormal:b}=SERIE,n=SERIE.n[t];
  return t==="seco"?`Campañas con hasta ${fmt(a)} mm (${n})`:t==="normal"?`Campañas de ${fmt(a+1)} a ${fmt(b)} mm (${n})`:`Campañas con más de ${fmt(b)} mm (${n})`}
function powerCell(){const[lat,lng]=center(S.poly);const cl=Math.round(lat/.5)*.5,cn=Math.round(lng/.625)*.625;return[[cl-.25,cn-.3125],[cl+.25,cn+.3125]]}
/* Zona del dato de clima: celda fija de la grilla de NASA POWER (0,5° x 0,625°). Estilo distinto al lote y rotulada, para que no parezca un lote. */
function drawClima(){clearClima();const cb=powerCell();
  climaRect=L.rectangle(cb,{color:"#9fd3ff",weight:2,dashArray:"2 7",lineCap:"round",fillColor:"#5aa9e6",fillOpacity:.08,interactive:false}).addTo(map);
  climaTag=L.marker([cb[1][0],cb[0][1]],{interactive:false,keyboard:false,icon:L.divIcon({className:"",html:'<div class="celltag">Zona del dato de clima de NASA · ~50 km</div>',iconSize:[0,0],iconAnchor:[-8,-8]})}).addTo(map);
  loteLayer.setTooltipContent(`Tu lote · ${fmt(areaHa(S.poly))} ha`)}
function clearClima(){[climaRect,climaTag].forEach(l=>l&&map.removeLayer(l));climaRect=climaTag=null;loteLayer.setTooltipContent(`Lote · ${fmt(areaHa(S.poly))} ha`)}
function climaPos(){const cb=powerCell(),[lat,lng]=center(S.poly),fy=(lat-cb[0][0])/(cb[1][0]-cb[0][0]),fx=(lng-cb[0][1])/(cb[1][1]-cb[0][1]);
  const ns=fy<.15?"sur":fy>.85?"norte":"",eo=fx<.15?"oeste":fx>.85?"este":"";return ns||eo?`cerca del borde ${[ns,eo].filter(Boolean).join("-")}`:"bien adentro"}

/* ---------- Capas ---------- */
function setLayer(ly){S.layer=ly;if(ly!=="ndvi")map.setMaxZoom(MAXZ);$$(".layers button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.ly===ly));
  clearNdvi();if(slopeOverlay&&map.hasLayer(slopeOverlay))map.removeLayer(slopeOverlay);clearClima()
  $("#timeline").hidden=!(ly==="ndvi"||ly==="clima");
  if(ly==="ndvi"){setNdvi();focus(loteLayer.getBounds().pad(.35),16)}
  if(ly==="slope"){if(slopeOverlay)slopeOverlay.addTo(map);focus(null,17)}
  if(ly==="clima"){drawClima();focus(L.latLngBounds(powerCell()).extend(loteLayer.getBounds().pad(4)),12)}
  if(ly==="sat")focus();
  legend()}
$$(".layers button").forEach(b=>b.addEventListener("click",()=>setLayer(b.dataset.ly)));

function ndviScale(v){const p=x=>clamp(x/.9,0,1)*100;
  return`<div class="nscale" style="margin-top:${v!=null?22:6}px"><div class="sw">${NDVI_COLS.map((c,i)=>`<i style="background:${c};flex:${(i<5?NDVI_CL[i+1]:.9)-NDVI_CL[i]}"></i>`).join("")}</div><span class="th" style="left:${p(BAJO)}%" title="Umbral de pelado: 0,3"></span>${[0,.3,.6,.9].map(t=>`<span class="tk" style="left:${p(t)}%">${fmt(t,1)}</span>`).join("")}${v!=null?`<span class="lt" style="left:${p(v)}%">Lote</span>`:""}</div>`}
function legend(){const el=$("#legend");let h="";
  if(S.layer==="ndvi"){const sv=NDVI_SRC&&NDVI_SRC.kind==="hls"?SEEN.m[S.month]:null;
    h=NDVI_SRC&&NDVI_SRC.kind==="hls"
      ?`<b>Vegetación · ${fmtDate(NDVI_SRC.date)}</b>${ndviScale(sv?sv.mean:null)}<div class="row"><span>Pelado</span><span>Vegetación</span></div>${sv?`<div class="row"><span>Promedio del lote</span><b class="num">${fmt(sv.mean,2)} · ${sv.mean<BAJO?"pelado":"cubierto"}</b></div>`:""}<div class="src">NDVI de NASA HLS · ${HLS_SENSOR[NDVI_SRC.col]} · píxel de 30 m · nubes en la escena: ${fmt(NDVI_SRC.cloud)} %. Servido por Microsoft Planetary Computer. Dato real.</div>`
      :`<b>Vegetación · ${MES[S.month].toLowerCase()} ${NDVI_SRC?NDVI_SRC.y:campYear(S.month)}</b><div class="ramp" style="background:linear-gradient(90deg,#f7e8c6,#c9d58a,#67ab4d,#1f6b2b)"></div><div class="row"><span>pelado</span><span>verde</span></div><div class="src">NDVI de NASA MODIS (GIBS) · 16 días · píxel de 250 m. Dato real.${NDVI_SRC?" Sin escena de 30 m sin nubes para este mes.":""}</div>`}
  if(S.layer==="slope")h=`<b>Pendiente del lote${S.slope!=null?` · media ${fmt(S.slope,1)} %`:""}</b><div class="ramp" style="background:linear-gradient(90deg,#2e7d32,#7cb342,#fdd835,#f57c00,#c62828)"></div><div class="row"><span>0 %</span><span>2,5 %</span><span>6 %+</span></div><div class="src">${S.slopeReal?"Elevación real: AWS Terrain Tiles (incluye SRTM) · ~8 m":"No se pudo leer la elevación: valor ilustrativo"}</div>`;
  if(S.layer==="clima"){const m=S.month;h=`<b>Lluvia y heladas · ${MES[m].toLowerCase()}</b><div class="row"><span>Lluvia media</span><b class="num">${fmt(CLIMA.pp[m])} mm</b></div>${CLIMA.real?`<div class="row"><span>Mínima del mes</span><b class="num">${fmt(CLIMA.tmin[m],1)} °C</b></div><div class="row"><span>Máxima del mes</span><b class="num">${fmt(CLIMA.tmax[m],1)} °C</b></div><div class="row"><span>Años con helada</span><b class="num">${CLIMA.fr[m]} de ${CLIMA.n}</b></div>`:`<div class="row"><span>Mínima media</span><b class="num">${fmt(CLIMA.tmin[m],1)} °C</b></div><div class="row"><span>Máxima media</span><b class="num">${fmt(CLIMA.tmax[m],1)} °C</b></div>`}<div class="src">${CLIMA.real?`NASA POWER mensual, campañas ${CLIMA.per}. Mínima y máxima: el extremo de cada mes, promediado. Dato real.`:"Sin conexión a NASA POWER: valores ilustrativos."} El recuadro punteado es la zona del dato (~50 km): toda la zona tiene un solo valor. Tu lote está adentro, ${climaPos()}.</div>`}
  el.hidden=!h;el.innerHTML=h;placeLegend()}
function placeLegend(){document.body.classList.toggle("sheet-open",!!S.open&&innerWidth>900);$("#legend").style.bottom=S.open&&innerWidth>900?`calc(min(62vh,620px) + 46px)`:"36px"}

/* ---------- Línea de tiempo ---------- */
let playT=null;
function timeline(){$("#timeline").innerHTML=`<button class="play" id="play" aria-label="${playT?"Pausar":"Pasar los 12 meses"}" title="${playT?"Pausar":"Pasar los 12 meses"}">${playT?"❚❚":"▶"}</button><select id="mes" aria-label="Mes">${MES.map((m,i)=>`<option value="${i}"${i===S.month?" selected":""}>${m}</option>`).join("")}</select>`}
$("#timeline").addEventListener("click",e=>{const b=e.target.closest("#play");if(!b)return;
  if(playT){clearInterval(playT);playT=null}else{playT=setInterval(()=>setMonth((S.month+1)%12),1300)}timeline()});
$("#timeline").addEventListener("change",e=>{if(e.target.id!=="mes")return;if(playT){clearInterval(playT);playT=null}setMonth(+e.target.value)});
function setMonth(m){S.month=m;timeline();if(S.layer==="ndvi")setNdvi();legend();if(S.open)moveCursor()}

/* ---------- Formulario ---------- */
$("#sliders").innerHTML=OBJ.map(o=>`<div class="sl"><label for="w-${o.k}">${o.n}</label><input type="range" id="w-${o.k}" min="0" max="5" value="${S.w[o.k]}"><output id="o-${o.k}" class="num">${S.w[o.k]}</output></div>`).join("");
OBJ.forEach(o=>$("#w-"+o.k).addEventListener("input",e=>{S.w[o.k]=+e.target.value;$("#o-"+o.k).textContent=e.target.value;if(S.open)render()}));
["verano","invierno","pasada","anegable","textura"].forEach(id=>$("#"+id).addEventListener("change",e=>{S[id]=e.target.value;if(S.open)render()}));
["lluvia","mo"].forEach(id=>$("#"+id).addEventListener("input",e=>{S[id]=e.target.value===""?null:+e.target.value;if(S.open)render()}));
$$("[data-r]").forEach(b=>b.addEventListener("click",()=>{const k=b.dataset.r;S.r[k]=!S.r[k];b.setAttribute("aria-pressed",S.r[k]);if(S.open)render()}));
$("#nos").innerHTML=NOS.map(k=>`<button class="chip no" aria-pressed="false" data-no="${k}">${C[k].n}</button>`).join("");
$("#nos").addEventListener("click",e=>{const b=e.target.closest("[data-no]");if(!b)return;const k=b.dataset.no;S.no.has(k)?S.no.delete(k):S.no.add(k);b.setAttribute("aria-pressed",S.no.has(k));if(S.open)render()});
/* Paso 1 → paso 2: la caja se va a la derecha, el mapa aparece detrás y vuela hasta el lote */
function goMap(){const pn=$(".panel");pn.classList.add("morph");setTimeout(()=>pn.classList.remove("morph"),950);
  setTimeout(()=>{$("#comparar").textContent="Comparar alternativas"},300);document.body.classList.remove("onb");
  if(innerWidth<=900){scrollTo({top:0,behavior:"smooth"});setTimeout(()=>{map.invalidateSize();focus(S.entry==="draw"?loteLayer.getBounds().pad(1.2):null);if(S.entry==="draw")setTimeout(startDraw,300)},60);return}
  setTimeout(()=>{map.invalidateSize();map.flyToBounds(loteLayer.getBounds().pad(S.entry==="draw"?1.2:.3),{...pads(),maxZoom:17,duration:1.6,easeLinearity:.2});
    if(S.entry==="draw")map.once("moveend",()=>setTimeout(startDraw,150))},350)}
$("#comparar").addEventListener("click",()=>{if(document.body.classList.contains("onb")){goMap();return}const first=!S.open;S.open=true;if(first){INTRO=true;Object.keys(NUM).forEach(k=>delete NUM[k]);Object.keys(BW).forEach(k=>delete BW[k]);$("#sheet").classList.add("intro");setTimeout(()=>{$("#sheet").classList.remove("intro");INTRO=false;introDrawn=false;if(introPending){introPending=false;render()}},1500)}$("#sheet").classList.add("open");render();placeLegend();
  if(innerWidth<=900)$("#sheet").scrollIntoView({behavior:"smooth"});else focus()});
$("#close").addEventListener("click",()=>{S.open=false;$("#sheet").classList.remove("open");$("#menu").hidden=true;placeLegend();focus()});
/* Encuadre: el lote siempre visible entre el panel y la hoja de resultados */
function pads(){if(innerWidth<=900)return{paddingTopLeft:[24,90],paddingBottomRight:[24,24]};
  const sheetH=S.open?Math.min(innerHeight*.62,620)+32:0;return{paddingTopLeft:[60,90],paddingBottomRight:[392+60,sheetH+40]}}
function focus(bounds,maxZoom){map.invalidateSize();map.fitBounds(bounds||loteLayer.getBounds(),{...pads(),maxZoom:maxZoom||17})}

/* ---------- Estrategias ---------- */
/* [port] ILUSTRATIVO: cuando ande /analizar, estas funciones se borran y la hoja
   usa las 4 columnas que devuelve el backend (backend/app/motor/reglas.py). */
function cal(summer,winter){const c=Array(12).fill("barbecho");if(winter!=="barbecho")WIN[winter].forEach(m=>c[m]=winter);
  let s=summer;if((winter==="trigo"||winter==="cebada")&&summer==="soja")s="soja2";WIN[s].forEach(m=>c[m]=s);return c}
const pick=o=>o.find(x=>!S.no.has(x))||null;
function strategies(){const w=S.w,sl=S.slope??1.6,list=[];
  list.push({id:"actual",k:"·",name:"Lo que hacés hoy",sp:`${C[S.verano].n} + ${C[S.invierno].n.toLowerCase()}`,cal:cal(S.verano,S.invierno),on:true});
  const cov=(w.suelo>=w.erosion&&sl<=3)?pick(["vicia","centeno"]):pick(["centeno","vicia"]);
  list.push(cov?{id:"A",k:"A",name:"Cobertura de invierno",sp:`${C[S.verano].n} + ${C[cov].n.toLowerCase()}`,cal:cal(S.verano,cov),cov,on:true}:{id:"A",k:"A",name:"Cobertura de invierno",on:false,why:"No sembrar vicia ni centeno"});
  const win=w.agua>=4?pick(["cebada","trigo"]):pick(["trigo","cebada"]);
  list.push(win?{id:"B",k:"B",name:"Cultivo de invierno",sp:`${C[win].n} + soja 2ª`,cal:cal("soja",win),win,on:true}:{id:"B",k:"B",name:"Cultivo de invierno",on:false,why:"No sembrar trigo ni cebada"});
  const ns=pick((w.agua>=3?["sorgo","girasol"]:["girasol","sorgo"]).filter(x=>x!==S.verano));
  list.push(ns?{id:"C",k:"C",name:"Diversificar el verano",sp:`${C[ns].n}, rota con ${C[S.verano].n.toLowerCase()}`,cal:cal(ns,S.invierno),ns,on:true}:{id:"C",k:"C",name:"Diversificar el verano",on:false,why:"No sembrar sorgo ni girasol"});
  list.forEach(ev);return list}
function ev(s){if(!s.on)return;const c=s.cal,cr=[...new Set(c)].filter(x=>x!=="barbecho"),sl=S.slope??1.6;
  const rain=CLIMA.pp.reduce((a,b)=>a+b,0);
  s.bare=c.filter(x=>x==="barbecho").length;s.cons=Math.round(c.reduce((a,x)=>a+C[x].cons*80,0));
  const rainOf=y=>SERIE.real?SERIE.mean[y]:rain*{seco:.74,normal:1,humedo:1.26}[y];
  s.ag={};["seco","normal","humedo"].forEach(y=>{s.ag[y]=Math.round(clamp(75-(s.cons-rainOf(y)*.75)/4,0,100))});
  let su=20;cr.forEach(x=>su+=C[x].nfix+C[x].rast);su+=(12-s.bare)*2;const sm=cr.find(x=>C[x].g==="verano");s.rep=((sm==="soja2"?"soja":sm)===S.pasada);if(s.rep)su-=10;s.suelo=Math.round(clamp(su,0,100));
  const res=cr.reduce((a,x)=>a+C[x].rast,0);s.ero=Math.round(clamp(100-s.bare*12*(.6+sl/5)+(res>=30?20:0),0,100));
  s.com=cr.filter(x=>C[x].com).length;s.ing=s.com>=2?85:(cr.some(x=>C[x].g==="cobertura")?45:50);
  s.fr=c.map((x,m)=>helada(m)?m:-1).filter(m=>m>=0);s.conf=s.fr.filter(m=>!C[c[m]].fr);
  s.heat=c.map((x,m)=>C[x].g==="verano"&&calor(m)?m:-1).filter(m=>m>=0)}
function sc(s,y){const v={agua:s.ag[y||"normal"],suelo:s.suelo,erosion:s.ero,ingreso:s.ing};let W=0,t=0;OBJ.forEach(o=>{W+=S.w[o.k];t+=S.w[o.k]*v[o.k]});return{v,c:W?Math.round(t/W):null}}

/* ---------- Render ---------- */
/* [port] Persona 5: la hoja pasa a componentes (tabla de 4 columnas, calendario, cercanía). */
let LIST=[];
const ORD=[6,7,8,9,10,11,0,1,2,3,4,5];/* campaña: julio a junio, igual que la serie y el satélite */
const NUM={},BW={};let INTRO=false,introDrawn=false,introPending=false;
function segs(cal){const out=[];ORD.forEach((m,i)=>{const x=cal[m],l=out[out.length-1];if(l&&l.x===x)l.n++;else out.push({x,i,n:1})});return out}
function timelineHTML(s){const fr=m=>s.fr.includes(m),cf=m=>s.conf.includes(m);
  const ax=ORD.map(m=>`<span class="${fr(m)?"fr":""} ${cf(m)?"conf":""}" title="${MES[m]}${fr(m)?(CLIMA.real?` · helada en ${CLIMA.fr[m]} de ${CLIMA.n} años`:" · helada frecuente"):""}${cf(m)?" · cultivo sensible a la helada":""}">${M1[m]}</span>`).join("");
  const row=segs(s.cal).map(g=>{const bare=g.x==="barbecho",nm=g.x==="barbecho"?"Pelado":C[g.x].n,last=ORD[g.i+g.n-1];
    return`<span class="seg ${bare?"bare":""}" style="flex:${g.n}" title="${C[g.x].n}: ${MES[ORD[g.i]].toLowerCase()} a ${MES[last].toLowerCase()}">${nm}</span>`}).join("");
  let sat={row:"",cap:""};if(s.id==="actual"){const ok=SEEN.m.filter(v=>v).length,bare=SEEN.m.filter(v=>v&&v.mean<BAJO).length,done=SEEN.m.every(v=>v!==undefined);
    sat.row=`<div class="r"><div class="row2 sat" aria-label="Visto por satélite">${ORD.map(m=>{const v=SEEN.m[m];
      const bg=v===undefined?"var(--soft)":!v?"repeating-linear-gradient(135deg,var(--soft),var(--soft) 3px,var(--line) 3px,var(--line) 6px)":ndviCol(v.mean);
      return`<i style="background:${bg}" title="${MES[m]} ${campYear(m)}: ${v===undefined?"cargando…":v?`NDVI ${fmt(v.mean,2)} (${v.mean<BAJO?"pelado":"cubierto"}) · ${fmtDate(v.date)} · NASA HLS 30 m`:"sin foto sin nubes"}"></i>`}).join("")}</div></div>`;
      sat.cap=`<div class="satcap">${done?(ok?`<b>Visto por satélite ${CAMP_LAB}:</b> pelado ${bare} de ${ok} meses`:"Visto por satélite: sin datos"):"Visto por satélite: cargando…"}</div>`}
  return`<div class="tlw"><div class="tl"><div class="r"><div class="mx">${ax}</div></div><div class="r"><div class="row2" aria-label="Rotación">${row}</div></div>${sat.row}<span class="cur" style="--i:${ORD.indexOf(S.month)}"></span></div>${sat.cap}</div>`}
function moveCursor(){$$(".cur").forEach(e=>e.style.setProperty("--i",ORD.indexOf(S.month)))}
function tween(el,to){const id=el.dataset.id,from=NUM[id]??(INTRO?0:to);NUM[id]=to;if(from===to||matchMedia("(prefers-reduced-motion: reduce)").matches){el.textContent=to;return}
  const t0=performance.now(),d=INTRO?700:380;const step=t=>{const p=Math.min(1,(t-t0)/d),e=1-Math.pow(1-p,3);el.textContent=Math.round(from+(to-from)*e);if(p<1)requestAnimationFrame(step)};requestAnimationFrame(step)}
function colorOf(x){return css({verano:"--verano",invierno:"--invierno",cobertura:"--cobertura",barbecho:"--barbecho"}[C[x].g])}
function render(){/* Durante la entrada no se redibuja: se espera a que termine para no cortar la animación */
  if(INTRO&&introDrawn){introPending=true;return}if(INTRO)introDrawn=true;LIST=strategies();const act=LIST[0];$("#serie").innerHTML=serieHTML();
  const d=new Date();$("#sheet-meta").textContent=`${CLIMA.real?`Clima NASA POWER ${CLIMA.per}`:"Clima ilustrativo"} · pendiente ${S.slope!=null?fmt(S.slope,1)+" %":"—"} · ${d.toLocaleDateString("es-AR")}`;
  $("#cards").innerHTML=LIST.map(s=>{const col=css(SCOL[s.id]);
    if(!s.on)return`<div class="card off" style="--k:${LIST.indexOf(s)}"><div class="hd"><span class="badge" style="background:${col}">${s.k}</span><div><div class="nm">${s.name}</div><div class="spc">Descartada · ${s.why}</div></div></div></div>`;
    const r=sc(s),ys={seco:sc(s,"seco").c,normal:sc(s,"normal").c,humedo:sc(s,"humedo").c},sens=ys.humedo-ys.seco>=15;
    const dl=(v,b,good,u)=>{if(s.id==="actual")return`<span class="d eq">base</span>`;const x=v-b;const cls=x===0?"eq":((x>0)===good?"up":"dn");return`<span class="d ${cls}">${sgn(x)}${u}</span>`};
    const met=(l,v,b,good,u,color,txt)=>{const k=s.id+l;return`<div class="met"><span class="l">${l}</span><span class="bar"><i data-k="${k}" data-w="${v}" style="width:${BW[k]??(INTRO?0:v)}%;background:${color}"></i></span>${dl(v,b,good,u)}</div>`};
    const why=[];if(s.cov)why.push(`Cubre ${12-s.bare} meses el suelo`);if(s.cov==="vicia")why.push("La vicia fija nitrógeno");if(s.win)why.push("Suma un cultivo que se vende en invierno");if(s.ns)why.push(`${C[s.ns].n} corta el ciclo de plagas${s.ns==="sorgo"?" y tolera la sequía":""}`);if(s.id==="actual")why.push(`${s.bare} meses con el lote pelado`);
    const rev=[];if(s.ag.seco<40)rev.push("Poca reserva de agua en años secos");if(s.rep)rev.push("Repite el cultivo de la campaña pasada");if(s.cov==="vicia"&&S.anegable!=="no"&&S.anegable!=="no_se")rev.push("Lote que se encharca: riesgo de mala implantación");if(s.cov)rev.push("Secado ~30 días antes de la siembra");if(S.r.maq&&(s.id==="B"||s.id==="C"))rev.push("Requiere maquinaria para un cultivo nuevo");if(s.conf.length)rev.push("Cultivo sensible en meses con helada");
    const seenOk=SEEN.m.filter(v=>v).length,seenBare=SEEN.m.filter(v=>v&&v.mean<BAJO).length,seenDone=SEEN.m.every(v=>v!==undefined);
    if(s.id==="actual"&&seenDone&&seenOk>=8&&Math.abs(seenBare-s.bare)>=2)rev.push(`Lo que vio el satélite no coincide con la rotación cargada: ${seenBare} meses con el lote pelado en ${CAMP_LAB}, contra ${s.bare} según el calendario`);
    const falta=["Precios"];if(!S.mo)falta.push("Materia orgánica");if(S.textura==="no_se")falta.push("Textura");
    return`<button class="card" aria-pressed="${S.sel===s.id}" data-s="${s.id}" style="--k:${LIST.indexOf(s)}">
      <div class="hd"><span class="badge" style="background:${col}">${s.k}</span><div><div class="nm">${s.name}</div><div class="spc">${s.sp}</div></div></div>
      ${timelineHTML(s)}
      <div class="big"><span class="n" data-id="${s.id}" data-v="${r.c??""}">${r.c==null?"—":(NUM[s.id]??(INTRO?0:r.c))}</span><span class="u">% de cercanía<br>a tus objetivos</span></div>
      <div class="mets">${met("Agua",s.ag.normal,act.ag.normal,true," pts",css("--s-a"))}${met("Suelo",s.suelo,act.suelo,true," pts","#8a5c33")}${met("Erosión",s.ero,act.ero,true," pts","#c0531c")}${met("Ingreso",s.ing,act.ing,true," pts",css("--s-b"))}</div>
      <div class="yrs">${[["seco","Seco"],["normal","Normal"],["humedo","Húmedo"]].map(([t,l])=>`<div title="${tipoTitle(t)}"><b class="num">${ys[t]??"—"}</b><span><i class="dot" style="background:var(--${t})"></i>${l}</span></div>`).join("")}</div>
      ${sens?'<span class="tagw">Sensible al clima</span>':""}
      ${S.sel===s.id?`<div class="more"><div><b>Por qué aparece.</b> ${why.join(". ")}.</div><div><b>Revisar con el agrónomo.</b> ${rev.length?rev.join(". ")+".":"Sin alertas."}</div><div><b>Falta.</b> ${falta.join(", ")}.</div></div>`:""}
    </button>`}).join("");
  $("#lgd").innerHTML=`<span><i style="background:var(--cover)"></i>Con cultivo o cobertura</span><span><i style="background:var(--barbecho)"></i>Pelado</span><span><i style="background:color-mix(in srgb,var(--humedo) 35%,transparent)"></i>Mes con helada frecuente</span><span><i style="background:color-mix(in srgb,var(--ink) 18%,transparent)"></i>Mes del mapa</span><span>Fila fina: lo que vio el satélite (misma escala que el NDVI del mapa)</span>`;
  $$("#cards .seg").forEach(e=>e.classList.toggle("hide",e.scrollWidth>e.clientWidth+1));
  $$("#cards .big .n[data-v]").forEach(el=>{if(el.dataset.v!=="")tween(el,+el.dataset.v)});
  requestAnimationFrame(()=>requestAnimationFrame(()=>$$("#cards .met .bar i").forEach(b=>{b.style.width=b.dataset.w+"%";BW[b.dataset.k]=b.dataset.w})));
  clash();buildMail()}
$("#serie").addEventListener("mouseover",e=>{const b=e.target.closest("#bars i");if(b)serieOn(+b.dataset.i)});
$("#serie").addEventListener("click",e=>{const b=e.target.closest("#bars i");if(b)serieOn(+b.dataset.i)});
$("#serie").addEventListener("mouseleave",()=>serieOn(null));
$("#cards").addEventListener("click",e=>{const c=e.target.closest("[data-s]");if(!c)return;S.sel=c.dataset.s;render()});
function clash(){const on=LIST.slice(1).filter(s=>s.on),ws=OBJ.map(o=>({...o,w:S.w[o.k]})).sort((a,b)=>b.w-a.w),el=$("#clash");el.hidden=true;
  if(on.length<2||ws[1].w<4)return;const best=k=>on.reduce((a,s)=>sc(s).v[k]>sc(a).v[k]?s:a);const b1=best(ws[0].k),b2=best(ws[1].k);if(b1.id===b2.id)return;
  el.hidden=false;el.innerHTML=`<b>${ws[0].n} y ${ws[1].n.toLowerCase()} chocan en este lote.</b> En ${ws[0].n.toLowerCase()} queda más cerca ${b1.k}; en ${ws[1].n.toLowerCase()}, ${b2.k}. Ninguna cumple las dos.`}

/* ---------- Compartir ---------- */
function buildMail(){const c=center(S.poly);const L2=[`Field Shift · comparación de rotaciones (prototipo)`,`Lote: ${fmt(Math.abs(c[0]),4)} S, ${fmt(Math.abs(c[1]),4)} O · ${fmt(areaHa(S.poly))} ha · pendiente ${S.slope!=null?fmt(S.slope,1)+" %":"—"}`,`Objetivos: agua ${S.w.agua}, suelo ${S.w.suelo}, erosión ${S.w.erosion}, ingreso ${S.w.ingreso}`,""];
  LIST.forEach(s=>{if(!s.on){L2.push(`${s.k} ${s.name}: descartada (${s.why})`);return}const r=sc(s);L2.push(`${s.id==="actual"?"Actual":s.k} · ${s.name} (${s.sp}): cercanía ${r.c??"—"} % · ${s.bare} meses pelado · seco ${sc(s,"seco").c} / normal ${sc(s,"normal").c} / húmedo ${sc(s,"humedo").c}`)});
  {const ok=SEEN.m.filter(v=>v);if(ok.length)L2.push("",`Visto por satélite (NASA HLS, 30 m, campaña ${CAMP_LAB}): NDVI del lote menor a ${fmt(BAJO,1)} en ${ok.filter(v=>v.mean<BAJO).length} de ${ok.length} meses con escena sin nubes`)}
  if(SERIE.real){const c=SERIE.c,n=c.length,k=Math.min(10,Math.floor(n/3)),av=a=>fmt(avgOf(a.map(x=>x.mm)));
    L2.push("",`Lluvia por campaña (NASA POWER, ${CLIMA.per}): últimas ${k} ${av(c.slice(n-k))} mm de promedio · ${n-k} anteriores ${av(c.slice(0,n-k))} mm · año seco = hasta ${fmt(SERIE.maxSeco)} mm`)}
  L2.push("","Herramienta de apoyo: no reemplaza el criterio del productor ni del agrónomo.");S.mail=L2.join("\n");
  $("#mailto").href="mailto:?subject="+encodeURIComponent("Comparación de rotaciones · Field Shift")+"&body="+encodeURIComponent(S.mail)}
$("#share").addEventListener("click",()=>{$("#menu").hidden=!$("#menu").hidden});
$("#copy").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(S.mail);toast("Resumen copiado")}catch(_){toast("No se pudo copiar")}$("#menu").hidden=true});
$("#print").addEventListener("click",()=>{$("#menu").hidden=true;window.print()});
function toast(t){const el=$("#toast");el.textContent=t;el.classList.add("on");setTimeout(()=>el.classList.remove("on"),1800)}

/* ---------- Arranque ---------- */
/* [port] Intro con foto y nubes: las imágenes están en public/img (créditos en CREDITOS.txt). */
timeline();onLoteChange();
/* En el paso 1 el mapa espera atrás, más alejado, para volar al lote en el paso 2 */
setTimeout(()=>{map.invalidateSize();map.setView(center(S.poly),11,{animate:false})},60);
/* Nubes que se abren de forma natural: parches con la misma foto, alineados para formar un cielo continuo.
   Cada parche sale hacia su costado con distinta velocidad, demora y deriva vertical, y se disuelve al final. */
function buildSky(sky){if(!sky||!IMG.nubes)return;const W=sky.clientWidth,H=sky.clientHeight;
  let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  const cols=[8,24,40,56,72,88,100],rows=[18,58,95];
  cols.forEach(cx=>rows.forEach(cy=>{const w=W*.36,h=H*.92,x=W*cx/100-w/2,y=H*cy/100-h/2,d=document.createElement("div");d.className="cp";
    Object.assign(d.style,{left:x+"px",top:y+"px",width:w+"px",height:h+"px",backgroundImage:`url(${IMG.nubes})`,backgroundSize:`${W}px ${H}px`,backgroundPosition:`${-x}px ${-y}px`});sky.appendChild(d);
    const side=cx<50?-1:1,far=Math.abs(cx-50)/50,dx=side*(innerWidth*(.32+far*.38+rnd()*.18)),dy=(rnd()-.55)*innerHeight*.08,dur=2100+rnd()*900,del=150+(1-far)*120+rnd()*380;
    d.animate([{transform:"translate(0,0) scale(1)",opacity:1},{opacity:1,offset:.45},{transform:`translate(${dx}px,${dy}px) scale(${1.08+rnd()*.12})`,opacity:0}],
      {duration:dur,delay:del,easing:"cubic-bezier(.45,.05,.2,1)",fill:"both"})}))}
/* Intro: una vez por sesión; se saltea tocando, con una tecla o si la compu pide menos movimiento */
(function(){const el=$("#intro"),src=IMG.intro;let seen=false;try{seen=sessionStorage.getItem("fs-intro")==="1"}catch(e){}
  if(!el||!src||seen||matchMedia("(prefers-reduced-motion: reduce)").matches){el&&el.remove();return}
  const img=new Image();let gone=false;const end=()=>{if(gone)return;gone=true;try{sessionStorage.setItem("fs-intro","1")}catch(e){}el.classList.add("out");setTimeout(()=>el.remove(),720)};
  img.onload=()=>{el.querySelector(".ph").style.backgroundImage=`url(${src})`;el.hidden=false;buildSky(el.querySelector("#sky"));setTimeout(end,3500)};img.onerror=()=>el.remove();img.src=src;
  el.addEventListener("click",end);addEventListener("keydown",end,{once:true})})();
let rz=null;addEventListener("resize",()=>{placeLegend();clearTimeout(rz);rz=setTimeout(()=>focus(),200)});

}
