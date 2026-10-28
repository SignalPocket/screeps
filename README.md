# Screeps

Personal Screeps colony, edited directly in Steam's local script folder.

## One-folder workflow

Open this folder in VS Code. Edit main.js and save; Steam synchronizes the
script to the local server's default branch. Saves can affect the running colony.
Commit and push separately to save version history in the private GitHub repository.
There is no second deployment folder or copy step.

Local server: 127.0.0.1:21025. Game account: ginaria. Branch: default.

## Starter

Worker counts are capped at five per source and twenty per room. Creeps harvest,
withdraw from containers, scavenge dropped energy, refill spawns and extensions,
build construction sites, and upgrade the controller. No automated defense or
expansion yet.

## Check

Run npm run check for JavaScript syntax validation. This does not simulate the game.
Keep credentials out of Git.

## References

- https://docs.screeps.com/
- https://docs.screeps.com/api/