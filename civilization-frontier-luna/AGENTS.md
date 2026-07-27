# AGENTS.md

Instrucciones para Codex y otros agentes de ingeniería.

1. Lee `PROJECT.md` completo antes de modificar archivos.
2. Lee `planning/mvp-config.json` y la tarea asignada en `planning/backlog.csv`.
3. No interpretes las imágenes como requisitos funcionales adicionales.
4. Mantén la arquitectura 2D: TypeScript + PixiJS/WebGL + UI web modular. No introduzcas motores 3D.
5. No conviertas el mapa a hexágonos físicos sin una ADR aprobada. El hex puede ser overlay o sector visual.
6. No uses activos de `/proprietary` ni recursos externos no licenciados de OpenFront.
7. Ejecuta `python scripts/validate-project.py` antes de entregar cambios documentales.
8. Cuando exista el fork integrado, ejecuta lint, tests, determinismo y benchmark de la tarea.
9. Registra decisiones estructurales en `docs/adr/`.
10. No marques una tarea Done sin evidencia verificable.
