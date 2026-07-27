# Flujo de pantallas y UI

## 1. Menú principal

Objetivo: entrar en partida con dos decisiones como máximo.

Componentes v0.01:

- Jugar local/privado.
- Escaramuza contra IA.
- Opciones.
- Selector de mapa bloqueado en Luna.
- Estado de conexión.

No incluir XP, nivel o tienda.

Referencia: `visual-references/02-main-menu.png`.

## 2. Carga

Muestra progreso real de assets, mapa y conexión. No simula porcentajes falsos. Tiempo objetivo en equipo de referencia: menos de 10 segundos tras caché fría razonable.

## 3. Selección de aparición

- mapa visible;
- zonas válidas resaltadas;
- densidad de jugadores aproximada;
- perfil de terreno;
- botón confirmar;
- cuenta atrás solo en multijugador.

## 4. Primer minuto

La interfaz presenta una acción dominante: establecer hábitat. Después guía energía y oxígeno mediante objetivos contextuales. No abre árboles ni menús profundos.

Referencia: `visual-references/03-early-game.png`.

## 5. HUD de partida

Barra superior: recursos, producción/consumo y alertas críticas.

Mapa: ownership, rutas, estructuras y selección.

Panel lateral/contextual: detalles del elemento seleccionado.

Zona inferior: acciones disponibles, no una barra permanente con todas las funciones.

## 6. Partida media/tardía

Al alejar zoom:

- se agregan estructuras;
- se simplifican rutas;
- se priorizan puertos, hábitats y puntos de control;
- aparecen alertas agrupadas;
- la diplomacia sigue siendo mínima.

Referencia: `visual-references/04-mid-late-game.png`.

## 7. Cronología

La secuencia visual aprobada sirve para onboarding y QA, no como pantalla obligatoria dentro del juego. Referencia: `visual-references/05-match-timeline.png`.

## 8. Accesibilidad

- escalado de UI;
- bordes ajustables;
- formas además de color;
- modo movimiento reducido;
- atajos visibles;
- alertas con texto y sonido opcional.
