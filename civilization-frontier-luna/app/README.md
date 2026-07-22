# Civilization Frontier: Luna — vertical slice v0.01

Implementación jugable del alcance `docs/01-v001-scope.md`: RTS lunar en tiempo real en el navegador, con 1 humano + 7 bots (configurable 1–15), cuatro recursos, redes logísticas, niebla de guerra, evacuación con un realunizaje y victoria por control estratégico.

## Ejecutar

```bash
npm install
npm run dev        # desarrollo en http://localhost:5173
npm run build      # typecheck + bundle de producción en dist/
npm run preview    # sirve dist/
npm test           # suite Vitest (determinismo, economía, redes, spawn, niebla, victoria)
```

Parámetros de URL útiles: `?seed=123&bots=7` arranca directamente una partida reproducible.

## Cómo se juega

1. **Alunizaje:** clic en el mapa (mare, cráter o corredor; nunca tierras altas ni sombra polar). Tres indicadores aproximados: seguridad, recursos y rivales. Confirma con «Alunizar aquí».
2. **Supervivencia:** el hábitat vive de reservas. Construye un **generador** y tiéndele una **línea de energía**; construye un **nodo de oxígeno**, conéctalo a la energía y al hábitat con un **conducto**. Las alertas rojas muestran la cuenta atrás de reserva.
3. **Expansión:** clic en terreno neutral dirige la expansión (consume energía y oxígeno; el terreno difícil cuesta más). El territorio lejos de hábitats/puntos de control no se sostiene y se pierde.
4. **Extracción:** minas sobre depósitos de minerales (cuadrado ocre) y extractores sobre hielo (punto celeste). El hielo multiplica la producción de oxígeno.
5. **Comercio:** un **puerto lunar** + una **ruta comercial** generan ingresos pasivos mientras la ruta esté operativa.
6. **Conflicto:** clic en tiles enemigos adyacentes para presionar; «Sabotear conexión» corta aristas enemigas al alcance de tu territorio. Las estructuras destruidas caen; los puntos de control se capturan. Los cortes activan reservas y ventanas de reacción, no muertes instantáneas.
7. **Segunda vida:** si pierdes tu último hábitat, evacuas a órbita y puedes realunizar **una vez** en territorio neutral con recursos reducidos y protección temporal.
8. **Victoria:** mantén el control estratégico (territorio sostenible + puntos de control + puertos + rutas) por encima del umbral durante 45 s, o ten la mayor puntuación al corte de 28 minutos.

Cámara: rueda = zoom, botón derecho/central + arrastrar = paneo. Velocidad ×1/×2/×4 y pausa en la barra superior.

## Arquitectura

```
src/sim/      núcleo determinista (sin DOM): rng, mapgen, territorio, economía,
              redes (grafo BFS), niebla, rovers, bots, combate, victoria, tick
src/client/   render Canvas 2D (terreno prerenderizado + capas 1px/tile), cámara
src/main.ts   pantallas, HUD, modos de interacción, bucle con tick fijo (0.5 s)
tests/        21 tests: determinismo por hash, economía, redes, spawn, niebla,
              victoria, evacuación/respawn y validación anti-trampas
```

Reglas que respeta el diseño (PROJECT.md): tiempo real, autoridad de la simulación sobre recursos/territorio/redes (el cliente solo emite `Command`s validados), sin información oculta para bots, sin activos de OpenFront, 2D sin runtime 3D. La decisión Canvas 2D y local-first está registrada en `../docs/adr/0007-local-first-vertical-slice.md`.

## Límites conocidos de v0.01

- Multijugador privado 2–16 pendiente: el núcleo es portable a un servidor Node + WebSocket sin cambios, pero el transporte no está implementado.
- Sin overlay hexagonal (opcional según ADR/arquitectura).
- Arte de siluetas vectoriales; el pipeline de sprites de `docs/13-art-production-pipeline.md` queda para después del slice.
- El rover logístico es visual; el comercio es automático por ruta (según GDD §11).
