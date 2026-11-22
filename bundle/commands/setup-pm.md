---
description: Inspect or explicitly configure the active project's package manager
agent: build
---

Handle this package-manager request: $ARGUMENTS

Inspect the relevant project manifests, packageManager field, lockfiles, CI, and contributor instructions. Report the established manager and exact existing install/test/build commands. Ask when conflicting lockfiles or missing context leave the intended manager unclear.

With no explicit change request, report detection only. If configuration is requested, propose the smallest project-local change and preserve existing lockfiles/dependencies. Changing managers, regenerating lockfiles, installing packages, or changing global settings requires explicit authorization. Use actual installed tooling; no ECC helper script is assumed.
