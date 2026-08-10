/* El plan de ataque. Toda la matemática vive en el servidor: aquí solo se
   recogen los datos y se pinta el texto que ya viene redactado. */
'use strict';
const API = 'https://geekfinanciero-api.geekfinanciero.workers.dev';
const $ = s => document.querySelector(s);
const nf = n => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 }).format(n || 0);

/* Ejemplos que se parecen a la vida real, para que nadie empiece en blanco. */
const SEMILLA = [
  { nombre: 'Tarjeta de crédito', saldo: 8000, tea: 62, cuota: 400 },
  { nombre: 'Préstamo personal', saldo: 15000, tea: 28, cuota: 600 },
];

function fila(d = {}) {
  const n = document.createElement('div');
  n.className = 'deuda';
  n.innerHTML = `
    <div class="campo nom">
      <label>¿Qué deuda es?</label>
      <input type="text" class="f-nombre" maxlength="40" placeholder="Tarjeta BCP">
    </div>
    <div class="campo">
      <label>Cuánto debes</label>
      <input type="number" class="f-saldo" min="0" step="100" inputmode="decimal">
    </div>
    <div class="campo">
      <label>Tasa anual (TEA)</label>
      <input type="number" class="f-tea" min="0" step="0.1" inputmode="decimal" placeholder="¿no la sabes?">
    </div>
    <div class="campo">
      <label>Pagas al mes</label>
      <input type="number" class="f-cuota" min="0" step="10" inputmode="decimal">
    </div>
    <button type="button" class="quitar" title="Quitar esta deuda" aria-label="Quitar esta deuda">× Quitar</button>`;
  n.querySelector('.f-nombre').value = d.nombre || '';
  n.querySelector('.f-saldo').value = d.saldo ?? '';
  n.querySelector('.f-tea').value = d.tea ?? '';
  n.querySelector('.f-cuota').value = d.cuota ?? '';
  n.querySelector('.quitar').addEventListener('click', () => { n.remove(); cuenta(); });
  return n;
}

function cuenta() {
  const n = document.querySelectorAll('.deuda').length;
  $('#cuenta').textContent = n < 2
    ? 'Hacen falta al menos dos deudas para que haya un orden que elegir.'
    : `${n} deudas`;
  $('#calcular').disabled = n < 2;
}

function recoge() {
  return [...document.querySelectorAll('.deuda')].map(f => {
    const v = c => f.querySelector(c).value.trim();
    const tea = parseFloat(v('.f-tea'));
    const d = {
      nombre: v('.f-nombre') || 'Sin nombre',
      saldo: parseFloat(v('.f-saldo')) || 0,
      cuota: parseFloat(v('.f-cuota')) || 0,
    };
    // Sin tasa no se descarta: si hay cuota y saldo, el servidor la deduce
    // suponiendo el plazo que queda. Es lo que nadie más hace.
    if (isFinite(tea) && tea > 0) d.tea = tea / 100;
    else d.meses = 24;
    return d;
  }).filter(d => d.saldo > 0 && d.cuota > 0);
}

const lista = (arr, marca) => arr.map(x => `<li>${x}</li>`).join('');

