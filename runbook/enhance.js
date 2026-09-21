  const list = document.getElementById('chapter-list');
  const search = document.getElementById('concept-search');
  const skillPanel = document.createElement('section');
  skillPanel.className = 'skill-panel';
  skillPanel.innerHTML = '<div class="skill-heading"><div><p class="eyebrow">Take the technique with you</p><h3>Your next agent skill.</h3></div><span class="skill-symbol" aria-hidden="true">↗</span></div><p>A focused set of instructions for applying this concept. Copy it into your agent, or save it as <code>SKILL.md</code> in a skill folder.</p><div class="skill-actions"><button id="copy-skill" type="button">Copy this skill <span>↗</span></button><a id="download-skill" download="SKILL.md">Download SKILL.md ↓</a></div><details><summary>Read the skill</summary><pre id="skill-preview"></pre></details><p id="skill-feedback" role="status" aria-live="polite"></p>';
  root.append(skillPanel);
  let skillData = [];
  const slugify = title => `maple-${title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'')}`.slice(0,63).replace(/-$/,'');
  const navButtons = [];
  let currentStage;
  lessons.forEach((lesson,index)=>{
    if(currentStage!==lesson.stage){currentStage=lesson.stage;const heading=document.createElement('h3');heading.textContent=currentStage;list.append(heading);}
    const button=document.createElement('button');button.type='button';button.className='chapter-link';
    const number=document.createElement('span');number.textContent=String(index+1).padStart(2,'0');
    const title=document.createElement('span');title.textContent=lesson.title;button.append(number,title);
    button.addEventListener('click',()=>{selected=index;update();save();if(innerWidth<850)document.querySelector('.contents details').open=false;root.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});});
    list.append(button);navButtons.push(button);
  });
  const originalUpdate=update;
  update=()=>{
    originalUpdate();
    navButtons.forEach((button,index)=>{button.setAttribute('aria-current',index===selected?'page':'false');});
    const name=slugify(lessons[selected].title);
    history.replaceState(null,'',`#${name}`);
    document.title=`${lessons[selected].title} — Maple Line field notes`;
    document.getElementById('download-skill').href=`./skills/${name}/SKILL.md`;
    document.getElementById('skill-preview').textContent=skillData[selected]?.skill||'Loading the skill…';
    document.getElementById('copy-skill').disabled=!skillData.length;
    document.getElementById('skill-feedback').textContent='';
  };
  search.addEventListener('input',()=>{
    const query=search.value.trim().toLowerCase();let count=0;
    navButtons.forEach((button,index)=>{button.hidden=!`${lessons[index].title} ${lessons[index].stage} ${lessons[index].definition}`.toLowerCase().includes(query);if(!button.hidden)count++;});
    list.querySelectorAll('h3').forEach(heading=>{let sibling=heading.nextElementSibling,visible=false;while(sibling&&sibling.tagName!=='H3'){visible ||= !sibling.hidden;sibling=sibling.nextElementSibling;}heading.hidden=!visible;});
    document.getElementById('search-empty').hidden=count>0;
  });
  document.getElementById('copy-skill').addEventListener('click',async()=>{
    const skill=skillData[selected]?.skill;if(!skill)return;
    try{await navigator.clipboard.writeText(skill);document.getElementById('skill-feedback').textContent='Copied. Ready for your next project.';}
    catch{skillPanel.querySelector('details').open=true;const range=document.createRange();range.selectNodeContents(document.getElementById('skill-preview'));const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.getElementById('skill-feedback').textContent='Select and copy the skill below, or use the download.';}
  });
  fetch('./skills.json').then(r=>{if(!r.ok)throw Error('load');return r.json();}).then(data=>{skillData=data;update();}).catch(()=>{document.getElementById('skill-feedback').textContent='The copy preview could not load. Individual skill downloads remain available.';});
  const requested=lessons.findIndex(lesson=>`#${slugify(lesson.title)}`===location.hash);
  selected=requested>=0?requested:0;
  if(innerWidth<850)document.querySelector('.contents details').open=false;

  document.querySelectorAll('.download-pack').forEach(link=>link.addEventListener('click',async event=>{
    event.preventDefault();
    try {
      const response=await fetch('./skills-pack.json');
      if(!response.ok)throw new Error('Download unavailable');
      const {base64}=await response.json();
      const bytes=Uint8Array.from(atob(base64),character=>character.charCodeAt(0));
      const url=URL.createObjectURL(new Blob([bytes],{type:'application/zip'}));
      const download=document.createElement('a');download.href=url;download.download='maple-line-skills.zip';
      document.body.append(download);download.click();download.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    } catch { location.href=link.href; }
  }));
