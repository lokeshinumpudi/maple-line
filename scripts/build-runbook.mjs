import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const out = 'artifacts/runbook-site';
await mkdir(`${out}/assets`, { recursive: true });
let playbook = await readFile('runbook/playbook.html', 'utf8');
const start = playbook.indexOf("  const main = '");
const end = playbook.indexOf('  let group;');
const data = runInNewContext(
  `${playbook.slice(start, end).replace("  const selector = el('lesson');", '')}\n({lessons:lessons.map(l=>({...l,sample:l.code(l.initial)})),referenceAssets,gameReferences})`,
  {},
  { timeout: 2000 },
);
const slug = (title) =>
  `maple-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-$/, '')}`
    .slice(0, 63)
    .replace(/-$/, '');
const allSkills = [];
for (const [index, reference] of data.gameReferences.entries()) {
  if (!data.referenceAssets[reference.asset])
    throw new Error(`Chapter ${index + 1} has no image: ${reference.asset}`);
}
if (data.lessons.length !== data.gameReferences.length)
  throw new Error('Every lesson needs a game reference.');
for (const [name, uri] of Object.entries(data.referenceAssets)) {
  await writeFile(`${out}/assets/${name}.jpg`, Buffer.from(uri.split(',')[1], 'base64'));
  playbook = playbook.split(uri).join(`./assets/${name}.jpg`);
}
for (const lesson of data.lessons) {
  const name = slug(lesson.title);
  const source = `https://github.com/lokeshinumpudi/maple-line/blob/main/${lesson.source.split(';')[0]}`;
  const reference = lesson.docUrl || `https://threejs.org/docs/pages/${lesson.doc}.html`;
  const skill = `---\nname: ${name}\ndescription: ${JSON.stringify(`Apply ${lesson.title.toLowerCase()} when implementing or reviewing the corresponding part of a browser game. Use for this concept's behavior and validation, not unrelated game systems.`)}\n---\n\n# ${lesson.title}\n\n${lesson.definition}\n\n## Apply the concept\n\nRead the relevant implementation before editing it. In Maple Line, start with [the related source](${source}); in another project, locate the equivalent system. Preserve the user's requested scope.\n\n${lesson.impact}\n\n${lesson.studio ? `Current Maple Line context: ${lesson.present}\n\nProposed improvement: ${lesson.next}\n\nAcceptance check: ${lesson.accept}\n\nTradeoff: ${lesson.tradeoff}` : `Use this focused exercise to check the concept: ${lesson.exercise.replace(/^Try next: |^Build next: /, '')}`}\n\n## Working example\n\nThis is ${lesson.studio ? 'a proposed sketch, not a completed feature' : 'a teaching example; check current source before copying API calls'}. Adapt surrounding setup to the project.\n\n\`\`\`js\n${lesson.sample}\n\`\`\`\n\n## Verify the result\n\nCompare the changed behavior in a fixed scene and camera. Inspect browser errors. For rendering cost, compare the same viewport and weather; for stateful behavior, test interruption and resumption. Report what was observed and what remains untested. In Maple Line, run the relevant package checks from the workspace root and preserve the separation of serializable state and Three.js objects.\n\nThe source snapshot was inspected on 21 September 2026. Planned improvements are not evidence of shipped behavior. This skill does not authorize publishing, changing credentials, or touching unrelated projects.\n\nReference: [${lesson.docLabel || 'Three.js documentation'}](${reference})\n`;
  await mkdir(`${out}/skills/${name}`, { recursive: true });
  await writeFile(`${out}/skills/${name}/SKILL.md`, skill);
  allSkills.push({ title: lesson.title, name, skill });
}
await writeFile(`${out}/skills.json`, JSON.stringify(allSkills));
await writeFile(
  `${out}/all-skills.md`,
  allSkills.map((x) => x.skill).join('\n\n<!-- Next skill -->\n\n'),
);
const archive = execFileSync('zip', ['-qr', '-', 'skills'], { cwd: out });
await writeFile(`${out}/skills-pack.json`, JSON.stringify({ base64: archive.toString('base64') }));
const css = await readFile('runbook/style.css', 'utf8');
const enhance = await readFile('runbook/enhance.js', 'utf8');
playbook = playbook.replace('  update();\n})();', `${enhance}\n  update();\n})();`);
playbook = playbook.replace(
  '<select id="maple-lesson" class="form-select">',
  '<select id="maple-lesson" class="form-select" tabindex="-1">',
);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="An illustrated field guide to Maple Line: 36 interactive lessons in Three.js and game craft, with reusable agent skills."><meta name="theme-color" content="#eee9df"><title>Maple Line — A field guide to making worlds</title><style>${css}</style></head><body>
<a class="skip" href="#studio">Skip to the lessons</a>
<header class="masthead"><a href="#" class="wordmark"><span class="seal">M</span> MAPLE LINE <span class="thin">/ FIELD NOTES</span></a><nav><a href="#studio">The runbook</a><a href="./all-skills.md" class="download-pack" download>Skill collection ↗</a><a href="https://signal-ship.internal.loophealth.com/s/maple-line/" class="play-link">Play the game ↗</a></nav></header>
<section class="cover" aria-labelledby="cover-title"><div class="cover-copy"><p class="eyebrow">A game maker’s field guide · Vol. 01</p><h1 id="cover-title">Small worlds.<br><em>Deep craft.</em></h1><p class="cover-description">The light on the river. The rhythm of the rails. The rules that make a place feel alive.</p><a class="begin" href="#studio">Open the runbook <span>↓</span></a><div class="cover-index"><span><b>36</b> concepts to explore</span><span><b>36</b> skills to take with you</span></div></div><figure class="cover-art"><img src="./assets/train.jpg" alt="A Maple Line train crossing a countryside scene"><div class="art-caption"><span>Fig. 01 — Built one detail at a time</span><span>MAPLE LINE / THREE.JS</span></div><span class="vertical-note" aria-hidden="true">WORLD BUILDING IS A PRACTICE OF ATTENTION</span></figure></section>
<div class="chapter-ribbon"><span>Observe</span><i>—</i><span>Understand</span><i>—</i><span>Experiment</span><i>—</i><span>Make it yours</span></div>
<section id="studio" class="studio"><aside class="contents"><details open><summary>Contents <span>36 field notes</span></summary><label class="search-label" for="concept-search">Find a concept</label><input id="concept-search" type="search" placeholder="Light, water, sound…" autocomplete="off"><div id="chapter-list"></div><p id="search-empty" hidden>No matching concepts.</p></details><a class="pack-link download-pack" href="./all-skills.md" download>Download all 36 skills <span>↓ ZIP</span></a><p class="contents-foot">Written from a working game.<br>Keep the craft. Make it your own.</p></aside><main class="lesson-page">${playbook}</main></section>
<footer><a href="https://github.com/lokeshinumpudi/maple-line">Source & research ↗</a><span>Maple Line · Field notes, September 2026</span><a href="https://signal.internal.loophealth.com">Built by Loki ↗</a></footer></body></html>`;
await writeFile(`${out}/index.html`, html);
await writeFile(
  `${out}/ship.json`,
  JSON.stringify({ access: { visibility: 'public' }, badge: false }),
);
console.log(
  `Built ${data.lessons.length} lessons and ${allSkills.length} downloadable skills in ${out}`,
);
