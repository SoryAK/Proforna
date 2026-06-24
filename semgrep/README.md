# Semgrep — codified slice traps as deterministic rules (Tier A2)
#
# Each rule encodes a known regression pattern from Resumsify's accumulated
# memory notes / slice manifests. Moving them from Column 2 (LLM semantic
# verification) to Column 1 (deterministic at-commit gate) catches them
# repo-wide for free and lets gemma4 focus on truly novel issues.
#
# To add a rule:
#   1. Identify a recurring trap (memory note, slice manifest knownTrap, or
#      Column 3 finding).
#   2. Write the rule as YAML in semgrep/rules/<kebab-name>.yml.
#   3. Test: `npm run review:semgrep` (should match the offending file when
#      present, find nothing otherwise).
#   4. Document the rule's origin in its YAML metadata.severity / metadata.note.
#
# Reference: ADR-0047 Column 2 → Column 1 promotion path.
# Seeded with 3 rules on 2026-06-24 to prove the wire-up.
