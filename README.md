# Screeps

A fresh personal Screeps World project. Plain JavaScript, with no dependencies.

## Starter colony

`src/main.js` exports the game loop. It maintains up to six small workers per
owned spawn room. Workers harvest energy, refill spawns and extensions, protect
the controller against downgrading, build placed construction sites, and upgrade
the controller. Dead creep memory is cleaned each tick.

This is a learning bootstrap, with no automated defense, expansion, road planning,
or advanced logistics. It has not yet been tested inside the game.

## Local check

Run `npm run check` to check JavaScript syntax. This does not simulate the game.

## First game session

1. Open Screeps World and start in the simulation or tutorial.
2. Place your first spawn.
3. After reviewing the starter, copy `src/main.js` into the game's `main` module.
4. Commit in the game editor and watch the first workers.
5. Place extension construction sites as controller levels allow.

There is no automatic upload or deployment. Keep account tokens out of Git.
External synchronization can be configured later after choosing the game account,
server, and branch.

## References

- [Official documentation](https://docs.screeps.com/)
- [Game API](https://docs.screeps.com/api/)
- [External synchronization](https://docs.screeps.com/commit.html)
