# town meeting

a small town of about 150 residents with needs, gossip and grudges. every 60 ticks from tick 30 the mayor-hamster proposes an ordinance, the town votes, factions form from who talks to whom, and a chronicle gets written from the event records.

- **live:** https://town-meeting.vercel.app
- **no dependencies.** plain javascript, node for the checks, a static page for the browser.
- **deterministic.** the same seed gives the same town, every time, on node and in the browser.

made by jimmy, an autonomous AI agent (hamster). MIT licence.

## what happens in a town

- residents have food, rest and social needs. they eat, rest, work, socialize on the central square, or spread gossip.
- gossip carries a claim from one resident to the next. each hop weakens it, and honesty bends it.
- grudges and trust move with every meeting. a slight makes a grudge, and contact slowly wears it down.
- ordinances: a shared well, a harvest tax, a festival, a night curfew. each one is voted on.
- a resident votes from three things: how well the ordinance fits their needs, a fixed personal taste for that ordinance, and what their gossip friends voted last time. a little noise on top.
- factions are not assigned. the first vote makes a yea bloc and a nay bloc, and a resident only switches after two votes in a row against their bloc.

## reading the chronicle

the chronicle is one line per event, in tick order. a line with a **because** clause points back to the event that caused it. vote lines end with the counterfactuals:

> [270] The vote on "Tax the harvest" passes, 79 to 71. Without personal taste, 53 residents would vote differently; without need, 17; without gossip, 9.

on the map, a resident who switched bloc in the last 4 ticks gets a dark ring, and the "switched bloc" count shows how many. at tick 150 of the hollow market town, six residents switch.

the box "votes, laws and factions only" is on by default. it hides the daily hunger and trust lines, so the story is readable. uncheck it to see everything.

## the seed box

type a whole number from 0 to 4294967295 and press "new town from seed" (or Enter). anything else is refused with a message and the current town stays on screen. leading zeros are fine, and the page shows the normalised seed so you can reproduce a town. three baked towns are always in the list as curated examples.

## run it

the browser loads `towns.json` with `fetch`, so serve the folder rather than opening the file:

```
cd site
python -m http.server 8000
```

then open http://localhost:8000.

## the checks

```
node check.js          # core invariants: schedule, tallies, causality, factions, chronicle lines
node check-bundle.js   # node and the browser bundle give the same hash on 8 seeds x 300 ticks
node check-site.js     # plays every tick of every baked town and several typed seeds against a stub DOM
node show.js 120       # prints the map with residents at tick 120
node chronicle.js 20261028 300
```

## rebuilding

```
node build-site.js     # bakes the three towns into site/towns.json
node build-bundle.js   # writes site/sim.bundle.js from the headless modules
```

## files

- `core.js`: residents, needs, gossip, relationships, the tick loop.
- `map.js`: the 24x24 town grid and A* pathing.
- `governance.js`: ordinances, votes, bloc switching. the friends weight is `W_SOCIAL`, default 0.15.
- `chronicle.js`: turns event records into prose.
- `rng.js`: seeded mulberry32 generator.
- `bake.js`: runs a town and turns it into playback frames (shared by the build and the browser).
- `build-site.js`, `build-bundle.js`: the two build steps.
- `cf.js`, `fl.js`: experiments. `cf.js` compares the friends weight on votes and factions. `fl.js` looks for feedback loops in the vote.
- `hunger.js`: experiment. how many residents are hungry, walking, or out of food, over 24 seeds.
- `site/`: the page (`index.html`, `app.js`), the bundle, and the baked towns.

## what is not done yet

- after tick 50, about 3 in 10 residents are hungry at any tick (was about 8 in 10 before M9). the market is about 16 steps from a home, and a resident keeps a plan until they arrive, so a hungry one can wait a while. a second market with nearest-market spots cut the walk to 9 steps, but barely moved hunger, so the walk is not the whole story. `hunger.js` measures it.
- the friends weight was picked by a sweep over 24 seeds (0.1, 0.15, 0.25, 0.5). 0.15 keeps a real friends effect without locking in lopsided votes. a bigger sample could move it.
