/**
 * El asesor, por el lado del navegador. Es una conversación: la persona
 * escribe, el asesor responde y va pidiendo un dato a la vez.
 *
 * LA REGLA: el modelo redacta, el MOTOR calcula. Las cifras que se ven abajo
 * —cuota, intereses, TCEA— salen de /api/simular, nunca del texto del modelo.
 * Por eso el resultado aparece en su propio bloque y no dentro del mensaje.
 */
(() => {
  const API = 'https://geekfinanciero-api.geekfinanciero.workers.dev';
  const $ = s => document.querySelector(s);
  const esc = t => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const nf = (n, d = 2) => new Intl.NumberFormat('es-PE',
    { minimumFractionDigits: d, maximumFractionDigits: d }).format(isFinite(n) ? n : 0);
  const soles = (n, d = 2) => 'S/ ' + nf(n, d);
  const meses2texto = m => {
    const a = Math.floor(m / 12), r = m % 12;
    const p = (n, s, pl) => n === 1 ? `1 ${s}` : `${n} ${pl}`;
    if (!a) return p(r, 'mes', 'meses');
    if (!r) return p(a, 'año', 'años');
    return `${p(a, 'año', 'años')} y ${p(r, 'mes', 'meses')}`;
  };
  const sesion = () => { try { return localStorage.getItem('gf-sesion'); } catch { return null; } };

  const EJEMPLOS = [
    'Pago 900 al mes por mi moto y no sé la tasa',
    'Debo 85 mil al 14 % a cinco años, y en julio me entra la grati',
    'Me quiero comprar un depa de 300 mil, doy 20 % de inicial',
  ];

  const charla = $('#charla'), texto = $('#texto'), enviar = $('#enviar'), salida = $('#salida');
  let historial = [], previo = {}, ocupado = false;

  /* ---------- la conversación ---------- */
  function pinta(rol, txt) {
    const d = document.createElement('div');
    d.className = 'msg ' + rol;
    d.innerHTML = esc(txt);
    charla.appendChild(d);
    d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return d;
  }
  const pensando = () => {
    const d = document.createElement('div');
    d.className = 'escribiendo';
    d.innerHTML = '<i></i><i></i><i></i>';
    charla.appendChild(d);
    d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return d;
  };

  function fichas(c, deducida) {
    const f = [];
    if (c.entidad) f.push([c.entidad, false]);
    if (c.precio > 0) {
      f.push([`Precio ${soles(c.precio, 0)}`, false]);
      if (c.inicialPct) f.push([`Inicial ${c.inicialPct} %`, false]);
    } else if (c.monto > 0) f.push([`Te prestan ${soles(c.monto, 0)}`, false]);
    if (c.tea > 0) f.push([`Tasa ${nf(c.tea, 2).replace(/,00$/, '')} %${deducida ? ' (deducida)' : ''}`, deducida]);
    if (c.meses > 0) f.push([`Plazo ${meses2texto(c.meses)}`, false]);
    if (c.cuota > 0) f.push([`Pagas ${soles(c.cuota)} al mes`, false]);
    if (c.extra > 0) f.push([`A capital ${soles(c.extra, 0)} en el mes ${c.mes || 6}`, false]);
    if (c.mensual > 0) f.push([`Extra ${soles(c.mensual, 0)} cada mes`, false]);
    if (!f.length) return '';
    return `<div class="fichas">${f.map(([t, d]) =>
      `<span class="${d ? 'deducida' : ''}">${esc(t)}</span>`).join('')}</div>`;
  }

  async function hablar(txt) {
    if (ocupado) return;
    ocupado = true; enviar.disabled = true;
    historial.push({ rol: 'yo', texto: txt });
    pinta('yo', txt);
    texto.value = ''; cuenta();
    const puntos = pensando();

    let d;
    try {
      const s = sesion();
      const r = await fetch(`${API}/api/asesor`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(s ? { authorization: 'Bearer ' + s } : {}) },
        body: JSON.stringify({ mensajes: historial.slice(-12), previo }),
      });
      d = await r.json();
    } catch (e) {
      d = { error: 'No pudimos conectar. Revisa tu conexión e inténtalo otra vez.' };
    }
    puntos.remove();
    ocupado = false; enviar.disabled = false;

    if (d?.error === 'entra_primero') return muro(401);
    if (d?.error === 'pago_requerido') return muro(402);
    if (!d || d.error) { pinta('mal', d?.error || 'Algo falló. Prueba otra vez.'); return; }

    historial.push({ rol: 'asesor', texto: d.respuesta });
    previo = d.campos;
    const msg = pinta('ia', d.respuesta);
    const f = fichas(d.campos, d.teaDeducida);
    if (f) msg.insertAdjacentHTML('beforeend', f);

    // Si dice que ya depositó, se le ofrece anotarlo. Se ofrece: lo confirma ella.
    if (d.registrar) msg.insertAdjacentHTML('beforeend', botonAnotar(d.registrar));

    if (d.listo) calcular(d.campos);
    else salida.innerHTML = '';
  }

  /* ---------- anotar un pago ya hecho ---------- */
  function botonAnotar(r) {
    return `<div class="anotar" data-credito="${r.creditoId}" data-monto="${r.monto}">
      <button type="button" class="anota">Anotarlo en «${esc(r.nombre)}»</button>
      <span class="pista">Queda en tu historial y lo tendré en cuenta la próxima vez.</span>
    </div>`;
  }

  charla.addEventListener('click', async ev => {
    const b = ev.target.closest('button.anota');
    if (!b) return;
    const caja = b.closest('.anotar');
    b.disabled = true; b.textContent = 'Anotando…';
    const s = sesion();
    try {
      const r = await fetch(`${API}/api/aportes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(s ? { authorization: 'Bearer ' + s } : {}) },
        body: JSON.stringify({ creditoId: +caja.dataset.credito, monto: +caja.dataset.monto,
                               mes: 1, nota: 'Anotado desde el asesor' }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        b.disabled = false; b.textContent = 'Anotarlo';
        caja.querySelector('.pista').textContent = d?.error === 'pago_requerido'
          ? 'El historial va con la suscripción.' : (d?.error || 'No se pudo anotar.');
        return;
      }
      caja.innerHTML = `<span class="anotado">Anotado. Llevas ${soles(d.total, 0)} a capital en
        «${esc(d.credito)}» — ${d.aportes.length} ${d.aportes.length === 1 ? 'vez' : 'veces'}.</span>`;
    } catch (e) {
      b.disabled = false; b.textContent = 'Anotarlo';
      caja.querySelector('.pista').textContent = 'No pudimos conectar.';
    }
  });

  /* ---------- el cálculo, que NO sale del modelo ---------- */
  async function calcular(c) {
    const principal = c.precio > 0
      ? Math.max(0, c.precio - c.precio * (c.inicialPct || 0) / 100 - (c.bono || 0))
      : c.monto;
    const base = {
      principal, tea: c.tea / 100, meses: c.meses, desg: 0.0052, portes: 0, seguroBien: 0,
      comision: 0, balon: 0, gracia: null, dobleCuota: false,
      inicio: { anio: new Date().getFullYear(), mes: new Date().getMonth() + 2 },
      puntuales: [], mensual: null, compra: null, modo: c.objetivo === 'cuota' ? 'cuota' : 'plazo',
    };
    let s;
    try {
      const r = await fetch(`${API}/api/simular`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ moneda: 'S/', base, plan: base }),
      });
      s = await r.json();
    } catch (e) { return; }
    if (!s?.gratis) return;

    const g = s.gratis, gap = g.tcea != null ? g.tcea - c.tea / 100 : NaN;
    const params = new URLSearchParams();
    if (c.precio > 0) {
      params.set('precio', c.precio);
      if (c.inicialPct) params.set('inicialPct', c.inicialPct);
      if (c.bono) params.set('bono', c.bono);
    } else params.set('monto', c.monto);
    params.set('tea', c.tea); params.set('meses', c.meses);
    if (c.extra) { params.set('extra', c.extra); params.set('mes', c.mes || 6); }
    if (c.mensual) params.set('mensual', c.mensual);
    params.set('modo', c.objetivo === 'cuota' ? 'cuota' : 'plazo');

    salida.innerHTML = `
      <div class="cifras">
        <div class="cifra alta"><span class="k">Tu cuota</span><span class="v">${soles(g.cuota)}</span></div>
        <div class="cifra"><span class="k">Pagarás en total</span><span class="v">${soles(g.desembolso, 0)}</span></div>
        <div class="cifra"><span class="k">De eso, intereses</span><span class="v">${soles(g.totalInteres, 0)}</span></div>
        <div class="cifra"><span class="k">Tu costo real (TCEA)</span>
          <span class="v">${g.tcea != null ? nf(g.tcea * 100, 2) + ' %' : '—'}</span></div>
      </div>
      ${isFinite(gap) && gap > 0.0005 ? `<p style="font-size:.92rem;color:var(--ink-2);margin:0 0 4px">
        Tu costo real va <b>${nf(gap * 100, 2)} puntos por encima</b> de la tasa: eso es el
        desgravamen y los gastos. Es la cifra con la que se comparan bancos.</p>` : ''}
      <div class="siguiente">
        <h2>${(c.extra > 0 || c.mensual > 0)
          ? 'Cuánto te ahorras con eso' : '¿Y si pudieras pagar algo a capital?'}</h2>
        <p>${(c.extra > 0 || c.mensual > 0)
          ? 'Ya sé lo que puedes poner. El número —cuánto te ahorras y cuántos meses te quitas— está en el simulador.'
          : 'Aunque sea la gratificación de un año. El simulador te dice cuánto se acorta y cuánto dejas de pagar.'}</p>
        <a class="boton" href="/?${params.toString()}">Verlo en el simulador →</a>
        <a class="suave" href="/preguntas.html">O leer cómo funciona</a>
      </div>`;
  }

  /* ---------- la puerta: el asesor va con la suscripción ---------- */
  const MUESTRA = [
    ['yo', 'pago 900 al mes por mi moto y no sé la tasa'],
    ['ia', 'Perfecto, con la cuota mensual puedo deducir la tasa. Dime cuánto te prestaron '
         + '—o cuánto debes hoy— y con eso la calculo.'],
    ['yo', 'es del bcp y me faltan 2 años'],
    ['ia', 'Anotado: BCP, dos años por delante. Me falta solo el monto. Está en tu estado de '
         + 'cuenta o en la app del banco.'],
    ['yo', 'me prestaron 20 mil'],
    ['ia', 'Listo. Con esos tres datos deduje tu tasa y abajo tienes tu cuota, tus intereses y '
         + 'tu costo real.'],
  ];

  function muro(motivo) {
    charla.innerHTML = '';
    MUESTRA.forEach(([r, t]) => { const d = pinta(r === 'yo' ? 'yo' : 'ia', t); d.style.opacity = '.55'; });
    document.querySelector('.caja').style.display = 'none';
    document.getElementById('ejemplos').style.display = 'none';
    salida.innerHTML = `
      <div class="siguiente">
        <h2>El asesor va con la suscripción</h2>
        <p>Arriba tienes una conversación de verdad, para que veas de qué va. Con la suscripción
        hablas tú: te deduce la tasa desde tu cuota, reconoce tu banco, y se acuerda de tus
        créditos y de lo que ya pagaste a capital.</p>
        <p style="font-size:.92rem;color:var(--ink-2)"><b>El simulador sigue siendo gratis</b> —
        tu cuota, tus intereses y tu costo real, sin cuenta.</p>
        <a class="boton" href="/">${motivo === 401 ? 'Crear mi cuenta' : 'Suscribirme'} →</a>
        <a class="suave" href="/preguntas.html">O leer cómo funciona</a>
      </div>`;
  }

  /* ---------- arranque ---------- */
  const cuenta = () => { $('#cuenta').textContent = `${texto.value.length} / 700`; };
  texto.addEventListener('input', cuenta);
  texto.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const t = texto.value.trim(); if (t) hablar(t); }
  });
  enviar.addEventListener('click', () => { const t = texto.value.trim(); if (t) hablar(t); });

  $('#ejemplos').innerHTML = EJEMPLOS.map((e, i) =>
    `<button type="button" data-i="${i}">${esc(e.length > 52 ? e.slice(0, 52) + '…' : e)}</button>`).join('');
  $('#ejemplos').addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (b) hablar(EJEMPLOS[+b.dataset.i]);
  });

  // Si ya entró con su cuenta, el asesor abre saludándola por su nombre.
  (async () => {
    cuenta();
    const s = sesion();
    if (!s) return muro(401);
    try {
      const r = await fetch(`${API}/api/yo`, { headers: { authorization: 'Bearer ' + s } });
      const yo = await r.json();
      if (!yo?.activo) return muro(402);
      const nombre = yo?.correo ? yo.correo.split('@')[0].split(/[._-]/)[0] : null;
      const n = nombre ? nombre.charAt(0).toUpperCase() + nombre.slice(1) : null;
      if (n) $('#saludo').innerHTML = `Hola, ${esc(n)}.<br>Cuéntame en qué estás.`;
      pinta('ia', n
        ? `Hola ${n}. ¿Qué miramos hoy? Puedes contarme un crédito nuevo, o decirme algo como `
          + '«hoy deposité tres mil» y te digo cómo queda.'
        : 'Hola. Cuéntame de tu crédito con tus palabras.');
    } catch (e) {
      pinta('ia', 'Hola. Cuéntame de tu crédito con tus palabras.');
    }
  })();
})();
