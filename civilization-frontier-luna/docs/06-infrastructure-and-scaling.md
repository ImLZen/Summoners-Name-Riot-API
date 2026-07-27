# Infrastructure and Scaling

## Principle

Spend almost nothing before the game proves retention. Scale by measured simultaneous matches, not registered accounts or optimistic forecasts.

## Local development

The developer machine can host:

- browser clients;
- local authoritative server;
- bots;
- telemetry collector;
- load generator.

A 600 Mbps symmetric wired connection provides substantial network headroom for private tests. The unknown capacity is primarily simulation CPU per tick, memory per match, and domestic reliability. No player-capacity promise should be made before a benchmark.

## Private alpha architecture

- One general-purpose VM.
- Reverse proxy with TLS.
- Lobby/API process.
- One or more match worker processes.
- PostgreSQL only when accounts are introduced.
- Object storage only when replays need persistence.
- Basic metrics, logs, and automated restart.

## Capacity model

Measure these quantities:

- CPU milliseconds per simulation tick.
- Peak and steady RAM per match.
- Outbound bytes per player-second.
- Commands per player-second.
- Snapshot/delta size.
- Event-loop lag.
- Tick deadline misses.
- reconnect and replay catch-up cost.

Capacity formula:

```text
safe matches per machine = floor(
  min(
    usable CPU budget / measured CPU per match,
    usable RAM / measured RAM per match,
    usable outbound bandwidth / measured bandwidth per match
  ) * safety factor
)
```

Use a safety factor of 0.5–0.7 during alpha.

## Hosting stages and indicative budget bands

These are planning bands, not quotes:

- Local mechanics lab: 0 €/month.
- Private alpha: roughly 15–60 €/month.
- Small public beta: roughly 100–500 €/month.
- Thousands of simultaneous players: measurement-driven, likely hundreds to several thousands per month depending on match size and protocol efficiency.

## Home server policy

Acceptable for:

- local development;
- invited tests;
- temporary supervised sessions.

Not recommended for permanent public hosting because of:

- exposure of the home network;
- IP and router constraints;
- power/restart downtime;
- lack of DDoS protection;
- maintenance burden;
- no availability guarantee.

## Load-test gates

Before each stage:

1. Synthetic bots at target concurrency.
2. 60-minute soak test.
3. Network impairment test.
4. reconnect storm test.
5. peak command-spam test.
6. one-machine failure simulation.
7. cost-per-player-hour calculation.
