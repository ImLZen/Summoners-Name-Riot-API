# Changelog

## 0.01.1-alpha — 2026-07-22

- Multijugador privado 2–16 con servidor autoritativo WebSocket (`npm run server`): salas con código de 5 letras, lobby, anfitrión, reconexión por nombre.
- El servidor ejecuta el tick, valida todos los comandos (reescribe el `playerId` por el del socket) y envía snapshots delta filtrados por la niebla de cada jugador; la semilla del mapa nunca viaja al cliente.
- Núcleo con soporte multi-humano: la partida arranca cuando todos los humanos han alunizado; los bots se colocan después.
- Cliente con espejo de estado en red: mismo renderer y HUD para local y multijugador; sin simulación en el navegador → sin divergencia posible.
- 6 tests nuevos (27 en total): niebla verificada en el mensaje de red, partida completa con 16 humanos, anticheat, consistencia entre espejos y reconexión; verificación end-to-end con servidor real y dos navegadores.

## 0.01.0-alpha — 2026-07-22

- Implementado el vertical slice jugable en `app/` (TypeScript + Vite + Vitest, Canvas 2D): ver ADR 0007.
- Núcleo determinista con semilla: mapa lunar (mare, tierras altas, cráteres, sombra polar, corredores), depósitos garantizados por zona.
- Selección libre de alunizaje con indicadores de seguridad/recursos/rivales, validada por la simulación.
- Economía autoritativa de cuatro recursos; producción/consumo por segundo con reservas y degradación gradual ante cortes.
- Grafo de redes: líneas de energía, conductos de oxígeno y rutas comerciales con estados operativa/dañada/cortada, sabotaje, reparación automática y rovers logísticos.
- Territorio continuo con expansión dirigida, sostenibilidad por anclas (hábitats/puntos de control) y combate abstracto sobre tiles e infraestructura (captura de puntos de control).
- Niebla de guerra sin fuga de datos: bots y humano usan la misma visibilidad; memoria de exploración con información desactualizada atenuada.
- 7 bots con arquetipos Ingeniera/Prospectora/Expansiva/Saboteadora bajo las mismas reglas y costes.
- Evacuación y un realunizaje por jugador; victoria por control estratégico mantenido o puntuación al corte de 28 minutos; resumen final con ranking.
- 21 tests (determinismo por hash a 20 min simulados, economía, redes, spawn, niebla, victoria, anti-trampas) y verificación manual automatizada en navegador.

## 0.00.2 — 2026-07-22

- Aprobado el MVP lunar como dirección principal.
- Aprobada la dirección visual 2D producible.
- Incorporadas cinco referencias visuales canónicas.
- Sustituida la economía histórica por Energía, Oxígeno, Minerales y Agua/Hielo.
- Añadidos contratos de mapa, UI y pipeline de arte.
- Añadidos `PROJECT.md`, `AGENTS.md`, `CLAUDE.md` y configuración MVP legible por máquinas.
- Añadida validación automática del paquete.
- Documentado que el juego es tiempo real y que los hexágonos son opcionales como overlay.

## 0.00.1 — 2026-07-21

- Semilla documental y laboratorio local inicial.
