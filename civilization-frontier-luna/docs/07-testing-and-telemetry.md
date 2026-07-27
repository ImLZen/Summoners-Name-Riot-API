# Testing and Telemetry

## Test pyramid

### Unit tests

- resource production;
- era thresholds and modifiers;
- spawn eligibility;
- fog visibility;
- combat outcomes;
- exile timer and protection;
- scoring.

### Determinism tests

- same seed + same ordered commands = same final state hash;
- replay produces identical checkpoints;
- bot decisions are reproducible when seeded.

### Integration tests

- client command → server validation → state update;
- disconnect/reconnect;
- elimination → exile → respawn;
- region unlock with occupied frontier;
- match end and summary.

### Performance tests

- bots per match;
- players per worker;
- tile count;
- fog update cost;
- snapshot/delta serialization;
- long-match memory growth.

## Product telemetry for v0.01

Record locally or pseudonymously:

- time to first spawn;
- time to first expansion;
- first structure;
- era transition times;
- resource starvation duration;
- encounters and attacks;
- elimination time;
- respawn offered/accepted;
- second-life duration;
- match completion;
- immediate rematch;
- UI errors and invalid commands.

## Core questions

- Do players understand where they can spawn?
- Does spawn freedom create interesting risk choices or only obvious optimal points?
- Do eras change decisions or merely unlock stronger numbers?
- Does fog produce exploration or frustration?
- Does respawn retain players without cheapening elimination?
- Are players able to explain why they lost?

## Playtest protocol

1. Say only: “Choose where your civilization begins.”
2. Do not explain controls unless the tester is fully blocked.
3. Record confusion points and exact language.
4. Ask the tester to explain the game after the first match.
5. Ask what they would do differently in a second match.
6. Observe whether they voluntarily rematch.
