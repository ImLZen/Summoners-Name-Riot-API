# Civilization Frontier: Luna — Project Seed v0.00.2

Proyecto de estrategia multijugador en tiempo real para navegador, inspirado en la accesibilidad de OpenFront y centrado en expansión lunar, supervivencia logística y control territorial legible.

## Estado actual

- **Versión de trabajo:** v0.00.2.
- **Objetivo:** alfa vertical slice v0.01.
- **MVP principal aprobado:** temática lunar.
- **Prototipo existente:** laboratorio de mecánicas heredado; aún no representa la economía ni la estética lunar definitiva.
- **Base técnica prevista:** TypeScript, Vite, PixiJS/WebGL, Lit/HTML/CSS y servidor WebSocket, reutilizando una versión fijada de OpenFront cuando la auditoría técnica lo permita.

## Empieza aquí

1. Lee `PROJECT.md`.
2. Lee `planning/mvp-config.json`.
3. Revisa `docs/01-v001-scope.md` y `docs/05-visual-language.md`.
4. Ejecuta `scripts/validate-project.bat` en Windows o `scripts/validate-project.sh` en macOS/Linux.
5. Sigue `docs/10-execution-manual.md`.

## Referencias visuales aprobadas

Las imágenes canónicas están en `docs/visual-references/`. Son referencias de producción técnicamente realizables con un juego web 2D. No son capturas de una implementación terminada ni autorizan automáticamente todas las funciones mostradas.

Las siguientes reglas prevalecen sobre cualquier detalle de las imágenes:

- El juego es **tiempo real**, no por turnos.
- El motor no necesita convertirse en una cuadrícula hexagonal real; los hexágonos pueden ser una capa visual o sectores estratégicos.
- No hay modelado 3D en tiempo real para el MVP.
- Los niveles de comandante, XP, inventario persistente y monetización no forman parte de v0.01.
- La claridad del mapa prevalece sobre el detalle artístico.

## Ejecutar el laboratorio existente

### Windows

Ejecuta `scripts/run-local.bat` y abre `http://localhost:8080/prototype/`.

### macOS / Linux

```bash
chmod +x scripts/run-local.sh
./scripts/run-local.sh
```

El laboratorio sirve para validar ritmo, spawn, fog, bots y respawn. Será sustituido gradualmente por el vertical slice lunar integrado.

## Promesa del producto

> El dinero podrá comprar identidad y expresión, nunca poder estratégico.
