# Architecture

Pocket Town is an English-language 3D browser game. Twelve citizens each run a real
*C. elegans* nervous system compiled out of the OpenWorm c302 repository, and everything
they do — walking, working, trading, promising, cheating, avoiding — is decoded from that
network instead of being scripted from a schedule.

## Runtime

1. `Start Game.cmd` starts `scripts/serve.mjs` using Node's built-in HTTP server.
2. The server serves only `dist/` on the loopback interface. It does not expose the source project or accept writes.
3. `dist/index.html` loads external CSS and JavaScript files from `dist/assets/` (engine, brain, simulation, app).
4. `src/main.js` boots `core/Application` and shows a readable error if initialisation fails.
5. Application coordinates input, the simulation, rendering, the HUD, the mind panel and periodic saves.

The town is advanced by **two clocks that share one cursor**. `requestAnimationFrame` paints
and, when it fires, advances the world by the real time elapsed; a 50 ms timer does the same.
Whichever wakes first consumes the elapsed milliseconds (`lastAdvance`), so the simulation can
never run twice as fast and never stops just because the page stopped painting. This matters
because an embedded preview, an occluded window or a background tab reports
`document.visibilityState === "hidden"` and then hands back no frames at all — a town that only
advances while it is being looked at is indistinguishable from a town whose people refuse to
move. Time is always fed to `Game.tick` in slices of at most 50 ms so the nervous systems never
integrate past their own dynamics, and painting falls back to the timer when the frame loop has
been quiet for more than 180 ms.

## Modules

| Folder | Responsibility |
| --- | --- |
| `src/core/` | Application startup and frame lifecycle |
| `src/input/` | Pointer picking, camera-relative walking, possession and steering keys |
| `src/world/` | Three.js scene, day/light cycle, speech bubbles, held goods, first-person camera |
| `src/data/` | Town places, goods, crafts, the twelve authored citizens, their voice packs |
| `src/data/connectome.gen.js` | **Generated** — the compiled OpenWorm nervous system |
| `src/brain/` | The spiking network, the neuromodulated learning rule, the behavioural decoder |
| `src/sim/` | Clock, economy, needs, and the social engine (`minds.js`) |
| `src/services/` | Versioned local save data |
| `src/ui/` | HUD, citizen card, place panel, society report, mind panel and About panel (`about.js`) |
| `scripts/` | Connectome compilation, preview server, release ZIP |
| `tests/` | Regression checks for the brain and for town life |

## The brain

`scripts/build-brain.mjs` reads three files from the OpenWorm c302 folder and writes
`src/data/connectome.gen.js`:

- `data/herm_full_edgelist.csv` gives every cell, connection, weight and connection type
  (7,379 connections: 4,681 chemical, 2,698 electrical gap junctions).
- `data/owmeta_cache.json` is OpenWorm's own database export and gives each cell's class,
  fast transmitter and receptor genes. 243 of the 285 neurons carry a named transmitter:
  129 cholinergic, 71 glutamatergic, 26 GABAergic, 8 dopaminergic, 7 serotonergic.
- `data/Bentley_et_al_2016_expression.csv` adds the neuropeptides each cell expresses.

`src/brain/network.js` simulates that graph in the browser:

- Each neuron is a single-compartment conductance-based integrate-and-fire cell with
  spike-frequency adaptation, a refractory period, gap-junction coupling and spontaneous
  tonic drive. Resting firing is roughly 1–3 Hz across the network, which is the range
  recorded in the real animal.
- Per-neuron thresholds, leak and adaptation come from the receptor genes owmeta records
  for that exact cell (`exc`, `inh`, `arouse`), so the twelve brains are not identical
  copies even before learning.
- Sensory stimuli are injected only into cells that really carry that modality
  (`foodOdour` → AW* and ASG, `touch` → ALM/AVM/OLQ, `internalState` → RIG/NSM/BDU, and so on).
- Reward is dopamine: current into ADE, CEP and PDE plus a phasic dopamine tone.
  Punishment is octopamine/tyramine through the RIC cells. Serotonin (ADF, NSM, RIS, HSN,
  RIH) sets a calming baseline.
