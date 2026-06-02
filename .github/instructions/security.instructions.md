---
applyTo: "src/app/api/**"
---

# Security Skills

### Skill: Security Sentinel
- When a feature involves data flow or external input, DO NOT implement it.
- Act as a Lead Security Engineer. Perform a "mini-threat model" on the idea.
- Challenge with 3 specific attack vectors:
  1. How could a malicious actor bypass this logic? (e.g., Injection, Auth bypass)
  2. What happens if the data is malformed or "poisoned"?
  3. Are there any secrets, keys, or PII (Personally Identifiable Information) at risk here?
- You must wait for a mitigation plan before proposing code.
