# PROJECT — Civilization Frontier: Luna

Este archivo es la entrada canónica para cualquier colaborador humano o agente de IA.

## 1. Qué estamos construyendo

Un RTS multijugador de navegador, rápido y legible, en el que cada jugador aterriza en la Luna, funda una colonia y compite por energía, oxígeno, minerales, hielo y rutas logísticas. La expansión territorial solo es sostenible si la infraestructura sigue conectada.

**Pitch:** construye una red lunar que pueda sobrevivir; corta o protege las líneas que mantienen vivas las colonias.

## 2. Objetivo inmediato

Entregar la **v0.01**, una alfa vertical slice local y privada que pruebe:

- selección libre de aparición;
- exploración y niebla de guerra;
- expansión territorial;
- cuatro recursos lunares;
- estructuras 2D claras;
- redes de energía, oxígeno y comercio;
- bots que se expanden sobre territorio neutral;
- conflicto básico sobre infraestructura;
- una segunda oportunidad mediante evacuación y nuevo alunizaje;
- partida completa en tiempo real y resumen final.

## 3. Documentos canónicos

| Tema | Documento |
|---|---|
| Alcance y exclusiones | `docs/01-v001-scope.md` |
| Reglas de juego | `docs/02-game-design-document.md` |
| Arquitectura | `docs/03-technical-architecture.md` |
| Integración OpenFront | `docs/04-openfront-integration.md` |
| Lenguaje visual | `docs/05-visual-language.md` |
| Mapa lunar | `docs/11-lunar-map-and-world.md` |
| Pantallas y flujo | `docs/12-ui-flow-and-screen-spec.md` |
| Producción de arte | `docs/13-art-production-pipeline.md` |
| Roadmap | `docs/08-roadmap-and-backlog.md` |
| Ejecución | `docs/10-execution-manual.md` |
| Configuración legible por máquinas | `planning/mvp-config.json` |
| Tareas | `planning/backlog.csv` |

## 4. Orden de precedencia

1. ADR aceptadas en `docs/adr/`.
2. `planning/mvp-config.json`.
3. Alcance v0.01.
4. GDD y arquitectura.
5. Referencias visuales.
6. Comentarios de código.

Si dos documentos contradicen esta jerarquía, no inventes una solución: registra el conflicto y aplica el nivel superior.

## 5. Reglas no negociables

- Tiempo real, no turnos.
- Autoridad del servidor sobre recursos, territorio y combate.
- Sin pay-to-win.
- Sin activos propietarios de OpenFront.
- Sin 3D en tiempo real para v0.01.
- La estética aprobada se implementa con sprites 2D, overlays, polígonos, líneas y UI modular.
- Las imágenes no añaden funciones al alcance por sí solas.
- Ninguna tarea está terminada sin pruebas, verificación manual y documentación.

## 6. Forma de trabajar

1. Elige una tarea `Todo` sin bloqueos en `planning/backlog.csv`.
2. Lee sus dependencias y criterios de aceptación.
3. Crea una rama dedicada.
4. Implementa el mínimo cambio completo.
5. Ejecuta los checks obligatorios.
6. Documenta decisiones y límites.
7. Abre una revisión; no mezcles tareas no relacionadas.

## 7. Definición de terminado

Una tarea está Done cuando:

- cumple sus criterios de aceptación;
- tiene tests donde sean aplicables;
- mantiene la simulación determinista;
- no introduce activos sin licencia;
- respeta presupuestos de rendimiento;
- incluye evidencia de verificación manual;
- actualiza documentación y backlog.