- Learning is three-factor: a connection changes only if it fired inside the eligibility
  window *while* a modulator was present. The tonic amine level does not teach; a burst
  above the animal's own running baseline does. A slow homeostatic gain multiplier keeps
  the network out of both seizure and silence.
- Behaviour is read from the recorded motor system: command cells AVA/AVB/AVG/PVC give
  forward versus reverse, body-wall muscle quadrants give tension, roll and bend, head
  muscles give orientation, pharyngeal muscles give pumping. Channels are normalised
  against each brain's own recent baseline, because an urge is a relative state.

`src/brain/readout.js` compresses the learned wiring into five numbers the town can act
on — `appetite`, `restraint`, `social`, `empathy`, `craving` — each the mean learned
multiplier over a specific real set of connections. These are what make one villager
pushy and another cautious, and they move when that villager is rewarded or punished.

## The town

`src/sim/minds.js` gives each brain a body, needs, a day and a social life.

**The day.** Every citizen has authored hours (`shifts`) and three haunts in
`src/data/town.js`. `routine()` reads the clock: on shift the villager walks to a station at
their own workplace and stays there, working the yard and crafting on a cadence; when the
shift is over and it is light, they go to whichever of their haunts currently has somebody in
it; at night, or when their energy is gone, they walk home and sleep, which is where energy
actually comes back. This is what makes the town gather somewhere at some hour — a market at
noon, a park in the evening, empty streets at three — instead of scattering into a crowd by
the gate.

**Walking.** The destination comes from the town layer, the gait comes from the nervous
system. `move()` reads the recorded command cells (AVA/AVB/AVG/PVC) as a forward-minus-reverse
bias and multiplies it into a stride between a stall and a run, modulated by that brain's own
dopamine and octopamine tone; a reverse-biased animal loses ground rather than gliding over it.
Turning, slowing inside the arrival radius, and `mill()` — a small timed hop around wherever
they already are — keep a crowd visibly alive. `separate()` enforces about a metre and a half of
personal space, because two villagers standing in the same spot read as one broken model.

**Deciding.** Urges are scored every five ticks into two tracks. The day track (a shift, sleep,
an errand in hand) is the background that puts a body in a place. The social track
(greet, offer, ask, promise, gossip, accuse, shun, take) is judged on its own merits, because a
work urge scoring .8 would beat a greeting scoring .3 forever and the town would end up as
twelve people silently working. A neighbour within eight units and a pull above .45 is what stops
someone walking. After an exchange, `talkedWith` gives that pair an hours-long rest from each
other, so friendship does not turn into a loop of hellos.

**Talking.** `say()` refuses to start a second sentence while the first bubble is still being
read, and `queueReply()` puts an answer in the *other* person's mouth a moment later — a
conversation is two bubbles in a row, facing each other, not one monologue. Both parties get a
`talk` goal, so they turn to one another and wait.

**Trade** is a real transfer of goods between inventories. Whether an offer is accepted is
decided by the listener's brain, from how much they want the thing, how much they trust the
speaker, and how strong their braking wiring is.

**Promises** are ledger entries with a due day, and a good that is owed is reserved so it cannot
be traded away. The verdict is made **at the door**: `deliver()` rolls temptation (want ×
appetite × craving, plus hunger for edible goods) against restraint (braking wiring × trust × the
credit built by every promise kept so far × the fact that neighbours can see it). Keeping pays
dopamine to both sides; betraying pays the promiser a small reward for the goods they kept, the
victim an octopamine punishment, a rumour, and lost trust from anyone who watched. Three outcomes
stay separate in the town ledger: **kept**, **broken** (they were carrying the very thing and kept
it), and **failed** (they never got hold of it). Only the middle one is a betrayal of character.
Whether a villager breaks is a logistic drawn from those numbers, so teaching moves the odds
smoothly instead of over a cliff edge.

- Theft is the same tension without the paperwork: rewarded immediately, punished by witnesses,
  and much less tempting once this villager has already taken from this neighbour — a second
  robbery of the same person is a reputation, not a plan.
