// SHADED Dialog-Engine (Runde 10) — extrahiert aus runtime/shaded-engine.mjs als eigenständiges
// ESM-Modul, gleiches Idiom wie runtime/spatial-viewer.js: eigene RAF-Schleife, direkter DOM-Zugriff,
// Anbindung an window.SHADED nach dessen Aufbau. Datengetrieben und motorunabhängig vom Erzähl-
// inhalt (content/*.js liefert nur Beat-Arrays: {type:'direction'|'line', speaker?, text} mit
// Schreibmaschinen-Effekt, {type:'lens', n} / {type:'sound-emit', at:[u,v], strength} als sofort
// durchlaufende Trigger). Spricht Lens/Sound ausschließlich über das öffentliche window.SHADED-API
// (Invariante 5) an, NIE über Engine-Interna — dieselbe Grenze wie jede andere Bridge in diesem Repo.
const DIALOGUE_CPS = 42; // Zeichen pro Sekunde, Schreibmaschinen-Tempo
let dialogueBeats = [], dialogueIndex = -1, dialogueRevealChars = 0;

// Reine Präsentation: dialogueBeats/dialogueIndex/dialogueRevealChars (der eigentliche
// Dialog-Zustand) existieren unabhängig davon, ob diese DOM-Elemente da sind (Rule zero:
// DOM is not an API) -- ein Host ohne sie liest denselben Zustand über window.SHADED.dialogue.current().
function dialogueShowCurrent(){
  const box=document.getElementById('dialogue-box');
  const speakerEl=document.getElementById('dialogue-speaker');
  const textEl=document.getElementById('dialogue-text');
  const hintEl=document.getElementById('dialogue-hint');
  if(dialogueIndex<0||dialogueIndex>=dialogueBeats.length){ box?.classList.add('hidden'); return; }
  const beat=dialogueBeats[dialogueIndex];
  box?.classList.remove('hidden');
  if(beat.type==='direction'){ if(speakerEl){ speakerEl.textContent=''; speakerEl.className='direction'; } }
  else if(speakerEl){ speakerEl.textContent=beat.speaker||''; speakerEl.className=''; }
  const full=beat.text||'';
  if(textEl) textEl.textContent=full.slice(0, Math.floor(dialogueRevealChars));
  const complete=dialogueRevealChars>=full.length;
  if(hintEl) hintEl.textContent = !complete ? '' : (dialogueIndex>=dialogueBeats.length-1 ? '■ Ende (Leertaste/Klick)' : '▶ weiter (Leertaste/Klick)');
}
function dialogueTick(dt){
  if(dialogueIndex<0||dialogueIndex>=dialogueBeats.length) return;
  const full=dialogueBeats[dialogueIndex].text||'';
  if(dialogueRevealChars<full.length){ dialogueRevealChars=Math.min(full.length, dialogueRevealChars+DIALOGUE_CPS*dt); dialogueShowCurrent(); }
}
function dialogueGoto(index){
  dialogueIndex=index; dialogueRevealChars=0;
  if(dialogueIndex>=dialogueBeats.length){ dialogueIndex=-1; document.getElementById('dialogue-box')?.classList.add('hidden'); return; }
  const beat=dialogueBeats[dialogueIndex];
  if(beat.type==='lens'){ window.SHADED.lens.set(beat.n|0); dialogueGoto(dialogueIndex+1); return; }
  if(beat.type==='sound-emit'){ const at=beat.at||[0.5,0.5]; window.SHADED.sound.emit(at[0],at[1],beat.strength==null?1:beat.strength); dialogueGoto(dialogueIndex+1); return; }
  dialogueShowCurrent();
}
function dialoguePlay(beats){ dialogueBeats=Array.isArray(beats)?beats:[]; dialogueGoto(0); }
function dialogueAdvance(){
  if(dialogueIndex<0) return;
  const full=dialogueBeats[dialogueIndex].text||'';
  if(dialogueRevealChars<full.length){ dialogueRevealChars=full.length; dialogueShowCurrent(); return; } // erst: Text sofort komplett zeigen
  dialogueGoto(dialogueIndex+1); // dann erst: naechster Beat
}
function dialogueSkip(){ dialogueBeats=[]; dialogueIndex=-1; document.getElementById('dialogue-box')?.classList.add('hidden'); }
document.getElementById('dialogue-box')?.addEventListener('click', dialogueAdvance);
window.addEventListener('keydown', e=>{
  if(dialogueIndex>=0 && (e.key===' '||e.key==='Enter')){ e.preventDefault(); dialogueAdvance(); }
});

// Eigene RAF-Schleife statt Ticken durch die Haupt-Engine (gleiches Idiom wie
// runtime/spatial-viewer.js) — EIN Tick pro Frame mit eigenem, eng gekapptem Delta (nicht
// die Substep-Schleife der Weltsimulation), sonst würde eine reale Pause (Tab im Hintergrund,
// langsamer Rechner) den gesamten Text auf einen Schlag aufdecken statt normal weiterzutippen.
let lastDialogueFrame=0;
function dialogueLoop(now){
  const dt = lastDialogueFrame ? Math.min((now-lastDialogueFrame)/1000, 0.1) : 0;
  lastDialogueFrame = now;
  dialogueTick(dt);
  requestAnimationFrame(dialogueLoop);
}
requestAnimationFrame(dialogueLoop);

if(!window.SHADED) throw new Error('dialogue-engine.mjs: window.SHADED fehlt — muss nach shaded-engine.mjs geladen werden');
window.SHADED.dialogue = {
  play:dialoguePlay, advance:dialogueAdvance, skip:dialogueSkip,
  isPlaying:()=>dialogueIndex>=0,
  current:()=>dialogueIndex>=0?{index:dialogueIndex, total:dialogueBeats.length, beat:dialogueBeats[dialogueIndex], revealed:Math.floor(dialogueRevealChars)}:null,
};
