# Manual de ejecución — de v0.00.2 a v0.01

## Paso 0 — Validar el paquete

Windows:

```powershell
.\scripts\validate-project.bat
```

macOS/Linux:

```bash
chmod +x scripts/validate-project.sh
./scripts/validate-project.sh
```

Debe terminar con `PROJECT VALID`.

## Paso 1 — Preparar el equipo

Ejecuta:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\collect-system-info.ps1
```

Guarda el informe en `planning/local-system-report.txt`.

## Paso 2 — Materializar OpenFront

Instala Git, Node.js y npm. Ejecuta:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-openfront.ps1
```

No publiques el resultado. Primero registra commit, tests, lint y perf.

## Paso 3 — Auditoría upstream

Documenta en `docs/14-openfront-code-map.md`:

- entrada de cliente y servidor;
- simulación y tick;
- modelo territorial;
- mapas;
- bots;
- render y capas HUD;
- WebSocket y workers;
- tests y benchmarks;
- puntos seguros de extensión.

No programes hexágonos físicos antes de esta auditoría.

## Paso 4 — Greybox lunar

Implementa sin arte final:

1. modo `lunar-frontier`;
2. mapa de prueba;
3. spawn;
4. cuatro recursos;
5. siete estructuras como iconos simples;
6. conexiones de energía/oxígeno;
7. IA de expansión;
8. victoria temporal.

Resultado: partida de principio a fin con formas y colores básicos.

## Paso 5 — Contrato visual

Implementa en este orden:

1. textura lunar base;
2. ownership y niebla;
3. rutas;
4. hábitat, generador y oxígeno;
5. mina, hielo, punto de control y puerto;
6. rover;
7. menú y spawn;
8. HUD y panel contextual;
9. alertas y accesibilidad.

Cada asset debe pasar la prueba de lectura a tres zooms.

## Paso 6 — Multiplayer privado

- servidor autoritativo;
- 2–16 humanos;
- reconexión;
- rate limiting;
- logs;
- snapshots de diagnóstico;
- test de divergencia.

## Paso 7 — Benchmark

Medir:

- CPU y RAM por partida;
- bytes por jugador/segundo;
- duración del tick;
- sprites visibles;
- coste de actualización de red;
- FPS por nivel de zoom;
- partidas simultáneas por máquina.

## Paso 8 — Aceptación

Realizar pruebas con cinco jugadores nuevos. Registrar vídeo o notas, métricas y problemas. No añadir sistemas persistentes hasta superar los criterios de `docs/01-v001-scope.md`.
