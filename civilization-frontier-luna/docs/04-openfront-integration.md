# OpenFront Integration Strategy

## Why not modify the full game immediately

OpenFront is a mature, actively changing codebase. Directly rewriting its core before validating our mechanics would combine product risk with integration risk. The safer path is:

1. Validate the new loop in an isolated mechanics lab.
2. Pin a specific OpenFront tag or commit.
3. Run all upstream tests and performance suites.
4. Map our systems to existing command, core, bot, renderer, and worker boundaries.
5. Integrate one vertical slice behind a game-mode flag.

## Baseline facts to verify during setup

- Code license and additional attribution obligations.
- Asset license boundaries, especially the proprietary directory and remote assets.
- Required Node/npm versions.
- Exact commands for installation, development, tests, linting, formatting, and performance tests.
- Current worker model and WebSocket protocol.
- Existing bot command pipeline.
- Map generation and spawn validation.

## Integration milestones

### I0 — Reproducible upstream

- Fork or clone the official repository.
- Pin the selected commit.
- Install with the repository's safe installation command.
- Run client and server locally.
- Run tests, lint, and performance suite.
- Record baseline CPU, memory, and network behavior.

### I1 — New game mode shell

- Add a `frontier` mode flag.
- Load one test map.
- Keep original OpenFront mode unchanged.
- Add feature flags for eras, fog, and respawn.

### I2 — Spawn and world regions

- Replace or extend spawn selection for the new mode.
- Add region availability data to the map configuration.
- Enforce valid spawns in the authoritative core.

### I3 — Era and economy modules

- Add data-driven era definitions.
- Add Food, Materials, and Knowledge or map them onto compatible existing values.
- Add structure unlocks and transition events.

### I4 — Fog and discovery

- Define visibility state and client-safe deltas.
- Prevent hidden information leakage in snapshots.
- Add stale intelligence indicators.

### I5 — Exile/respawn

- Separate player identity from current territory ownership.
- Add elimination, exile timer, spawn eligibility, protection, and re-entry commands.
- Update bots and victory logic.

### I6 — Alpha polish

- Onboarding.
- Historical summary.
- Telemetry.
- Performance and network load tests.
- Private multiplayer deployment.

## Upstream update policy

Do not continuously merge upstream while developing the vertical slice. Instead:

- pin one baseline;
- integrate in scheduled batches;
- keep a written divergence log;
- prefer cherry-picking critical security fixes;
- rebase only after passing our full suite.

## Exit option

If integration friction becomes greater than rebuilding a smaller purpose-built core, preserve the validated game design and replace the engine incrementally. OpenFront is a reference and accelerator, not a permanent architectural prison.
