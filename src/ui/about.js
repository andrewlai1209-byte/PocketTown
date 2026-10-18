import {BRAIN_INFO} from '../brain/network.js';

const meta = BRAIN_INFO.meta;

export const ABOUT_PANEL = `
  <div class="eyebrow">ABOUT THE GAME</div>
  <h2>A small town, many minds</h2>
  <p class="about-lead">Pocket Town is a 3D society sandbox. Each resident carries a simulated nervous system, a job, a memory, and a place in a changing community.</p>

  <section class="about-section">
    <h3>What makes it fun</h3>
    <p>Explore the town, meet its residents, watch their routines, and step inside a citizen's point of view. Offer help, trade, make promises, reward or condemn a decision, then see how that lesson changes tomorrow.</p>
    <p>Residents do not all make the same choice. Their needs and learned circuits can lead to cooperation, gossip, conflict, a kept promise, or betrayal. The town remembers those outcomes.</p>
  </section>

  <section class="about-section">
    <h3>Research meaning</h3>
    <p>The project is an interactive educational prototype for asking how a biological network, body needs, learning signals, and social rules might combine to shape behavior. Players can observe choices, change the feedback a citizen receives, and compare what happens next.</p>
    <p class="about-caution"><b>Interpret with care:</b> this is a game and a model, not a validated scientific experiment. A worm connectome is not a human mind. The simplified neuron dynamics, sensory mapping, social rules, and English dialogue are interpretations or design choices. The model can inspire questions; it cannot establish scientific conclusions by itself.</p>
  </section>

  <section class="about-section">
    <h3>How it was made</h3><p>A Winter Promise is an authored first person adventure with fifty story chapters, probability-driven choice events, survival resources, touch controls, and independent local saves. The outcomes use a seeded local random system and leave persistent changes in the journal, relationships, inventory, and suspicion. The observation sandbox uses the neural model described below. Twelve resident-specific GLB characters are generated locally by scripts/build-models.mjs, with smooth game-style faces and walk cycles driven by shoulder, hip, and ankle pivots. Procedural fabric and surface textures are applied locally in Three.js.</p>
    <div class="about-fact"><span>Recorded network</span><b>${meta.neurons} neurons · ${meta.effectors} effectors · ${meta.edges.toLocaleString()} connections</b></div>
    <div class="about-fact"><span>Connection data</span><b>${meta.chemical.toLocaleString()} chemical · ${meta.gapJunctions.toLocaleString()} electrical</b></div>
    <p>OpenWorm c302 data is compiled into a local JavaScript module. A browser-friendly, single-compartment spiking model runs each resident's network. Sensory signals enter the model, motor activity influences movement, and reward or punishment can update eligible connections.</p>
    <p>Three.js draws the 3D town. JavaScript modules handle the world, brains, social simulation, controls, interface, and local save data. English voice lines are authored for the characters; a worm brain does not generate language.</p>
  </section>

  <section class="about-section">
    <h3>Resources and credits</h3>
    <ul class="about-links">
      <li><a href="https://github.com/openworm/c302" target="_blank" rel="noopener noreferrer">OpenWorm c302</a> — connectome and model source project.</li>
      <li><a href="https://doi.org/10.1371/journal.pcbi.1005283" target="_blank" rel="noopener noreferrer">Bentley et al. (2016), “The multilayer connectome of Caenorhabditis elegans”</a> — monoamine and neuropeptide network data.</li>
      <li><a href="https://threejs.org/" target="_blank" rel="noopener noreferrer">Three.js</a> — 3D rendering library; its MIT license is included in the project.</li>
      <li><b>Vite</b> — local development server and build tool.</li>
      <li><b>Game art and dialogue</b> — town geometry, characters, interface, and English character voices are authored in this project; no external image or audio pack is required.</li>
    </ul>
    <p class="about-footnote">Source data and simplified modeling choices are documented in the project's Architecture guide. The game stores progress in this browser and does not send save data to a server.</p>
  </section>
`;
