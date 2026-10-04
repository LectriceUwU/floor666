# Web de Floor 666

Página estática (HTML + CSS + JS, sin dependencias ni build). Todo el texto de la web está en inglés.

## Verla

- Doble clic en `index.html` funciona tal cual.
- O con servidor local (lo que usa el panel del navegador de Claude, config `floor666-web` en `.claude/launch.json`):
  `python -m http.server 6680 --directory website` → http://localhost:6680
  (no uses el puerto 6667: Chrome lo bloquea con `ERR_UNSAFE_PORT`).

Para publicarla basta con subir la carpeta `website/` tal cual (GitHub Pages, itch.io, Netlify…).

## Archivos

| Archivo | Qué hay |
|---|---|
| `index.html` | Estructura: intro, descarga, final de Despot, pie |
| `js/features.js` | **Contenido de las features** (lo que más vas a tocar) |
| `css/style.css` | Estilos; colores y fuentes arriba del todo, en `:root` |
| `js/circuit.js` | Fondo: muro, pistas, marco de maquinaria y electricidad |
| `js/despot.js` | Cara de Despot (cuadrícula de píxeles) y apertura de ojos |
| `js/music.js` | Música de fondo con botón en la barra |
| `audio/duneless-drift.m4a` | Tema de Floor 666 (AAC 192 kbps, convertido del WAV del mod) |
| `js/main.js` | Genera las secciones y conecta navegación, botón de descarga y música |

## Editar features

En `js/features.js` cada categoría es una sección (y un enlace en la barra) y cada feature una tarjeta.
Añadir, quitar o reordenar es editar esa lista; no hace falta tocar el HTML.

Campos de una feature: `id`, `title`, `subtitle` (opcional), `text`, `tag` (etiqueta pequeña, p. ej. *All game modes*),
`variant` (borde destacado: `"blood"` rojo, `"gold"` dorado o `"arcane"` morado) y `media` (opcional, va encima del título):

```js
media: { src: "img/floor666.png", alt: "Floor 666 map" }   // imagen
media: '<video src="img/heroes.mp4" autoplay muted loop></video>' // o HTML propio
```

Cada tarjeta lleva `id="feature-<id>"`, así que más adelante se le puede enganchar un visual distinto a cada una
desde CSS o JS sin tocar las demás.

## Ajustes rápidos

- **Botón de descarga:** hoy muestra "Coming Soon". El texto de la terminal está en `initDownload` (`js/main.js`).
  Cuando haya descarga real, se cambia el `<button id="dl-btn">` de `index.html` por un `<a href="…">`.
- **Electricidad:** el bloque `T` al principio de `js/circuit.js` controla el radio de reacción al cursor, el alcance
  de los arcos, la velocidad de los pulsos, el parallax y la frecuencia de la actividad ambiental.
- **Cara de Despot:** `EYE` y `MOUTH` en `js/despot.js` son dibujos de píxeles (`#` = píxel). Colores en `COLOR`.
  Cuando la pantalla de Despot se ve casi entera, espera `NOTICE_DELAY` segundos y "se fija en ti": `NOTICE` es la
  curva de apertura (entreabre, duda, abre de golpe) y `FLARE` el destello del brillo.
- **Glitch secreto del título:** "Bit" cambia a "Much" durante un segundo cada 20–55 s (solo si el título está en
  pantalla). Palabras en `index.html` (`data-alt`), tiempos en `initTitleSwap` (`js/main.js`).
- **Música:** encendida por defecto. Si el navegador bloquea el autoplay (lo normal en una primera visita), empieza en
  el primer clic, toque o tecla. Si el visitante la apaga con el botón de la nota, se recuerda para las siguientes
  visitas. Volumen en `VOLUME` (`js/music.js`).
  Para cambiar de tema, sustituye el archivo de `audio/` y el `src` del `<audio id="bgm">` en `index.html`.
- **Fuentes:** Silkscreen (títulos) y Pixelify Sans (texto), desde Google Fonts; se cambian en `--font-head` / `--font-body`.
- Con "reducir movimiento" activado en el sistema, el fondo queda estático y se desactivan glitch y animaciones.
