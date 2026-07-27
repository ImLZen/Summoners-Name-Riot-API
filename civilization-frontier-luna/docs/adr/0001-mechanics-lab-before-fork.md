# ADR 0001: Validate mechanics before modifying OpenFront

- Status: Accepted
- Date: 2026-07-21

## Context

The desired game differs from OpenFront in progression, visibility, spawning, economy, elimination, and match narrative. Modifying all of these inside a large active codebase would make it difficult to distinguish bad game design from integration bugs.

## Decision

Build a no-dependency local mechanics lab first. Use it to validate the loop and vocabulary. Integrate only after the required systems are understandable and at least directionally fun.

## Consequences

- Some prototype code will be discarded.
- Product iteration becomes much faster.
- Integration begins with clearer acceptance tests.
- We avoid coupling every idea to upstream implementation details.
