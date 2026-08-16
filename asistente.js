/**
 * El asesor, por el lado del navegador. Es una conversación: la persona
 * escribe, el asesor responde y va pidiendo un dato a la vez.
 *
 * LA REGLA: el modelo redacta, el MOTOR calcula. Las cifras que se ven abajo
 * —cuota, intereses, TCEA— llegan ya resueltas en `resultado`, dentro de la
 * misma respuesta de /api/asesor: el motor las calculó en el servidor y el
 * asesor las leyó antes de escribir. El navegador no vuelve a calcular nada,
 * solo pinta lo que llegó. Por eso el resultado aparece en su propio bloque
 * y no dentro del mensaje.
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

  /* El último cálculo pintado, con la FIRMA del caso al que pertenece. El panel
     era de un solo turno: preguntar «¿y qué es la TCEA?» lo borraba, porque
     `resultado` solo llega en los turnos en que el asesor llama a la
     herramienta. Ahora se queda mientras la conversación siga siendo del mismo
     crédito, y se va en cuanto deja de serlo: unas cifras de otro crédito
     debajo de la respuesta son peores que ninguna. */
  let ultimo = null;

  /** Qué crédito es este: el principal, la tasa y el plazo. Si cambia alguno,
   *  las cifras de arriba ya no son de esta conversación. */
  function firma(c) {
    if (!c) return '';
    const principal = c.precio > 0
      ? Math.max(0, c.precio - c.precio * (c.inicialPct || 0) / 100 - (c.bono || 0))
      : c.monto;
    return [principal || 0, c.tea || 0, c.meses || 0].join('|');
  }

  /* ---------- la conversación ---------- */
  function mensaje(rol, txt) {
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
    mensaje('yo', txt);
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
    if (!d || d.error) {
      /* El aviso salía y el panel se quedaba intacto justo debajo, así que las
         cifras del turno anterior parecían la respuesta a lo que acababa de
         fallar. No se borran —son suyas y siguen siendo ciertas—: se dice de
         cuándo son. */
      mensaje('mal', d?.error || 'Algo falló. Prueba otra vez.');
      marcaComoPrevio();
      return;
    }

    historial.push({ rol: 'asesor', texto: d.respuesta });
    /* `previo` es la memoria de la conversación, y `teaDeducida` va dentro: sin
       ella, el servidor no puede saber que la tasa que el modelo manda como
       dato es la que dedujimos nosotros del recibo, y el aviso de «esto es una
       estimación» desaparecía a partir del segundo turno. */
    previo = { ...d.campos, teaDeducida: d.teaDeducida === true };
    const msg = mensaje('ia', d.respuesta);
    const f = fichas(d.campos, d.teaDeducida);
    if (f) msg.insertAdjacentHTML('beforeend', f);

    // Si dice que ya depositó, se le ofrece anotarlo. Se ofrece: lo confirma ella.
    if (d.registrar) msg.insertAdjacentHTML('beforeend', botonAnotar(d.registrar));

    if (d.resultado) pinta(d.resultado, d.campos);
    else if (ultimo && firma(d.campos) === ultimo.firma) marcaComoPrevio();
    else { salida.innerHTML = ''; ultimo = null; }
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

  /** Marca el panel como lo que es cuando el turno no trajo cálculo: las cifras
   *  del último que sí lo trajo. Se pone una sola vez. */
  function marcaComoPrevio() {
    if (!ultimo || salida.dataset.previo === '1') return;
    salida.dataset.previo = '1';
    salida.insertAdjacentHTML('afterbegin',
      '<p class="dePrevio">Estas cifras son de tu último cálculo.</p>');
  }

  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
  // El costo real solo se conoce si la TIR convergió: el motor manda null si no,
  // y un «0.00 %» ahí es una cifra falsa, no un dato que falta.
  const tcea = v => v == null ? '—' : nf(v * 100, 2) + ' %';

  /** El titular de la comparación. Un ahorro NEGATIVO no es un ahorro: es lo
   *  que esa oferta te cuesta de más, y se dice con esas palabras y con ese
   *  color. La mitad de las veces que alguien trae una oferta, esta es la
   *  respuesta correcta. */
  function titular(r) {
    if (r.ahorro == null) return '';
    if (r.hayCompra) {
      if (r.ahorro > 0) {
        return ['bien', `<b>Con la compra de deuda te ahorras ${soles(r.ahorro, 0)}</b> en intereses` +
          (r.mesesMenos > 0 ? ` y terminas ${plural(r.mesesMenos, 'mes', 'meses')} antes` : '') + '.'];
      }
      if (r.ahorro < 0) {
        return ['malo', `<b>Esta oferta te cuesta ${soles(-r.ahorro, 0)} más</b> en intereses que el ` +
          'crédito que ya tienes' +
          (r.mesesMenos < 0 ? `, y encima terminas de pagar ${plural(-r.mesesMenos, 'mes', 'meses')} después` : '') +
          '.'];
      }
      return ['neutro', '<b>Con esa oferta acabas pagando prácticamente lo mismo.</b> ' +
        'El cambio no te ahorra nada.'];
    }
    if (r.ahorro > 0) {
      return ['bien', `<b>Con ese pago a capital te ahorras ${soles(r.ahorro, 0)}</b> en intereses` +
        (r.mesesMenos > 0 ? ` y terminas ${plural(r.mesesMenos, 'mes', 'meses')} antes` : '') + '.'];
    }
    return '';
  }

  /** El enlace al simulador, con el caso ya cargado. Es el único puente del
   *  asesor al cronograma mes a mes, y la salida cuando el asesor no alcanza. */
  function enlaceSimulador(c) {
    const p = new URLSearchParams();
    if (c.precio > 0) {
      p.set('precio', c.precio);
      if (c.inicialPct) p.set('inicialPct', c.inicialPct);
      if (c.bono) p.set('bono', c.bono);
    } else if (c.monto > 0) p.set('monto', c.monto);
    if (c.tea > 0) p.set('tea', c.tea);
    if (c.meses > 0) p.set('meses', c.meses);
    if (c.extra > 0) { p.set('extra', c.extra); p.set('mes', c.mes || 6); }
    if (c.mensual > 0) p.set('mensual', c.mensual);
    p.set('modo', c.objetivo === 'cuota' ? 'cuota' : 'plazo');
    return '/?' + p.toString();
  }

  /* Ya no calcula nada: el motor lo hizo en el servidor y el asesor lo leyó
     antes de responder. Aquí solo se muestra. */
  function pinta(r, c) {
    const avisos = [];
    // Una tasa deducida NO es la que dio el banco. Decirlo no es un detalle:
    // es la diferencia entre una estimación y un dato, y quien decide sobre
    // 45 mil soles merece saber cuál de las dos está mirando.
    if (r.teaDeducida) {
      avisos.push(`La tasa de <b>${nf(r.teaUsada, 2)} %</b> es una estimación a partir de lo que pagas al mes, no la que te dio el banco.`);
    }
    if (r.montoUsado != null && r.montoUsado > 0) {
      avisos.push(`Calculado sobre un préstamo de <b>${soles(r.montoUsado, 0)}</b>.`);
    }
    const nota = avisos.length ? `<div class="entendi">${avisos.join(' ')}</div>` : '';

    const t = titular(r);
    const comparacion = t ? `<div class="entendi ${t[0]}">${t[1]}</div>` : '';

    /* Las cuatro cifras son las del crédito que queda DESPUÉS —con la compra de
       deuda, si la hay—, y debajo de cada una, lo que era antes. Estas cuatro
       salían siempre del crédito SIN la compra: bajo el titular «te ahorras
       694» se pintaban los números del crédito que la persona ya tenía. */
    const a = r.antes;
    const cifra = (k, v, previa, alta) =>
      `<div class="cifra${alta ? ' alta' : ''}"><span class="k">${k}</span>` +
      `<span class="v">${v}</span>${previa ? `<span class="antes">antes ${previa}</span>` : ''}</div>`;
    const cambia = (x, y) => a && Math.abs(x - y) > 0.5;

    const cuotaTitulo = r.hayCompra ? 'Tu cuota con la compra'
      : r.objetivoUsado === 'cuota' ? 'Tu cuota, ya con el abono' : 'Tu cuota';
    const cifras =
      cifra(cuotaTitulo, soles(r.cuota), cambia(a && a.cuota, r.cuota) && soles(a.cuota), true) +
      cifra('Pagarás en total', soles(r.total, 0), cambia(a && a.total, r.total) && soles(a.total, 0)) +
      cifra('De eso, intereses', soles(r.intereses, 0), cambia(a && a.intereses, r.intereses) && soles(a.intereses, 0)) +
      cifra('Tu costo real (TCEA)', tcea(r.tcea),
        a && a.tcea != null && r.tcea != null && Math.abs(a.tcea - r.tcea) > 0.0001 && tcea(a.tcea));

    const plazo = a && a.meses !== r.meses
      ? `<p class="plazo">El crédito pasa de <b>${meses2texto(a.meses)}</b> a <b>${meses2texto(r.meses)}</b>.</p>`
      : '';

    /* La brecha entre la TCEA y la tasa: es el desgravamen y los gastos, y es
       lo único con lo que se comparan dos ofertas de verdad. Con una compra de
       deuda no se enseña: ahí la TCEA es la del crédito nuevo y la tasa que
       tenemos delante es la del viejo, así que la resta no significa nada. */
    const brecha = !r.hayCompra && r.tcea != null && r.teaUsada > 0 ? r.tcea - r.teaUsada / 100 : NaN;
    const explicaBrecha = isFinite(brecha) && brecha > 0.0005
      ? `<p class="brecha">Tu costo real va <b>${nf(brecha * 100, 2)} puntos por encima</b> de la tasa:
         eso es el desgravamen y los gastos. Es la cifra con la que se comparan bancos.</p>`
      : '';

    const hayExtra = c && (c.extra > 0 || c.mensual > 0);
    const siguiente = c ? `
      <div class="siguiente">
        <h2>${hayExtra ? 'Míralo mes a mes' : '¿Y si pudieras pagar algo a capital?'}</h2>
        <p>${hayExtra
          ? 'Arriba tienes cuánto te ahorras. En el simulador ves el cronograma completo: en qué mes cae cada cuota y cómo baja la deuda.'
          : 'Aunque sea la gratificación de un año. El simulador te dice cuánto se acorta y cuánto dejas de pagar.'}</p>
        <a class="boton" href="${enlaceSimulador(c)}">Verlo en el simulador →</a>
        <a class="suave" href="/preguntas.html">O leer cómo funciona</a>
      </div>` : '';

    salida.dataset.previo = '';
    salida.innerHTML = nota + comparacion + `<div class="cifras">${cifras}</div>` +
      plazo + explicaBrecha + siguiente;
    ultimo = { firma: firma(c) };
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
    MUESTRA.forEach(([r, t]) => { const d = mensaje(r === 'yo' ? 'yo' : 'ia', t); d.style.opacity = '.55'; });
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
      mensaje('ia', n
        ? `Hola ${n}. ¿Qué miramos hoy? Puedes contarme un crédito nuevo, o decirme algo como `
          + '«hoy deposité tres mil» y te digo cómo queda.'
        : 'Hola. Cuéntame de tu crédito con tus palabras.');
    } catch (e) {
      mensaje('ia', 'Hola. Cuéntame de tu crédito con tus palabras.');
    }
  })();
})();