- Gossip writes one-sided suspicion; accusation can produce confession (when the accused's
  empathy and restraint wiring are strong enough) or denial.
- Being wronged once makes a villager cross the square to avoid the person who did it, so
  grudges change where bodies are, not only what they say.

Nine goods move through the town (`produce, bread, remedy, tool, cup, letter, flower,
book, lesson`) with recipes in `CRAFTS`. Wren's letters are promises with a delivery
target, which is how information travels.

`node scripts/diag-move.mjs 4320` runs the town headless and reports what the player would
actually see: metres walked per second, who is where, how many bubbles per town-hour and which
action produced them. `node scripts/tune-town.mjs 3` prints the moral balance over three days,
so the coefficients are measured rather than guessed (`MORAL='{"tempt":1.1}'` overrides them for
a single run). A representative fourteen-hour run: about 34 spoken lines per town-hour across
twelve people, 29 meetings, 40 offers, 9 promises kept, 3 broken, 1 theft, 4 rumours.

## Possession

Press **V** beside a citizen to enter their mind. `src/ui/mind.js` renders, live: what the
body senses, drives, motor readout, the five learned character numbers, the ranked urges,
a spike raster of named cells (AVA, AVB, ASE, ADE, CEP, NSM, RIM, AIB, RIC, AWC, PLM),
amine tone, trust, memories, and the teaching log. The camera moves to their head with
their own gait. **F** takes their motor loop: your keys become current injected into their
command and head-motor cells, which they can resist, and which drains their willpower.
**R** and **C** praise or condemn from inside, which is the training signal.

## Faithfulness, stated plainly

- The wiring diagram, cell classes, transmitters, receptor genes and neuropeptides are the
  real recorded data, compiled without edits from the OpenWorm files.
- The neuron model is a simplified point neuron, not the multi-compartment Hodgkin-Huxley
  morphology c302 generates for NEURON/openJMP. That simplification is what lets twelve of
  them run at once in a browser.
- Fifteen contractile cells that owmeta lists inside its 302-neuron roster (the eight head
  muscles, five pharyngeal muscles, ADAL/ADAR) are treated as effectors, which is what they
  are anatomically. The build script prints this reclassification.
- A nematode has no language. The brain decides whether a villager approaches, freezes,
  reaches, or opens their mouth; the words they say come from their own authored voice pack
  in `src/data/voices/`, chosen by their state.
- Stimulus-to-cell assignments, the five decoder numbers, and the urge table are
  interpretations — documented, testable, and deliberately kept narrow so the network, not
  the table, decides outcomes.

## Source and release

The root `index.html` is the development entry. `npm run brain` regenerates the connectome
module from the OpenWorm folder; `npm run build` compiles the game into `dist/`; `npm test`
runs the brain and town regression checks; `npm run package` zips the release with source,
build, launcher, docs and lockfile. Running the included build needs Node for the local
preview server but no dependency installation and no network access.


## Version 6.5: complete story and touch controls

`src/story/story.js` guards objective and choice transitions against duplicate submissions, completes all fifty authored chapters, and records three endings from the final town choice. The betrayal path at `The Price of Loyalty` can schedule a delayed accomplice ambush and add evidence. `src/story/state.js` keeps the v1 save key and normalizes older optional fields so existing saves remain resumable; pending choices are restored only for the matching chapter. Story tests cover every destination and stage, the final choices, replay, and save import/resume.

`src/input/controls.js` adds a virtual analog thumbstick, separate orbit/look pad and touch actions to observation mode. First-person controls in `src/story/story.js` use the same thumbstick and look interaction. Both overlays honor touch cancellation and pointer capture. On touch hardware the renderer lowers its pixel ratio and shadow map size while retaining cast shadows.

## Version 6.4: foliage, ground cover and lighting balance