function pinta(r) {
  const z = $('#salida');
  if (r.error) {
    z.innerHTML = `<div class="mal">${r.mensaje || 'No pude armar el plan con esos datos.'}</div>`;
    return;
  }
  const g = r.gratis;
  const iguales = JSON.stringify(g.ordenAvalancha) === JSON.stringify(g.ordenNieve);
  let h = `<p class="titular">${g.titular}</p>`;

  // Las listas son el orden en que se ATACA, no en que mueren. Una deuda
  // puede morir sola con su propia cuota sin que le toque nunca el extra:
  // si no se dice, parece que se nos olvidó.
  const solas = ord => (g.caenAvalancha || []).filter(x => !ord.includes(x));
  const nota = ord => {
    const s = solas(ord);
    return s.length
      ? `<div class="cifra">${s.length === 1 ? `<b>${s[0]}</b> se acaba sola` : `<b>${s.join('</b> y <b>')}</b> se acaban solas`}
         con su propia cuota: no hace falta echarle nada.</div>`
      : '';
  };
  if (g.ordenAvalancha.length) {
    h += '<div class="caminos">';
    h += `<div class="camino gana">
            <h3>Si quieres ahorrar más</h3>
            <p class="sub">Échale el extra en este orden</p>
            <ol>${lista(g.ordenAvalancha)}</ol>
            ${g.mesesAvalancha ? `<div class="cifra">Libre en <b>${g.mesesAvalancha} meses</b>${
              g.ahorro ? ` · ahorras <b>S/ ${nf(g.ahorro)}</b>` : ''}</div>` : ''}
            ${nota(g.ordenAvalancha)}
          </div>`;
    if (!iguales) {
      h += `<div class="camino">
              <h3>Si quieres verlo avanzar</h3>
              <p class="sub">Primero la más chica, para tacharla ya</p>
              <ol>${lista(g.ordenNieve)}</ol>
              ${g.diferencia != null ? `<div class="cifra">Te cuesta <b>S/ ${nf(g.diferencia)}</b> más</div>` : ''}
              ${nota(g.ordenNieve)}
            </div>`;
    }
    h += '</div>';
  }

  for (const v of g.veredicto || []) {
    h += `<div class="tarj ${v.tono === 'warn' ? 'warn' : ''}">
            <span class="mk">${v.mark}</span>
            <span><b>${v.titulo}.</b> ${v.texto}</span>
          </div>`;
  }

  if (g.deducidas && g.deducidas.length) {
    h += `<div class="tarj"><span class="mk">i</span><span>No pusiste la tasa de
          <b>${g.deducidas.join('</b>, <b>')}</b>, así que la deduje desde lo que pagas al mes
          suponiendo dos años por delante. Si sabes el plazo real, ajústalo y afina la cifra.</span></div>`;
  }

  if (r.pro && r.plan) {
    h += `<div class="tarj"><span class="mk">✓</span><span><b>Tu plan mes a mes.</b>
          ${r.plan.hitos.map(x => x.texto).join(' ')}</span></div>`;
    if (r.cartas) {
      h += `<div class="tarj"><span class="mk">§</span><span><b>Cómo pedirlo en ventanilla.</b>
            ${r.cartas.aviso}<br><br>«${r.cartas.frase}»</span></div>`;
    }
  } else {
    h += `<div class="muro">
            <h2>El orden ya lo tienes. Lo que sigue es ejecutarlo</h2>
            <p>Arriba está gratis lo que nadie más te da: por cuál empezar y cuánto te ahorras.
            Con la suscripción va lo que se hace cada mes:</p>
            <ul>
              <li>El plan mes a mes: a cuál echarle el extra y cuándo cambia de objetivo</li>
              <li>La carta para ventanilla, con las palabras exactas de la Ley 28587</li>
              <li>Aviso cuando llegue la grati o el CTS, con cuánto adelantarías</li>
              <li>Guardar tus deudas y ver cómo bajan de verdad</li>
            </ul>
            <a class="boton" href="/#suscribirme">Ver la suscripción</a>
          </div>`;
  }
  z.innerHTML = h;
  z.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function calcular() {
  const deudas = recoge();
  if (deudas.length < 2) {
    $('#salida').innerHTML = '<div class="mal">Pon al menos dos deudas con saldo y cuota.</div>';
    return;
  }
  $('#calcular').disabled = true;
  $('#salida').innerHTML = '<p class="pensando">Armando el plan…</p>';
  try {
    const res = await fetch(`${API}/api/deudas`, {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ moneda: 'S/', extra: parseFloat($('#extra').value) || 0, deudas }),
    });
    pinta(await res.json());
  } catch (e) {
    $('#salida').innerHTML = '<div class="mal">No se pudo calcular. Revisa tu conexión y vuelve a intentarlo.</div>';
  }
  $('#calcular').disabled = false;
}

for (const d of SEMILLA) $('#lista').appendChild(fila(d));
cuenta();
$('#add').addEventListener('click', () => { $('#lista').appendChild(fila()); cuenta(); });
$('#calcular').addEventListener('click', calcular);
