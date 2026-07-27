# ADR 0007 — Vertical slice local-first con núcleo determinista y Canvas 2D

- **Estado:** aceptada
- **Fecha:** 2026-07-22

## Contexto

La tarea CF-006 (materializar un commit auditado de OpenFront) sigue bloqueada. El resto del embudo (greybox lunar, mapa, spawn, economía, redes, bots, respawn, victoria) dependía de esa base. Al mismo tiempo, el alcance v0.01 exige una alfa **local y privada** con 1 humano + 7 bots, sin cuentas ni matchmaking.

## Decisión

1. **No bloquear el vertical slice en el fork de OpenFront.** Se implementa un núcleo de simulación propio en TypeScript (`app/src/sim/`), inspirado en las mecánicas de OpenFront (territorio continuo por tiles, expansión dirigida, niebla, bots bajo las mismas reglas), sin copiar código ni activos propietarios.
2. **Arquitectura servidor-autoritativo desde el día uno, ejecución local hoy.** Toda mutación pasa por `applyCommand()` (validación) y `tick()` (orden fijo determinista). El cliente solo emite comandos y dibuja lo que la visibilidad permite. Portar el núcleo a un proceso Node + WebSocket no requiere reescritura: es el mismo módulo sin dependencias del DOM.
3. **Canvas 2D en lugar de PixiJS para v0.01.** El presupuesto de escena del slice (mapa 112×70, ~100 estructuras, ~100 aristas) se mantiene muy por debajo del punto donde WebGL aporta ventaja. Terreno prerenderizado + capas de propiedad/niebla a 1 px/tile escaladas mantienen el frame barato. PixiJS sigue siendo la opción prevista cuando el presupuesto visual crezca (atlas de sprites, efectos), y el render está aislado en `app/src/client/renderer.ts` para permitir la sustitución.

## Consecuencias

- v0.01 es jugable sin red y sin dependencias de runtime; solo dev-deps (Vite, TypeScript, Vitest).
- El determinismo es verificable por test (misma semilla + mismos comandos ⇒ mismo hash tras 20 minutos simulados).
- Cuando se materialice OpenFront (CF-006), la comparación será mecánica-a-mecánica contra un slice funcionando, no contra documentos.
- La deuda declarada: multijugador privado 2–16 (transporte WebSocket + lobby) y sustitución del render si el arte 2D producido lo exige.
