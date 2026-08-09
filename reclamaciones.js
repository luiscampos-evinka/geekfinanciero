/**
 * El Libro de Reclamaciones.
 *
 * Va en archivo aparte por lo mismo que el panel: así la página puede declarar
 * una política que impida ejecutar cualquier script que se cuele en los datos.
 */
(() => {
  const API = 'https://geekfinanciero-api.geekfinanciero.workers.dev';
  const $ = s => document.querySelector(s);
  const esc = t => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const aviso = (html, bien) => {
    $('#aviso').innerHTML = `<div class="${bien ? 'ok' : 'mal'}">${html}</div>`;
    $('#aviso').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = id => $('#' + id).value.trim();
    if (!v('nombre') || !v('correo') || !v('detalle')) {
      return aviso('Faltan tu nombre, tu correo o el detalle de lo ocurrido.', false);
    }
    const b = $('#enviar');
    b.disabled = true; b.textContent = 'Enviando…';
    try {
      const r = await fetch(`${API}/api/reclamo`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nombre: v('nombre'), documento: v('documento'), telefono: v('telefono'),
          correo: v('correo'), domicilio: v('domicilio'),
          menorEdad: $('#menor').checked,
          tipo: document.querySelector('input[name=tipo]:checked').value,
          bien: v('bien'), monto: parseFloat(v('monto')) || 0,
          detalle: v('detalle'), pedido: v('pedido'),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.codigo) {
        b.disabled = false; b.textContent = 'Presentar';
        return aviso(esc(d.error || 'No se pudo registrar. Inténtalo otra vez.'), false);
      }
      // La ley obliga a darle constancia al consumidor: se enseña y se manda por correo.
      $('#f').innerHTML = '';
      aviso(`<b>Queda registrada.</b> Este es tu código de constancia:
        <span class="codigo">${esc(d.codigo)}</span>
        Te lo hemos enviado también a <b>${esc(v('correo'))}</b>. Tienes respuesta en un plazo
        máximo de <b>15 días hábiles</b>. Guarda el código: es tu comprobante.`, true);
    } catch (err) {
      b.disabled = false; b.textContent = 'Presentar';
      aviso('No pudimos conectar. Revisa tu conexión e inténtalo otra vez.', false);
    }
  });
})();
