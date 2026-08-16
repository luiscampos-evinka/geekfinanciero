/* Medir dónde se cae la gente entre que entra al sitio y que paga.
 *
 * Va como archivo propio y no como script inline por una razón concreta:
 * panel.html, asistente.html, deudas.html y reclamaciones.html llevan una CSP
 * con `script-src 'self'`, que permite esto y rechazaría cualquier cosa de
 * fuera. Por eso el embudo sí llega a esas páginas y Cloudflare Web Analytics
 * no.
 *
 * Lo que NO hace:
 *   · No pone cookies. El id vive en sessionStorage y muere al cerrar la
 *     pestaña: no sirve para reconocer a nadie mañana, y así está bien.
 *   · No manda nada que identifique a la persona: ni el correo aunque haya
 *     sesión, ni la query de la URL, que es donde viajan los tokens.
 *   · No rompe nada si falla. Si no hay sessionStorage —navegación privada
 *     estricta— simplemente no se mide y la página sigue igual.
 */
(() => {
  const API = 'https://geekfinanciero-api.geekfinanciero.workers.dev';
  const LLAVE = 'gf_sesion';

  let sesion = null;
  try {
    sesion = sessionStorage.getItem(LLAVE);
    if (!sesion) {
      sesion = (crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2)
      ).replace(/-/g, '').slice(0, 32);
      sessionStorage.setItem(LLAVE, sesion);
    }
  } catch (e) {
    sesion = null;
  }

  // La base ya impide duplicar con UNIQUE (sesion, nombre); esto solo ahorra
  // peticiones dentro de la misma carga de página.
  const puesto = new Set();

  window.mide = function (nombre) {
    if (!sesion || puesto.has(nombre)) return;
    puesto.add(nombre);
    try {
      const cuerpo = JSON.stringify({ n: nombre, s: sesion, r: location.pathname });
      /* text/plain a propósito. Con application/json el navegador exigiría un
         preflight CORS que sendBeacon no sabe hacer, y el evento se perdería
         en silencio: el servidor lo lee como texto y lo parsea él. */
      const paquete = new Blob([cuerpo], { type: 'text/plain;charset=UTF-8' });
      if (!navigator.sendBeacon || !navigator.sendBeacon(API + '/api/e', paquete)) {
        fetch(API + '/api/e', {
          method: 'POST', body: cuerpo, keepalive: true,
          headers: { 'content-type': 'text/plain;charset=UTF-8' },
        }).catch(() => {});
      }
    } catch (e) { /* medir nunca puede tumbar la página */ }
  };

  /* La entrada se deduce de la ruta para no tener que tocar las ocho guías
     una por una —y para no olvidarse de la novena—. Una guía es otra puerta
     de entrada al sitio, no un paso del embudo. */
  const p = location.pathname;
  if (p === '/' || p === '/index.html') {
    window.mide('vio_portada');
  } else if (/^\/[a-z0-9-]+\/$/.test(p) && !/^\/(fuentes|marca)\/$/.test(p)) {
    window.mide('vio_guia');
  }
})();
