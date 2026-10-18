# Pocket Town 3D — A Winter Promise

Version 6.5 validates the full fifty-chapter story, saves and three final choices, and adds a delayed betrayal branch. Story and observation mode now share thumbstick movement, independent look controls and touch actions; the mobile renderer scales its pixel ratio and shadow map to stay responsive. The natural scene has fuller, more irregular leaf clusters, less grid-like ground cover and small wildflower patches. Version 6.4 added visible leaves, grass shadows and wider day-night streetlamp glows. Version 6.3 adds individually spaced roof shingles with dark underlay and ridge caps, raised cobble walls, timber doors with dim seams, and curtains that respond to changing wind. Version 6.2 gives twelve residents friendly, stylized game faces and animated shoulder, hip, and ankle pivots. Version 6.1 added individually styled resident GLB characters with fabric surface maps, stitched clothing, and ground shadows. All game text is English.

## A Winter Promise — first person story

Choose New story or Continue story on the landing page. WASD moves; drag the mouse over the 3D scene to look around, even when browser pointer capture is unavailable. Arrow keys also turn. E interacts and J opens the journal. On phones and tablets, the game detects touch input and adds a movement pad, a drag-to-look pad, and large interaction controls. The layout adapts to screen size and orientation. A live 50-chapter story bar, compass, golden beacon, and follow particles guide you to the current main objective.

Fifty authored chapters follow the missing winter shipment from Wren’s first letter through witness protection and the town’s final council. Every completed chapter opens a choice board. Choices show betrayal and kind-response odds before selection, then produce a seeded outcome recorded in the journal. Harvest choices include eating, delivering, or hiding grain. Outcomes can shift health, food, money, evidence, trust, and suspicion. The Clinic offers treatment and rest. Extra Farm shifts provide a renewable wage.

Your health, food, money, inventory, evidence, position, orientation, random seed, journal and main quest save automatically every five seconds and after choices. Main menu also saves. Continue story restores the same life; New story and Play again replace the story slot after confirmation. The original observation save has its own key and remains separate. Export a JSON save from the journal and Import story save from the landing page to move story progress between browsers or local server addresses. Browser storage may be unavailable in private sessions; use export for a portable backup.

The story and observation modes load twelve resident-specific GLB characters authored in `scripts/build-models.mjs`, under `public/models/villagers/`. Role palettes and silhouette details are defined in `src/data/apparel.js`; small repeatable fabric, leather, skin, and hair surface maps are generated locally in `src/world/apparel.js`. Shoes include eyelets and crossed laces; clothing includes seams, folds, cuffs, pockets, and trade-specific accessories. The Three.js scene enables cast and receive shadows, with a soft contact shadow under each resident. No external model or texture download is required.

Trees use distinct instanced leaf shapes with cast and receive shadows. The ground uses instanced three-blade grass tufts and small wildflower patches while leaving roads, pond and building footprints clear. Six streetlamps use broad soft ground glows and longer-range point lights, with intensity following the in-game day-night cycle. `src/world/foliage.js` owns the reusable foliage geometry; colors are tuned to sit comfortably with the warm stone and roof palette. Touch devices use a lower pixel ratio and shadow map size while keeping plant and resident shadows.

## Observation sandbox

The original living town remains available from Enter observation town. It uses a simplified C. elegans network compiled from the OpenWorm c302 project. The English research explanation, modeling limits and resource links are on the landing page under Behind the town.

## Play the included build

1. Extract the ZIP completely into a folder.
2. Install Node.js 20.19+ if it is not already available.
3. Double-click **Start Game.cmd** on Windows.
4. Keep the launcher window open while playing. The game opens in your browser.

The included build needs no `npm install` and no internet. The launcher serves `dist/`
through a local read-only server on port 4173 (it picks another port if needed). Stop with
Ctrl+C in the launcher window. On macOS or Linux: `node scripts/serve.mjs --open`.

Do not open the HTML file directly; the game loads several modules and must be served.

## What the town does by itself

Every citizen keeps their own hours. On shift they walk to a station at their own workplace
and work the yard; when the shift ends they go to whichever of their haunts has somebody in
it; at night, or when they are spent, they walk home and sleep. Speed **1** is a real walking
pace — about 2.5 town units per second, so a crossing of the square takes a few seconds and a
work shift lasts a morning. Watch one villager from the citizen card ("Enter their mind") and
you will see the day happen: they leave the house, meet someone on the way, stop, turn to
face them, answer, then finish the walk to the Bakery.

The simulation is driven by a timer as well as by the paint loop, so a page that reports itself
hidden — an embedded preview, an occluded window, a background tab — keeps living instead of
freezing. If the town ever looks motionless, check the speed readout in the header rather than
the clock: at **1×** one town-day is six real minutes.

## Controls

Outside a head:

- Drag orbit, scroll zoom, **WASD** or arrows to walk, click ground to walk there.
- Click a citizen or building, or press **E**, to interact.
- **👥 Society** shows promises, betrayals, rumours and each villager's ledger;
  **🧠 Brains** explains exactly which OpenWorm data is running and what is simplified.

Inside a head (press **V** next to somebody):

- The camera takes their eyes and their gait; drag to look around.
- The left panel is live: what their body senses, their drives, motor readout from real
  muscle groups, the five learned character numbers, the ranked urges competing for
  control, a spike raster of named neurons, amine tone, trust, memories.
- **F** takes their motor loop: your keys push on their own command cells. They can resist,
  and holding on drains their willpower.
- **R** praises, **C** condemns. Both are teaching signals — they change which synapses get
  stronger or weaker, so tomorrow this villager is slightly different.
- **Esc** or **V** leaves them alone.
- **ⓘ About** explains the game, research context, implementation and data resources.

Progress saves in your browser, including every villager's learned synaptic weights.

## Training a town

Nothing here is scripted as "be honest". A villager keeps a promise when their braking
wiring, the trust they hold for you, and the credit from past kept promises outweigh the
temptation of the goods in their hands. Keep the town rewarding — gifts, praise, delivered
promises — and neighbours who cheat get shunned, accused and denied trade. Punishment is
octopamine; reward is dopamine; both are the animal's own cells.

Trade, theft, gossip and confession all work the same way: two nervous systems meeting,
each deciding from its own history.

## Editing the project

```bash
npm install
npm run dev        # Vite development entry
npm run brain      # rebuild src/data/connectome.gen.js from the OpenWorm c302 folder
npm test           # 21 regression checks on the brain and on town life
npm run build      # playable multi-file build in dist/
npm run package    # generate resident GLBs, build, and create releases/Pocket-Town-3D-*.zip
```

`npm run brain` reads `herm_full_edgelist.csv`, `owmeta_cache.json` and
`Bentley_et_al_2016_expression.csv` from the OpenWorm c302 folder (path passed as an
argument, default `../OpenWorm c302/c302` on this machine). It adds no connections and
invents no cells; it prints what it interpreted.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the module map and an honest list of
what is real data versus what is modelled. Third-party licences are in `licenses/`.

Citizen decisions come from their nervous systems; the words come from hand-authored voice
packs in `src/data/voices/`. No online AI account or API key is required.