`src/world/foliage.js` builds tree canopies from individually shaped, instanced leaves, and places instanced three-blade grass tufts and small wildflower patches over clear ground while skipping roads, building footprints and the pond. They cast and receive the scene's soft shadows. Grass placement uses wider per-cell jitter to soften the grid. `src/world/scene.js` blends a restrained sage ground texture with leaf and grass colors chosen to complement the warm masonry and roof tones. Streetlamps project broad radial pools and use longer-range point lights; both fade smoothly with the in-game dawn, day, dusk and night cycle.

## Version 6.3: town building materials

`src/world/buildings.js` creates tiled pitched roofs from individually placed, staggered shingle instances over a dark roof plane and caps the ridge in short rounded tiles. Wall faces carry a dark mortar base with raised, beveled cobbles; opening masks keep the stones clear of doors and windows. Timber doors use separated vertical boards over a dim recess. Windows use softly transparent panes and two subdivided curtain panels. `animateCurtains` deforms each panel from a changing wind vector and gust cycle; the scene advances it in both observation and story rendering. These details are shared by homes and public buildings.

## Version 6.2: friendly faces and resident walk cycles

The resident faces use smooth, enlarged game-style proportions, painted cheek color, soft brows, broad eyes, a simple button nose and a readable smile. Skin pore and hair-strand maps are omitted so faces read as authored game characters rather than tiny realistic people. `scripts/build-models.mjs` exports named shoulder, hip, and ankle pivots with each resident GLB. `src/world/scene.js` drives the alternating leg and arm swing, foot counter-rotation, and small step bounce from the resident's actual movement speed; the clock uses wall time so the walk cycle continues in story mode even when the scene receives a zero simulation delta.

## Version 6.1: resident character and material pass

`src/data/apparel.js` describes individual skin, hair, cloth and leather palettes, fabric patterns, body scale and occupational accessories for all twelve named residents. `scripts/build-models.mjs` generates a separate GLB for each person with shaped jacket and shirt layers, visible neck and face features, articulated sleeves and elbows, trouser panels and creases, stitched aprons, boot soles, eyelets and crossed shoelaces. The generator uses Three.js geometry and exports local binary glTF files to `public/models/villagers/`; the development and release package commands regenerate them before building.

`src/world/apparel.js` creates repeatable CanvasTextures locally for woven cloth, stripes, plaid, herringbone, knit, leather grain, skin and hair strands. Both story and observation mode use the same resident-specific models. `src/world/scene.js` keeps a detailed procedural person as a loading fallback, applies cast/receive shadows to loaded meshes, and adds a soft contact shadow which follows each resident's feet. The sun's shadow camera is fitted to the town, with ambient fill reduced so the folds and cast shadows remain visible. No remote textures, models, or art services are needed.

## Version 6: fifty chapter first person story

`index.html` owns the landing page and mode selection. `src/core/application.js` routes between landing, sandbox and story. `src/story/story.js` controls first person movement, camera, collision with public buildings, resident interactions, trades, survival, chapter choice events, touch controls, effects and HUD. `src/story/state.js` defines the fifty authored chapters, deterministic random state and validated JSON import. Every completed chapter presents three choices with visible betrayal and kindness odds; seeded outcomes affect health, supplies, money, trust, suspicion and the journal. The second chapter includes eat, deliver and hide grain outcomes. The story uses `pocket-town-story-v1`; the existing sandbox key is retained. Story mode parks residents outside their workplaces with small idle movements, using authored narrative choices rather than the sandbox neural loop. Sandbox resident positions are restored on exit and story positions are never written into the observation save.

On touch-first devices, `src/story/story.js` detects the coarse pointer and creates on-screen movement, camera-look, interaction and journal controls. Responsive styles adapt the HUD and choice board to compact portrait and landscape screens. Desktop keeps keyboard and drag-to-look controls.

Each resident-specific file in `public/models/villagers/` is a binary glTF 2.0 asset with named mesh parts and PBR materials. The generated files are copied into `dist/models/villagers/` and into the ZIP. If any model fails to load, the detailed procedural fallback remains playable.

Quest branches, economic recovery, missing items and deterministic risk have regression coverage in tests/story.test.mjs. Story saves can be exported from the journal and imported with an explicit replacement choice on the landing page.
