# Preservation record

Stable key: screeps-preservation-2026-11-06T194031Z.
Completed November 6, 2026. Source: C:/Users/katie/AppData/Local/Screeps/scripts/127_0_0_1___21025/default.

Verified archive: C:\Users\katie\.codex\automations\structured-ink\screeps-planning\preservation\20261106T194031Z\repository-with-git.zip

Manifest: C:\Users\katie\.codex\automations\structured-ink\screeps-planning\preservation\20261106T194031Z\manifest.json

The archive contains 1990 files including the entire local .git directory, tracked files, untracked work, and project documentation. Each archived entry was read back and checked against its SHA-256 hash and the source; the source file set was checked again. ZIP integrity validation passed. Archive SHA-256: f0536e8c363f371ec939982011218f699e653ed4af7deadc5eca256e4bdd801d.

At the end of observation, all 142 JavaScript files still matched their preserved hashes. No gameplay file was edited, staged, committed or pushed. This is a private local recovery copy, not an off-device backup. It may contain local configuration; do not upload it wholesale.

## Restore procedure

Stop and identify the intended saved version before restoration. Extract repository-with-git.zip into a NEW isolated folder outside Steam's synchronized script directory. Compare the extracted file paths, sizes and SHA-256 hashes with manifest.json. Inspect Git history and the working tree there. Never extract directly over running scripts; delivery of restored gameplay code is a separate reviewed action. This preserves source and Git history; it is not a complete server installation backup.

The pre-start server database was separately preserved at C:\Users\katie\.codex\automations\structured-ink\screeps-planning\saved-state-2026-11-06\db-snapshot.json. Its SHA-256 is recorded in baseline.json beside it. It includes saved world state, not a claim of live health.

An earlier archive in preservation/20261106T193936Z has no success manifest because a verification comparison used inconsistent path ordering. It is retained as an incomplete attempt; the later manifest above identifies the verified recovery copy. No source repair or overwrite was needed.
