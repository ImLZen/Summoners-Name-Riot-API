# Arquitectura técnica — v0.01 lunar

## Objetivo

Implementar la experiencia aprobada con tecnología web 2D, conservando el rendimiento y la capacidad de escalar por partidas.

## Pila prevista

- TypeScript.
- Vite para desarrollo y empaquetado.
- PixiJS/WebGL para mapa, sprites, overlays y efectos.
- Lit/HTML/CSS para HUD, menús y paneles.
- WebSocket para comunicación de partida.
- Node.js/Express para lobby y servidor.
- Vitest para pruebas.
- OpenTelemetry o métricas equivalentes en fases privadas.

La pila final se confirmará al fijar y auditar el commit de OpenFront.

## Capas

### Cliente de render

- textura lunar base prerenderizada;
- ownership y fronteras como polígonos o textura dinámica;
- sprites 2D agrupados en atlas;
- líneas de rutas mediante geometría simple;
- niebla con máscara;
- animaciones cortas y funcionales;
- cámara 2D con zoom y paneo.

### UI web

- menú principal;
- selector de spawn;
- barra de recursos;
- panel de selección;
- objetivos contextuales;
- alertas;
- diplomacia mínima y resumen.

### Núcleo determinista

- recursos;
- producción/consumo;
- territorio;
- grafo de redes;
- exploración;
- bots;
- conflicto;
- respawn;
- victoria.

### Servidor autoritativo

- valida comandos;
- ejecuta ticks;
- oculta datos bajo niebla;
- transmite deltas;
- registra telemetría;
- conserva semilla y eventos de partida.

## Decisión sobre hexágonos

Los mockups usan hexágonos por legibilidad. No constituyen una obligación de cambiar el modelo territorial de OpenFront.

Orden de preferencia:

1. conservar territorio continuo y dibujar sectores/hexes solo como overlay;
2. agrupar celdas existentes en sectores estratégicos;
3. implementar hexágonos lógicos únicamente mediante ADR y benchmark que demuestre beneficio superior al coste.

## Arte y render

- Sin modelos 3D en runtime.
- Edificios prerenderizados o ilustrados con perspectiva cenital/isométrica leve.
- Tamaños base sugeridos: 64 px, 96 px y 128 px según categoría/zoom.
- Atlas de hasta 2048×2048 para el MVP.
- Variantes de facción mediante tint, máscara o pequeños emblemas, no sprites completamente nuevos.
- Efectos limitados a pulsos, brillos, partículas ligeras y movimiento de ruta.

## Presupuestos iniciales

Sujetos a benchmark:

- 60 FPS objetivo a 1080p en el equipo del fundador; mínimo 30 FPS bajo carga normal.
- Menos de 15 MB de assets esenciales antes de entrar en partida.
- Menos de 6 atlas principales cargados simultáneamente.
- No más de 1.000 sprites visibles activos en la escena MVP.
- Actualización visual desacoplada del tick autoritativo.
- Las rutas se agregan y simplifican al alejar zoom.

## Flujo de datos de una red

1. El jugador solicita crear conexión.
2. El servidor valida coste, distancia y extremos.
3. El grafo se actualiza en un tick determinista.
4. El flujo se recalcula de forma incremental.
5. El servidor envía el estado permitido a cada cliente.
6. El cliente anima la línea sin decidir recursos.

## Riesgos

- Convertir demasiado pronto el mapa a hexágonos físicos.
- Exceso de detalle en sprites pequeños.
- Recalcular todo el grafo en cada tick.
- Fuga de datos mediante rutas ocultas.
- UI DOM excesiva durante zoom/paneo.
- Dependencia accidental de activos propietarios.
