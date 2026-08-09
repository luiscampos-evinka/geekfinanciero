/**
 * El panel de administración.
 *
 * Va en un archivo aparte, y no dentro del HTML, por una razón concreta: así la
 * página puede declarar `script-src 'self'` y el navegador se niega a ejecutar
 * cualquier script que alguien logre colar en los datos. Además, TODO lo que
 * viene del servidor se escapa antes de pintarse: parte de lo que se ve aquí
 * —el nombre de quien pone un reclamo— lo escribe un desconocido.
 */
(() => {
  const API = 'https://geekfinanciero-api.geekfinanciero.workers.dev';
  const hoja = document.getElementById('hoja');

  /** Sin esto, un reclamo con una etiqueta dentro se ejecuta con la sesión de administración. */
  const esc = t => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const nf = (n, d = 2) => new Intl.NumberFormat('es-PE',
    { minimumFractionDigits: d, maximumFractionDigits: d }).format(isFinite(n) ? n : 0);
  const fecha = e => !e ? '—' : new Date(e * 1000)
    .toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: '2-digit' });
  const fechaHora = e => !e ? '—' : new Date(e * 1000)
    .toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const sesion = () => { try { return localStorage.getItem('gf-sesion'); } catch { return null; } };
  async function pedir(ruta, opciones = {}) {
    const s = sesion();
    try {
      const r = await fetch(API + ruta, {
        ...opciones,
        headers: {
          'content-type': 'application/json',
          ...(s ? { authorization: 'Bearer ' + s } : {}),
          ...(opciones.headers || {}),
        },
      });
      let cuerpo = null;
      try { cuerpo = await r.json(); } catch (e) {}
      return { ok: r.ok, estado: r.status, cuerpo };
    } catch (e) {
      return { ok: false, estado: 0, cuerpo: { error: 'No pudimos conectar.' } };
    }
  }

  const puerta = (texto) => {
    hoja.innerHTML = `<div class="caja"><h1 style="font-size:1.4rem">${esc(texto)}</h1>
      <p style="color:var(--ink-2)">Este panel es solo para las cuentas de administración.</p>
      <p><a href="/" style="color:var(--brand);font-weight:650">Volver al simulador</a></p></div>`;
  };

  (async () => {
    if (!sesion()) return puerta('Primero entra a tu cuenta');
    const { cuerpo: quien } = await pedir('/api/yo');
    if (!quien || !quien.correo) return puerta('Tu sesión ya no vale');
    if (!quien.admin) return puerta('Esta cuenta no es de administración');

    const { ok, cuerpo: d } = await pedir('/api/admin/resumen');
    if (!ok || !d) return puerta('No pudimos leer los datos');
    pinta(quien, d);
  })();

  function vigente(c, ahora) {
    if (!c.activo) return '<span class="pin no">apagado</span>';
    if (c.vence_en && c.vence_en < ahora) return '<span class="pin no">vencido</span>';
    if (c.usos_max && c.usos >= c.usos_max) return '<span class="pin no">agotado</span>';
    return '<span class="pin ok">vivo</span>';
  }

  function pinta(quien, d) {
    const activos = d.usuarios.activos;
    const conversion = d.usuarios.total ? (activos / d.usuarios.total * 100) : 0;
    const plural = (n, s, p) => n === 1 ? s : p;

    hoja.innerHTML = `
      <div class="cabecera">
        <h1 style="font-size:1.5rem;margin:0">Panel</h1>
        <span class="quien">${esc(quien.correo)}</span>
      </div>
      <p style="color:var(--ink-2);margin:0 0 4px">Al ${fecha(d.ahora)}. Los importes van en soles.</p>

      <div class="rejilla">
        <div class="dato fuerte"><span class="k">Suscripciones al día</span>
          <span class="v">${activos}</span>
          <span class="p">de ${d.usuarios.total} cuentas · ${nf(conversion, 1)} %</span></div>
        <div class="dato"><span class="k">Cobrado en total</span>
          <span class="v">S/ ${nf(d.pagos.suma, 0)}</span>
          <span class="p">${d.pagos.total} ${plural(d.pagos.total, 'pago', 'pagos')}</span></div>
        <div class="dato"><span class="k">Últimos 30 días</span>
          <span class="v">S/ ${nf(d.pagos.sumaMes, 0)}</span>
          <span class="p">${d.pagos.mes} ${plural(d.pagos.mes, 'pago', 'pagos')}</span></div>
        <div class="dato"><span class="k">Cuentas nuevas</span>
          <span class="v">${d.usuarios.nuevos30}</span>
          <span class="p">en 30 días</span></div>
        <div class="dato"><span class="k">Créditos guardados</span>
          <span class="v">${d.creditos}</span>
          <span class="p">${d.dispositivos} ${plural(d.dispositivos, 'equipo', 'equipos')} ${plural(d.dispositivos, 'registrado', 'registrados')}</span></div>
        <div class="dato"><span class="k">Reclamos</span>
          <span class="v">${d.reclamos.total}</span>
          <span class="p">${d.usuarios.bloqueados} ${plural(d.usuarios.bloqueados, 'cuenta bloqueada', 'cuentas bloqueadas')}</span></div>
      </div>

      <h2>Cupones</h2>
      <div class="tablawrap"><table>
        <thead><tr><th>Código</th><th>Descuento</th><th class="num">Usos</th><th>Vence</th><th>Estado</th></tr></thead>
        <tbody>${d.cupones.map(c => `<tr>
          <td><b>${esc(c.codigo)}</b></td>
          <td>${c.tipo === 'porcentaje' ? nf(c.valor, 0) + ' %' : 'S/ ' + nf(c.valor)}</td>
          <td class="num">${c.usos}${c.usos_max ? ' / ' + c.usos_max : ''}</td>
          <td>${c.vence_en ? fecha(c.vence_en) : 'no vence'}</td>
          <td>${vigente(c, d.ahora)}</td></tr>`).join('') || '<tr><td colspan="5">Ninguno.</td></tr>'}
        </tbody></table></div>

      <h2>Últimos pagos</h2>
      <div class="tablawrap"><table>
        <thead><tr><th>Cuenta</th><th class="num">Importe</th><th>Cupón</th><th>Cuándo</th></tr></thead>
        <tbody>${d.pagos.ultimos.map(p => `<tr>
          <td>${esc(p.correo)}</td><td class="num">S/ ${nf(p.monto)}</td>
          <td>${esc(p.cupon || '—')}</td><td>${fecha(p.creado_en)}</td></tr>`).join('')
          || '<tr><td colspan="4">Todavía no hay ningún pago.</td></tr>'}
        </tbody></table></div>

      <h2>Últimas cuentas</h2>
      <div class="tablawrap"><table>
        <thead><tr><th>Correo</th><th>Alta</th><th>Suscripción</th><th class="num">Equipos</th><th>Estado</th></tr></thead>
        <tbody>${d.ultimosUsuarios.map(u => `<tr>
          <td>${esc(u.correo)}</td><td>${fecha(u.creado_en)}</td>
          <td>${u.vence_en > d.ahora ? 'hasta ' + fecha(u.vence_en) : '—'}</td>
          <td class="num">${u.equipos}</td>
          <td>${u.bloqueado ? '<span class="pin mal">bloqueada</span>'
            : u.vence_en > d.ahora ? '<span class="pin ok">al día</span>'
            : `<span class="pin no">${u.verificado ? 'gratis' : 'sin verificar'}</span>`}</td>
        </tr>`).join('') || '<tr><td colspan="5">Ninguna todavía.</td></tr>'}
        </tbody></table></div>

      ${d.reclamos.ultimos.length ? `<h2>Libro de reclamaciones</h2>
      <div class="tablawrap"><table>
        <thead><tr><th>Código</th><th>Quién</th><th>Tipo</th><th>Cuándo</th></tr></thead>
        <tbody>${d.reclamos.ultimos.map(r => `<tr><td><b>${esc(r.codigo)}</b></td>
          <td>${esc(r.nombre)}</td><td>${esc(r.tipo)}</td><td>${fecha(r.creado_en)}</td></tr>`).join('')}
        </tbody></table></div>` : ''}

      ${(d.errores && d.errores.length) ? `<h2>Errores del servidor</h2>
      <p style="color:var(--ink-2);font-size:.9rem;margin:0 0 12px">Lo que reventó por dentro. Si
      alguien te dice que le sale «error interno», aquí está el porqué.</p>
      <div class="tablawrap"><table>
        <thead><tr><th>Cuándo</th><th>Dónde</th><th>Qué pasó</th></tr></thead>
        <tbody>${d.errores.map(e => `<tr>
          <td>${fechaHora(e.creado_en)}</td>
          <td><b>${esc(e.metodo || '')} ${esc(e.ruta)}</b></td>
          <td style="white-space:normal">${esc(e.mensaje)}</td></tr>`).join('')}
        </tbody></table></div>` : ''}

      <h2>Arreglar una cuenta a mano</h2>
      <p style="color:var(--ink-2);font-size:.9rem;margin:0 0 12px">Para cuando un pago se cae a
      medias y hay que darle sus días sin tocar la base de datos. Los días se <b>suman</b> a lo que
      ya tuviera.</p>
      <div class="herramienta">
        <div class="campo"><label for="u-correo">Correo</label>
          <input type="email" id="u-correo" placeholder="alguien@correo.com" autocomplete="off"></div>
        <div class="campo"><label for="u-dias">Días a sumar</label>
          <input type="number" id="u-dias" value="30" step="1" style="min-width:110px"></div>
        <button type="button" id="u-dar">Dar los días</button>
        <button type="button" id="u-bloq" class="suave">Bloquear</button>
        <button type="button" id="u-desbloq" class="suave">Desbloquear</button>
      </div>
      <div id="aviso"></div>

      <div class="pie" style="margin-top:34px">
        <a href="/">Simulador</a><a href="/terminos.html">Términos</a><a href="/privacidad.html">Privacidad</a>
      </div>`;

    const av = (t, bien) => {
      document.getElementById('aviso').innerHTML =
        `<div style="padding:11px 14px;border-radius:9px;background:${bien ? 'var(--brand-soft)' : '#f8efd8'};
          color:${bien ? 'inherit' : '#1b1710'}">${t}</div>`;
    };
    const tocar = async (cuerpo, dice) => {
      const correo = document.getElementById('u-correo').value.trim();
      if (!correo) return av('Escribe el correo de la cuenta.');
      const { ok, cuerpo: r } = await pedir('/api/admin/usuario', {
        method: 'POST', body: JSON.stringify({ correo, ...cuerpo }),
      });
      if (!ok || !r || r.error) return av(esc((r && r.error) || 'No se pudo.'));
      av(`${dice} <b>${esc(correo)}</b>. ${r.activo
        ? 'Queda al día hasta el ' + fecha(r.venceEn) : 'Queda sin suscripción'}.`, true);
    };
    document.getElementById('u-dar').addEventListener('click', () =>
      tocar({ dias: parseFloat(document.getElementById('u-dias').value) || 0 }, 'Días añadidos a'));
    document.getElementById('u-bloq').addEventListener('click', () => tocar({ bloqueado: true }, 'Bloqueada'));
    document.getElementById('u-desbloq').addEventListener('click', () => tocar({ bloqueado: false }, 'Desbloqueada'));
  }
})();
