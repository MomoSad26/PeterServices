/* =========================================================================
   PREFERENCIAS VISUALES (modo oscuro y color principal)
   Se carga en el <head>, ANTES de pintar la pantalla, para que no haya un
   "flash" del tema equivocado al abrir la app.
   Las preferencias son de este dispositivo: se guardan en localStorage con
   su propia clave y NO forman parte de la base de datos ni del respaldo.
   ========================================================================= */
const PREFS_KEY = 'remesas_prefs_v1';

/* Cada paleta define sus tonos: 900 (más oscuro), 800 (principal: barra
   superior y botones), 700 (medio), 300 (acento claro, para textos en modo
   oscuro) y 100 (fondo suave de avatares y etiquetas en modo claro). */
const PALETAS = {
  teal:     {nombre:'Teal',          900:'#0A2E2F', 800:'#0F3D3E', 700:'#155052', 300:'#7FB8B5', 100:'#E4EFEE'},
  azul:     {nombre:'Azul',          900:'#0F1E4A', 800:'#1E3A8A', 700:'#2A4DAB', 300:'#93A8E0', 100:'#DBE5F5'},
  verde:    {nombre:'Verde',         900:'#082E1A', 800:'#14532D', 700:'#1F7A44', 300:'#7CC596', 100:'#D6EAD9'},
  morado:   {nombre:'Morado',        900:'#2A0F55', 800:'#4C1D95', 700:'#6335B0', 300:'#B39DE0', 100:'#E5DBF3'},
  rojo:     {nombre:'Rojo',          900:'#3F0F0F', 800:'#7F1D1D', 700:'#9F2828', 300:'#E39A9A', 100:'#F1D6D6'},
  dorado:   {nombre:'Dorado',        900:'#3D1F05', 800:'#78350F', 700:'#9A5A1F', 300:'#E0AE7A', 100:'#EDDDC8'},
  gris:     {nombre:'Gris oscuro',   900:'#0F172A', 800:'#1F2937', 700:'#374151', 300:'#A7B0BD', 100:'#E1E5EB'},
  petroleo: {nombre:'Azul petróleo', 900:'#083A45', 800:'#0E7490', 700:'#1596B4', 300:'#7DCBE0', 100:'#D2E9EF'},
};

function leerPrefs(){
  let p = {};
  try{ p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; }catch(e){ p = {}; }
  return {
    modo_oscuro: !!p.modo_oscuro,
    color_principal: PALETAS[p.color_principal] ? p.color_principal : 'teal',
  };
}

function guardarPrefs(prefs){
  try{ localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }catch(e){}
}

function aplicarModoOscuro(activo){
  document.documentElement.setAttribute('data-theme', activo ? 'dark' : 'light');
  avisarColorBarraEstado();
}

function aplicarColorPrincipal(nombre){
  const p = PALETAS[nombre] || PALETAS.teal;
  const root = document.documentElement;
  root.style.setProperty('--teal-900', p[900]);
  root.style.setProperty('--teal-800', p[800]);
  root.style.setProperty('--teal-700', p[700]);
  root.style.setProperty('--teal-300', p[300]);
  root.style.setProperty('--teal-100', p[100]);
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', p[800]);
  avisarColorBarraEstado();
}

/* En la APK de Android, la franja de la barra de estado la pinta la app
   nativa: se le avisa del color de la barra superior para que coincidan. */
function avisarColorBarraEstado(){
  try{
    if(window.AndroidBridge && window.AndroidBridge.setThemeColor){
      const p = PALETAS[leerPrefs().color_principal];
      window.AndroidBridge.setThemeColor(p[800]);
    }
  }catch(e){}
}

(function aplicarPrefsAlIniciar(){
  const prefs = leerPrefs();
  aplicarModoOscuro(prefs.modo_oscuro);
  aplicarColorPrincipal(prefs.color_principal);
})();
