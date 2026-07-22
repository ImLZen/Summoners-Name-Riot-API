# Licensing and Brand Plan

## Current working assumption

Using the modern OpenFront codebase creates an AGPL-licensed derivative. Network users must be offered the corresponding source under the license terms, and additional attribution requirements must be preserved. Repository assets and proprietary/external assets require separate treatment.

This document is an engineering compliance checklist, not legal advice.

## Required controls

- Pin and record the upstream commit.
- Preserve copyright notices required by the upstream license.
- Include the full applicable license text.
- Publish corresponding source for the network-deployed derivative.
- Maintain a third-party notices file.
- Track every copied or modified asset and its license.
- Do not use assets from the proprietary directory.
- Do not extract remote premium/CDN assets.
- Use a distinct game name, logo, domain, and visual identity.
- Avoid implying endorsement by OpenFront.
- Obtain legal review before commercial public launch.

## Alternative path

Historical portions may have different licenses. Using them safely would require commit-level provenance analysis and careful separation. Do not assume an old permissive license covers later rewrites or assets.

## Monetization compatibility

AGPL does not itself prohibit charging money. The business model can sell hosting, cosmetics, convenience, community features, and services while complying with source obligations. Proprietary art and brand assets created independently can remain separate where license boundaries are respected; legal review is required for the final packaging model.
