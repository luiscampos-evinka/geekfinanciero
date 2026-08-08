# geekfinanciero.com

Simulador de créditos: cuánto te ahorras adelantando pagos. Sitio estático de un solo
archivo — `index.html` no tiene dependencias externas (la tipografía va incrustada en
base64), así que se publica tal cual en cualquier hosting estático.

- `index.html` — el simulador completo (motor, interfaz y textos).
- `og.png` — imagen 1200×630 para cuando se comparte el link.

La matemática está verificada contra la plantilla Excel original de Julio Campos:
cuota por sistema francés con TEM compuesta `(1+TEA)^(1/12)-1`, y TCEA por TIR de los
flujos reales (cuota + desgravamen + portes + comisiones).
