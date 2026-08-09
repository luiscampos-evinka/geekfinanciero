/**
 * El asistente, por el lado del navegador.
 *
 * Hace dos llamadas y nada más: /api/entender traduce la frase a campos, y
 * /api/simular calcula. Las cifras NUNCA salen del modelo de lenguaje —solo
 * los campos—, así que no puede inventarse un ahorro. Y lo que se enseña aquí
 * es la parte gratuita: cuota, intereses y TCEA. El ahorro por pagar a capital
 * sigue detrás de la suscripción, igual que en el simulador.
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

  const EJEMPLOS = [
    'Debo 85 mil al 14 % a cinco años y en julio me entra la grati, unos 8 mil',
    'Me quiero comprar un depa de 300 mil, doy 20 % de inicial y me dan 12.5 a 20 años',
    'Tengo el auto en 60 mil a 16 % en 4 años y puedo poner 500 soles extra cada mes',
  ];

  const texto = $('#texto'), enviar = $('#enviar'), salida = $('#salida');

  $('#ejemplos').innerHTML = EJEMPLOS.map((e, i) =>
    `<button type="button" data-i="${i}">${esc(e.length > 52 ? e.slice(0, 52) + '…' : e)}</button>`).join('');
  $('#ejemplos').addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    texto.value = EJEMPLOS[+b.dataset.i];
    cuenta(); texto.focus(); calcular();
  });

  const cuenta = () => { $('#cuenta').textContent = `${texto.value.length} / 600`; };
  texto.addEventListener('input', cuenta);
  texto.addEventListener('keydown', e => {
    // Enter envía; Mayúsculas+Enter hace salto de línea, como en cualquier chat.
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); calcular(); }
  });
  enviar.addEventListener('click', calcular);

  const pensando = t => { salida.innerHTML = `<div class="pensando"><i></i>${esc(t)}</div>`; };
  const fallo = t => { salida.innerHTML = `<div class="mal">${esc(t)}</div>`; };

  async function calcular() {
    const t = texto.value.trim();
    if (t.length < 4) return fallo('Cuéntame un poco más: cuánto debes, a qué tasa y en cuántos meses.');
    enviar.disabled = true;
    pensando('Leyendo lo que escribiste…');

    let d;
    try {
      const r = await fetch(`${API}/api/entender`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texto: t }),
      });
      d = await r.json();
    } catch (e) {
      enviar.disabled = false;
      return fallo('No pudimos conectar. Revisa tu conexión e inténtalo otra vez.');
    }
    enviar.disabled = false;
    if (!d || d.error) return fallo(d?.error || 'No te entendí. Prueba de otra forma.');

    const c = d.campos;
    if (d.faltan && d.faltan.length) {
      salida.innerHTML = `
        <div class="entendi">${c.resumen ? esc(c.resumen) + '<br><br>' : ''}
          Para calcularlo me falta <b>${d.faltan.map(esc).join('</b>, <b>')}</b>.
          Añádelo a tu frase y vuelve a darle.</div>`;
      return;
    }

    pensando('Calculando con el motor…');
    const base = c.precio > 0
      ? { principal: Math.max(0, c.precio - c.precio * (c.inicialPct || 0) / 100 - (c.bono || 0)) }
      : { principal: c.monto };
    Object.assign(base, {
      tea: c.tea / 100, meses: c.meses, desg: 0.0052, portes: 0, seguroBien: 0,
      comision: 0, balon: 0, gracia: null, dobleCuota: false,
      inicio: { anio: new Date().getFullYear(), mes: new Date().getMonth() + 2 },
      puntuales: [], mensual: null, compra: null, modo: c.objetivo === 'cuota' ? 'cuota' : 'plazo',
    });

    let s;
    try {
      const r = await fetch(`${API}/api/simular`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ moneda: 'S/', base, plan: base }),
      });
      s = await r.json();
    } catch (e) { return fallo('No pudimos calcular ahora mismo. Inténtalo otra vez.'); }
    if (!s || !s.gratis) return fallo('No pudimos calcular ahora mismo. Inténtalo otra vez.');

    pinta(c, s.gratis);
  }

  function pinta(c, g) {
    const chip = (k, v) => v == null || v === 0 ? '' : `<span>${esc(k)}: ${esc(v)}</span>`;
    const params = new URLSearchParams();
    if (c.precio > 0) {
      params.set('precio', c.precio);
      if (c.inicialPct) params.set('inicialPct', c.inicialPct);
      if (c.bono) params.set('bono', c.bono);
    } else {
      params.set('monto', c.monto);
    }
    params.set('tea', c.tea);
    params.set('meses', c.meses);
    if (c.extra) { params.set('extra', c.extra); params.set('mes', c.mes || 6); }
    if (c.mensual) params.set('mensual', c.mensual);
    params.set('modo', c.objetivo === 'cuota' ? 'cuota' : 'plazo');

    const puedeAdelantar = c.extra > 0 || c.mensual > 0;
    const gap = g.tcea != null ? g.tcea - c.tea / 100 : NaN;

    salida.innerHTML = `
      <div class="entendi">
        <b>Esto es lo que entendí.</b> ${esc(c.resumen || '')}
        <div class="campos">
          ${chip(c.precio > 0 ? 'Precio del bien' : 'Te prestan', soles(c.precio > 0 ? c.precio : c.monto, 0))}
          ${chip('Inicial', c.inicialPct ? c.inicialPct + ' %' : null)}
          ${chip('Tasa anual', c.tea + ' %')}
          ${chip('Plazo', meses2texto(c.meses))}
          ${chip('A capital', c.extra ? `${soles(c.extra, 0)} en el mes ${c.mes || 6}` : null)}
          ${chip('Cada mes', c.mensual ? soles(c.mensual, 0) : null)}
        </div>
      </div>

      <div class="cifras">
        <div class="cifra alta"><span class="k">Tu cuota</span>
          <span class="v">${soles(g.cuota)}</span></div>
        <div class="cifra"><span class="k">Pagarás en total</span>
          <span class="v">${soles(g.desembolso, 0)}</span></div>
        <div class="cifra"><span class="k">De eso, intereses</span>
          <span class="v">${soles(g.totalInteres, 0)}</span></div>
        <div class="cifra"><span class="k">Tu costo real (TCEA)</span>
          <span class="v">${g.tcea != null ? nf(g.tcea * 100, 2) + ' %' : '—'}</span></div>
      </div>

      ${isFinite(gap) && gap > 0.0005 ? `<p style="font-size:.92rem;color:var(--ink-2);margin:0 0 4px">
        Tu costo real está <b>${nf(gap * 100, 2)} puntos por encima</b> de la tasa que te ofrecieron:
        eso es el desgravamen y los gastos. Es la cifra con la que hay que comparar bancos.</p>` : ''}

      <div class="siguiente">
        <h2>${puedeAdelantar
          ? 'Ahora la pregunta cara: cuánto te ahorras'
          : '¿Y si pudieras pagar algo a capital?'}</h2>
        <p>${puedeAdelantar
          ? 'Ya sé lo que puedes poner. Lo que falta es el número: cuánto te ahorras en intereses, cuántos meses te quitas de encima y si te conviene bajar la cuota o terminar antes.'
          : 'Aunque sea la gratificación de un año. Con eso el crédito se acorta y los intereses caen. El simulador te dice cuánto, con tus cifras.'}</p>
        <a class="boton" href="/?${params.toString()}">Verlo en el simulador →</a>
        <a class="suave" href="/preguntas.html">O leer cómo funciona</a>
      </div>`;
  }

  cuenta();
})();
