// SHADED Weather-/Ökosystem-Partikel — extrahiert aus runtime/shaded-engine.mjs als
// eigenständiges ESM-Modul (Stufe 3 der Aufteilung, siehe docs/engine-decomposition-plan.md).
// Umfasst Laub/Früchte (Runde 4 Ökosystem), Rauch/Funken/Atemwolken/Dampf/Druckwellen/Lava
// (Element-Labs, ausgelöst über elementPreset) sowie Schnee/Regen/Hagel (Weltgesetze
// Klima/Wetter). Rein optisch auf dem Overlay-Canvas — rührt NIE classGrid/getMaterialTypeAt
// an (Invariante 2). Spricht Weltzustand, Material und Fußspuren ausschließlich über das
// öffentliche window.SHADED-API an (Invariante 5); für Zustand ohne öffentlichen Platz
// (CUR-Referenz, Weltzeit) über die bewusst NICHT-öffentliche window.SHADED_ENGINE_INTERNAL-
// Bridge (siehe runtime/actor-bridge.mjs für den Präzedenzfall dieses Musters).
const ov=document.getElementById('ov');
const ovx=ov.getContext('2d');

if(!window.SHADED) throw new Error('weather-particles.mjs: window.SHADED fehlt — muss nach shaded-engine.mjs geladen werden');
if(!window.SHADED_ENGINE_INTERNAL) throw new Error('weather-particles.mjs: window.SHADED_ENGINE_INTERNAL fehlt — muss nach shaded-engine.mjs geladen werden');
const CUR=window.SHADED_ENGINE_INTERNAL.CUR;

// --- Partikel-Ökosystem (Overlay; rückwärts splicen!) ---
let leaves=[],fruits=[],smoke=[],sparks=[],breaths=[],snowflakes=[],raindrops=[],hailstones=[],steamPuffs=[],pressureBursts=[],lavaFlows=[];
function initEco(){
  leaves=[];fruits=[];smoke=[];sparks=[];breaths=[];hailstones=[];steamPuffs=[];pressureBursts=[];lavaFlows=[];
  for(let i=0;i<90;i++) leaves.push({u:Math.random(),v:Math.random(),
    vu:0,vv:0,z:0,vz:0,ang:Math.random()*6.28,va:0,s:0.5+Math.random()*0.5,
    col:['#c96f10','#b7420e','#a3320b','#8a6d1c'][i&3]});
}
function spawnElementParticles(kind,u=0.5,v=0.62,count=1){
  if(kind==='steam') for(let i=0;i<count;i++) steamPuffs.push({u:u+(Math.random()-0.5)*0.10,v:v+(Math.random()-0.5)*0.05,
    vu:(Math.random()-0.5)*0.010+CUR.wind*0.014,vv:-0.028-Math.random()*0.018,r:0.006+Math.random()*0.010,life:1});
  if(kind==='pressure') for(let i=0;i<count;i++) pressureBursts.push({u:u+(Math.random()-0.5)*0.08,v:v+(Math.random()-0.5)*0.05,
    r:0.008+Math.random()*0.014,life:1,seed:Math.random()*6.28});
  if(kind==='hail') for(let i=0;i<count;i++){
    const hu=Math.random();
    // Exp. 3: gleiche invertierte Tiefe wie in hailTicks Pro-Frame-Nachführung
    // (1-nah-Konvention) — szenenabgeleitet statt Zufall, wenn keine echte Karte vorliegt.
    const hasDepth=window.SHADED.parallax.hasDepth();
    const depth=hasDepth ? 1-window.SHADED.parallax.sampleDepth(hu,0) : 1-weatherPseudoDepthAt(hu,0);
    hailstones.push({u:hu,v:-0.1-Math.random()*0.25,
      vu:CUR.wind*0.22+(Math.random()-0.5)*0.08,vv:0.75+Math.random()*0.45,r:0.003+Math.random()*0.004,
      bounce:1,life:1,depth});
  }
  if(kind==='lava') for(let i=0;i<count;i++){
    const a=(Math.random()*6.283), d=Math.random()*0.055;
    lavaFlows.push({u:u+Math.cos(a)*d,v:v+Math.sin(a)*d*0.7,vu:Math.cos(a)*0.010+CUR.wind*0.006,
      vv:0.018+Math.random()*0.018,r:0.010+Math.random()*0.012,heat:1,life:1});
  }
  if(kind==='leaves') for(let i=0;i<count;i++) leaves.push({u:Math.random(),v:-0.05-Math.random()*0.4,
    vu:(Math.random()-0.5)*0.05,vv:0.02+Math.random()*0.05,z:0.2+Math.random()*0.7,vz:0,
    ang:Math.random()*6.28,va:(Math.random()-0.5)*10,s:0.6+Math.random()*0.8,
    col:['#e07a12','#c2410c','#92400e','#f59e0b','#7c2d12'][i%5]});
  // Runde 7: smoke/ember waren zuvor in elementPreset() direkt inline auf `smoke`/`sparks`
  // gepusht (Duplikat derselben Formel) — hier zusammengeführt, damit ALLE Partikel-Erzeugung
  // durch diese eine Funktion läuft und die Arrays nicht länger von außen erreichbar sein müssen.
  if(kind==='smoke') for(let i=0;i<count;i++) smoke.push({u:u+(Math.random()-0.5)*0.08,v:v+(Math.random()-0.5)*0.04,
    vu:(Math.random()-0.5)*0.004+CUR.wind*0.012, vv:-0.012-Math.random()*0.014, r:0.006+Math.random()*0.008, life:1});
  if(kind==='ember') for(let i=0;i<count;i++) sparks.push({u:u+(Math.random()-0.5)*0.08,v:v+(Math.random()-0.5)*0.04,
    vu:(Math.random()-0.5)*0.035+CUR.wind*0.018, vv:-0.045-Math.random()*0.055, life:0.5+Math.random()*0.7});
}
function ecoTick(dt){
  const player=window.SHADED.player.pos();
  const windU=CUR.wind*0.010;
  const autumnWind = CUR.autumn > 0.3 ? (CUR.autumn * 0.015) : 0;
  // Vortex-Wind: sanfte positive/negative Oszillation (wie Schneestrudel)
  const turbulencePhase = vortexPhase * 0.7;
  const turbulenceWind = Math.sin(turbulencePhase) * CUR.storm * 0.3;
  const turbulenceLift = Math.max(0, Math.sin(turbulencePhase + 1.57)*CUR.storm*0.08);  // Aufwind im Strudel
  const time=window.SHADED_ENGINE_INTERNAL.time;

  for(let i=leaves.length-1;i>=0;i--){
    const l=leaves[i];

    // Blätter am Boden (settled in Nischen) bewegen sich kaum
    if(l.settled){
      // Am Boden stabilisiert, aber Regen/Turbulenzen heben sie auf
      const turbulenceStrength = CUR.storm * 0.5 + CUR.rain * 0.3;
      if(turbulenceStrength > 0.4 && Math.random()<turbulenceStrength*0.15){
        l.settled = false;  // Starke Turbulenzen wirbeln Blätter auf
        l.vv = -0.15;  // Aufwind
        l.vz = 0.08;
        l.z = 0.02;
      }
      // Sanfte Bodenbewegung mit Vortex-Wind
      l.vu += turbulenceWind*0.003*dt;
      l.vu *= Math.pow(0.92, dt);
      l.u += l.vu*dt;
      if(l.u<0)l.u+=1; if(l.u>1)l.u-=1;
      continue;
    }

    // Interaktion mit Spieler
    if(player.active&&l.z<=0){
      const d=Math.hypot(l.u-player.u,l.v-player.v);
      if(d<0.02){ const a=Math.atan2(l.v-player.v,l.u-player.u);
        l.vu+=Math.cos(a)*0.02; l.vv+=Math.sin(a)*0.02; }
    }

    // Luftphase (z > 0): wirbelt herum
    if(l.z>0){
      l.vz -= dt*2.2;
      l.vz += turbulenceLift*dt;  // Strudel-Aufwind
      l.z += l.vz*dt;
      l.ang += l.va*dt;
      l.vu += (windU+autumnWind+turbulenceWind)*dt*3.0;  // Wind + Vortex
      if(l.z<=0){l.z=0;l.vz=0;l.va=0;}
    }
    else {
      // Fallende Phase: in Nischen sammeln (Tiefenbewusstsein)
      const fallSpeed = CUR.autumn > 0.2 ? CUR.autumn * 0.3 : 0.02;
      l.vv += fallSpeed * dt;

      // Vortex-Wind: positive/negative für Wirbel-Effekt
      l.vu += (windU+autumnWind+turbulenceWind)*dt*(0.3+0.4*CUR.autumn);

      // Herbst-Blätter wirbeln in Strudeln (Sinusoszillation mit Turbulenzen)
      const wob = CUR.autumn > 0.5 ? Math.sin(time*1.2 + i*0.3 + turbulencePhase)*0.008 : 0;
      l.vu += wob;

      // Reibung / Bremsen (etwas weniger in Strudeln)
      const frictionDamping = 1.0 - CUR.storm*0.1;
      const fr=Math.pow(0.5,dt/0.5*frictionDamping);
      l.vu*=fr;
      l.vv*=Math.pow(0.8,dt/0.3);

      // TIEFENBEWUSSTSEIN: Blätter sammeln sich in Nischen (hohe wet-Werte = Senken)
      // Wenn Blatt in nasse Gegend fällt (puddle/path mit Wasser), settlement bevorzugen
      const isInNiche = l.v > 0.88 && CUR.wet > 0.2;  // nähe am Boden + nasse Gegend
      const nicheThreshold = isInNiche ? 0.92 : 0.95;

      if(l.v > nicheThreshold){
        l.settled = true;
        l.v = Math.min(0.98, nicheThreshold + Math.random()*0.03);
        l.vv = 0;
        l.vu = 0;
        l.va = 0;
        continue;
      }
    }

    l.u+=l.vu*dt*(l.z>0?3:1);
    l.v+=l.vv*dt*(l.z>0?3:1);
    if(l.u<0)l.u+=1; if(l.u>1)l.u-=1;
    if(l.v<0)l.v+=1; if(l.v>1)l.v-=1;
  }
  for(let i=fruits.length-1;i>=0;i--){
    const fr=fruits[i]; fr.age+=dt;
    if(fr.z>0){ fr.vz-=dt*2.6; fr.z+=fr.vz*dt; fr.u+=fr.vu*dt; fr.v+=fr.vv*dt;
      if(fr.z<=0){fr.z=0; if(Math.abs(fr.vz)>0.3){fr.vz=-fr.vz*0.35;fr.z=0.001;} else fr.vz=0;} }
    if(fr.age>18) fruits.splice(i,1);
  }
  for(let i=smoke.length-1;i>=0;i--){
    const s=smoke[i]; s.life-=dt*0.5;
    if(s.life<=0){smoke.splice(i,1);continue;}
    s.u+=s.vu*dt*3; s.v+=s.vv*dt*3; s.r+=dt*0.006; s.vu+=CUR.wind*0.004*dt;
  }
  for(let i=sparks.length-1;i>=0;i--){
    const s=sparks[i]; s.life-=dt*1.3;
    if(s.life<=0){sparks.splice(i,1);continue;}
    s.u+=s.vu*dt; s.v+=s.vv*dt; s.vv+=dt*0.05;
  }
  for(let i=breaths.length-1;i>=0;i--){
    const b=breaths[i]; b.life-=dt*1.1;
    if(b.life<=0){breaths.splice(i,1);continue;}
    b.u+=b.vu*dt; b.v+=b.vv*dt; b.r+=dt*0.008;
  }
  for(let i=steamPuffs.length-1;i>=0;i--){
    const s=steamPuffs[i]; s.life-=dt*0.38;
    if(s.life<=0){steamPuffs.splice(i,1);continue;}
    s.u+=s.vu*dt; s.v+=s.vv*dt; s.r+=dt*(0.014+window.SHADED_ENGINE_INTERNAL.heatWarp*0.002); s.vu+=CUR.wind*0.006*dt;
  }
  for(let i=pressureBursts.length-1;i>=0;i--){
    const p=pressureBursts[i]; p.life-=dt*0.85;
    if(p.life<=0){pressureBursts.splice(i,1);continue;}
    p.r+=dt*(0.10+CUR.puddle*0.05);
  }
  for(let i=lavaFlows.length-1;i>=0;i--){
    const l=lavaFlows[i]; l.life-=dt*0.10; l.heat*=Math.pow(0.72,dt);
    if(l.life<=0||l.heat<0.05){lavaFlows.splice(i,1);continue;}
    l.u+=l.vu*dt; l.v+=l.vv*dt; l.vv+=dt*0.012; l.r+=dt*0.002;
    window.SHADED.trail.stamp(l.u,l.v,l.r,3,0.45*dt);
    if(Math.random()<0.35) sparks.push({u:l.u,v:l.v,vu:(Math.random()-0.5)*0.025+CUR.wind*0.02,vv:-0.04-Math.random()*0.04,life:0.9});
    if(CUR.wet>0.25||CUR.rain>0.1) spawnElementParticles('steam',l.u,l.v,1);
  }
}

// --- Exp. 3 (docs/first-glimpse-depth-layers.md): Wetter existiert IN der Szene, nicht als
// Screen-Space-Overlay. Zwei Bausteine, beide reine Weiterverwendung von Exp. 1/2 — kein
// neues 3D-Weltvolumen, keine Kamera-Projektion (das wäre ein eigener, größerer Schritt,
// keine "kleinste sinnvolle Erweiterung"):
// 1) weatherPseudoDepthAt(): wenn KEINE echte Companion-Tiefenkarte geladen ist (der Regelfall
//    für SHADEDs Testbilder), war die Tiefe bisher schlicht Math.random() — reines Rauschen,
//    kein Szenenbezug. Ersetzt das durch einen aus depthLayerAt() abgeleiteten Wert (near am
//    nächsten, far am fernsten) — SHADEDs eigene billige Hypothese statt Zufall, exakt im
//    Sinn von Aufgabe 1 ("kann SHADED das selbst ableiten, bevor geraten wird").
// 2) weatherOccludedAt(): eine STRUCTURAL-Region (Gebäude/Dach) gilt als näher als die
//    angenommene Wetterebene — fallende Partikel werden dort nicht gezeichnet (verschwinden
//    hinter der Silhouette), statt ungehindert über Dächer hinweg gemalt zu werden. Bewusst
//    NUR structural, nicht mid (Laub/Fels) — kleinster Schritt zuerst, siehe Doku für den
//    Kompromiss. Betrifft nur fallende/nicht-liegende Partikel: liegender Schnee auf einem
//    Dach SOLL sichtbar bleiben, er sitzt AUF der Struktur, nicht dahinter.
function weatherPseudoDepthAt(u,v){
  switch(window.SHADED.depthLayerAt(u,v)){
    case 'near': return 0.85;
    case 'mid': return 0.5;
    case 'structural': return 0.3;
    case 'far': return 0.1;
    default: return 0.5; // 'unknown' bzw. keine Szene geladen — neutral
  }
}
function weatherOccludedAt(u,v){
  return window.SHADED.depthLayerAt(u,v)==='structural';
}
// Exp. 3, Nachtrag: ein fester Satz von 4 Punkten (Anfang/33%/66%/Ende) auf einer ~20-70px
// langen Regen-Linie ließ eine SEHR duenne structural-Kante (wenige layerGrid-Zellen breit,
// z.B. am oberen Bildrand einer Szene ohne erkannten Himmel — jede Zeile dort ist bereits
// Dach/Gebaeude) zwischen zwei Sample-Punkten durchrutschen. Einzeln pro Tropfen fast nie
// sichtbar, aber unter CPU-Last (viele Tropfen gleichzeitig nahe ihrer Spawnzone, per
// CDP-Throttling reproduziert statt nur vermutet) stapelten sich genug einzeln blasse
// Treffer auf demselben Pixel zu klar sichtbarer Deckkraft (bis 204/255, gemessen).
// Feste Punktzahl ersetzt durch adaptive Schrittweite relativ zur v-Spannweite der Linie —
// schließt die Lücke unabhängig von der Tropfenlänge, statt nur die Symptomschwelle des
// Tests zu lockern.
function lineOccludedAt(u0, v0, u1, v1){
  const dv = v1 - v0;
  const steps = Math.max(4, Math.min(24, Math.ceil(Math.abs(dv) / 0.0015)));
  for(let i=0; i<=steps; i++){
    const t = i / steps;
    if(weatherOccludedAt(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t)) return true;
  }
  return false;
}

// --- Schnee-Partikel-System: Tiefenkarte steuert Fall, Temperatur+Material steuern Liegenbleiben ---
let vortexPhase = 0;  // für weiche positive/negative Wind-Oszillation
const SNOW_SETTLE_MAX=260; // Deckel gegen unbegrenztes Wachstum bei Dauerschnee
function snowDepthAt(s){
  // Echte Tiefenkarte wenn vorhanden (1=nah/weiß, 0=fern/schwarz), sonst Exp. 3s
  // szenenabgeleitete Tiefe statt des früheren Zufallswerts.
  return window.SHADED.parallax.hasDepth() ? window.SHADED.parallax.sampleDepth(s.u,s.v) : weatherPseudoDepthAt(s.u,s.v);
}
function snowTick(dt){
  const player=window.SHADED.player.pos();
  const ready=window.SHADED.isReady();
  const time=window.SHADED_ENGINE_INTERNAL.time;
  // Vortex-Wind: sanfte Sinusoszillation zwischen -1 und +1
  vortexPhase += dt * 1.2;  // Vortex-Frequenz
  const vortexWind = Math.sin(vortexPhase) * CUR.storm * 0.4;  // Strudel stärker bei Sturm
  const cold = CUR.temperature < 0.42; // ~ 1 °C (tempC = temperature*50-20), s. Frost-System oben

  // Schneeflocken spawnen VON OBEN, klein beginnend (konsistent bei Schneefall)
  const targetSnowflakes = Math.ceil(CUR.snowfall * 80);
  while(snowflakes.length < targetSnowflakes && Math.random()<0.6){
    snowflakes.push({
      u: Math.random(),
      v: -0.15,  // KONSISTENT von oben, nicht zufällig
      z: 0,
      size: 0.6 + Math.random()*0.5,      // startet als kleines Flöckchen
      vu: (Math.random()-0.5)*0.01,
      vv: 0.08 + Math.random()*0.04 + CUR.snowfall*0.12,
      wobble: Math.random()*6.28,
      wobbleSpeed: 1.5 + Math.random()*2.0,
      age: 0,
      settled: false,
      layer: 0
    });
  }

  // Spieler klopft nahen liegenden Schnee ab (Abklopfbarkeit)
  if(player.active){
    for(const s of snowflakes){
      if(!s.settled) continue;
      const d=Math.hypot(s.u-player.u, s.v-player.v);
      if(d<0.025){
        s.settled=false; s.layer=0;
        s.vu=(s.u-player.u)*2.2+(Math.random()-0.5)*0.02;
        s.vv=-0.06-Math.random()*0.05; // kurz aufwirbeln
      }
    }
  }

  // Update: Fall mit Tiefensteuerung, Settle mit Temperatur+Material, Schichtenbildung
  let settledCount=0;
  for(const s of snowflakes) if(s.settled) settledCount++;
  for(let i=snowflakes.length-1;i>=0;i--){
    const s = snowflakes[i];
    s.age += dt;

    if(s.settled){
      // Liegender Schnee: sehr träge, Wind kann ihn minimal verschieben
      s.vu *= Math.pow(0.85, dt);
      s.vu += (CUR.wind*0.005 + vortexWind*0.008)*dt;
      s.u += s.vu*dt;
      if(s.u<0) s.u+=1; if(s.u>1) s.u-=1;
      // Taut es wieder auf (zu warm), verschwindet die Liegeschicht allmählich
      if(!cold){ s.age+=dt*2; if(s.age>60){ snowflakes.splice(i,1); } }
      continue;
    }

    // Tiefe (echte Karte oder Pseudo-Tiefe) steuert Fallgeschwindigkeit + wahrgenommene Größe:
    // nah (Tiefe→1) fällt schneller/größer, fern (Tiefe→0) langsamer/kleiner.
    const depth = snowDepthAt(s);
    const depthF = depth===null ? 0.5 : depth;
    const depthSpeed = 0.6 + depthF*0.7;   // 0.6x (fern) .. 1.3x (nah)

    s.v += s.vv * depthSpeed * dt;
    s.u += (s.vu + CUR.wind*0.008 + vortexWind*0.012 + Math.sin(s.wobble + time*s.wobbleSpeed)*0.002) * dt;
    s.wobble += s.wobbleSpeed*dt*0.2;
    s._depth = depthF; // fürs Rendering gemerkt

    if(s.u<-0.05) s.u+=1.05; if(s.u>1.05) s.u-=1.05;

    // Liegenbleiben: NUR wenn kalt genug, UND nur auf echten Oberflächen — nicht auf
    // Himmel (K7-Flood, sonst würde die Szene irgendwo "in der Luft" Schnee ansetzen,
    // weil classGrid Himmel als Fels führt, siehe window.SHADED.skyAt). Anders als in
    // einer Seitenansicht liegt der Boden in dieser isometrischen Perspektive NICHT nur
    // am unteren Bildrand, sondern über weite Teile des Bilds verteilt — ein fester
    // v>0.90-Bodentest ließ Schnee auf Gras/Pfad de facto nie liegen bleiben. Erhöhte/
    // exponierte Flächen (Dach, Laub) sammeln etwas schneller als ebener Boden, aber
    // beide setzen genau dort an, wo die Materialkarte sie tatsächlich zeigt.
    if(cold && s.v>=0 && settledCount<SNOW_SETTLE_MAX){
      const mat = ready ? window.SHADED.getMaterialTypeAt(s.u,s.v) : null;
      const elevated = mat==='roof' || mat==='foliage';
      // !skyAt(): landbar ist alles, was K7 NICHT als Himmel bestätigt hat. Szenen ohne
      // jede erkannte Himmel-Region (z.B. dichte Baumkronen-Draufsichten ohne
      // Horizontlinie — hasSkyRegion()==false) melden skyAt() dann konsequent "0" für
      // das ganze Bild: korrekt, denn dort IST kein sichtbarer Himmel, durch den Schnee
      // erst fallen könnte, bevor er die Kronen/Dächer erreicht.
      const landable = mat && !window.SHADED.skyAt(s.u,s.v) && mat!=='water' && mat!=='window';
      // Zeitabhängige Klebechance statt Pro-Frame-Münzwurf, sonst friert die Szene
      // quasi sofort ein statt Schnee sichtbar über Sekunden aufzubauen.
      const stickChance = 1 - Math.pow(1 - (elevated?0.7:0.5), dt);
      if(landable && Math.random()<stickChance){
        // Schichten: je mehr bereits liegender Schnee in der Nähe, desto höher die Lage
        let neighbors=0;
        for(const o of snowflakes){ if(o.settled && Math.hypot(o.u-s.u,o.v-s.v)<0.018) neighbors++; }
        s.settled = true; settledCount++;
        s.layer = Math.min(4, neighbors);
        s.v -= s.layer*0.003; // Schichten wachsen sichtbar leicht nach oben
        s.vv = 0; s.vu = 0;
        continue;
      }
    }

    // Ausspawn: unten raus (kein Liegenbleiben möglich, z.B. zu warm) oder nach langer Zeit
    if(s.v > 1.1 || s.age > 30) snowflakes.splice(i,1);
  }
}

// --- Regen-System mit Tiefenvarianz und Vortex-Wind ---
function rainTick(dt){
  const hasDepth=window.SHADED.parallax.hasDepth();
  // Regen-Tropfen spawnen basierend auf rain-Parameter
  const targetRaindrops = Math.ceil(CUR.rain * 120);
  while(raindrops.length < targetRaindrops && Math.random()<0.7){
    // Wind bestimmt Richtung; Vortex moduliert nur die STÄRKE (0.7x..1.3x), niemals
    // das Vorzeichen - sonst fällt Regen bei niedrigem Wind+hohem Sturm gleichzeitig
    // in beide Richtungen (reproduzierter Bug: vorheriges additives +/- kehrte die
    // Grundrichtung bei windAngle<vortexInfluence um).
    const windAngle = CUR.wind * 0.5;
    const vortexMod = 1 + Math.sin(vortexPhase) * CUR.storm * 0.3;
    const length = 0.015 + Math.random()*0.008;
    // Spawn deutlich oberhalb des sichtbaren Bilds (wie Schnee/Hagel) statt knapp
    // darüber: Tropfen brauchen sichtbare Fallstrecke durch den impliziten Himmel
    // ÜBER dem Bild, bevor sie am oberen Rand auf echtes Material treffen können —
    // sonst würden sie in Szenen ohne Sky-Lücke (z.B. Baumkronen-Draufsichten, siehe
    // Landungs-Kommentar unten) quasi am Spawnpunkt sofort wieder verschwinden.
    const u = -length + Math.random(), v = -0.35 + Math.random()*0.25;

    // Regen-Tropfen haben Tiefe: echte Tiefenkarte wenn vorhanden (0=vorne/schnell,
    // 1=hinten/langsam - invers zu getDepthAt, wo 1=nah), sonst Exp. 3s szenenabgeleitete
    // Tiefe (gleiche Inversion) statt des früheren Zufallswerts.
    const realD = hasDepth ? window.SHADED.parallax.sampleDepth(u,v) : null;
    const depth = realD!==null ? 1-realD : 1-weatherPseudoDepthAt(u,v);
    const depthMultiplier = 0.6 + depth*0.4;  // 0.6x bis 1.0x

    raindrops.push({
      u, v,
      vx: windAngle * vortexMod * (0.4 + CUR.wind*0.3),
      vy: (0.6 + CUR.storm*0.3) * depthMultiplier,  // Tiefenvarianz
      depth: depth,  // für Rendering-Größe/Transparenz (bei echter Karte pro Frame aktualisiert)
      length: length,
      age: 0
    });
  }

  // Update mit Tiefenbewusstsein
  for(let i=raindrops.length-1;i>=0;i--){
    const r = raindrops[i];
    r.age += dt;

    // Tiefere Tropfen sind weniger von Vortex-Wind beeinflusst; multiplikative
    // Modulation um 1.0 herum kann die Grundrichtung nie umkehren (s. Spawn-Kommentar).
    const windModifier = 1.0 - r.depth*0.4;
    const vortexMod = 1 + Math.sin(vortexPhase) * CUR.storm * 0.15 * windModifier;
    r.vx = CUR.wind * 0.5 * vortexMod * (0.4 + CUR.wind*0.3);

    r.v += r.vy * dt;
    r.u += r.vx * dt;

    // Tiefe pro Frame nachführen (reagiert auf Position, nicht nur den Spawn-Punkt)
    if(hasDepth){ const d=window.SHADED.parallax.sampleDepth(r.u,r.v); if(d!==null) r.depth = 1-d; }
    else r.depth = 1-weatherPseudoDepthAt(r.u,r.v);

    // wrapping
    if(r.u > 1) r.u = -r.length;

    // Landung: ein Tropfen, der eine echte Oberfläche trifft (nicht Himmel, siehe
    // window.SHADED.skyAt — classGrid führt Himmel als Fels), verschwindet dort statt
    // ungehindert bis zum unteren Bildrand durchzufallen. Das eigentliche Abfließen/
    // Sammeln übernimmt weiterhin das Rinnsal-/Pfützen-Feld im Shader (phys-Textur,
    // docs/rendergraph-lastverteilung.md) — dieser Tropfen ist nur der fallende Teil.
    // Szenen ganz ohne erkannte Himmel-Region (hasSkyRegion()==false, z.B. dichte
    // Baumkronen-Draufsichten ohne Horizontlinie) melden skyAt() konsequent "0" fürs
    // ganze Bild — korrekt, denn dort ist tatsächlich kein Himmel, durch den der
    // Tropfen erst fallen müsste, bevor er Kronen/Dächer erreicht.
    if(r.v>=0 && r.v<=1 && window.SHADED.isReady()){
      const mat = window.SHADED.getMaterialTypeAt(r.u,r.v);
      if(mat && !window.SHADED.skyAt(r.u,r.v)){ raindrops.splice(i,1); continue; }
    }

    // ausspawn (tiefere Tropfen bleiben länger sichtbar)
    const lifetime = 8 + r.depth*4;
    if(r.v>1.1 || r.age>lifetime) raindrops.splice(i,1);
  }
}

function hailTick(dt){
  const hasDepth=window.SHADED.parallax.hasDepth();
  const targetHail = Math.ceil(Math.max(0, CUR.storm*CUR.rain - 0.35) * 70);
  while(hailstones.length < targetHail && Math.random()<0.45) spawnElementParticles('hail',0.5,0,1);
  const ready = window.SHADED.isReady();
  for(let i=hailstones.length-1;i>=0;i--){
    const h=hailstones[i];
    h.life-=dt*0.08;
    h.vv+=dt*0.38;
    h.v+=h.vv*dt;
    h.u+=h.vu*dt;
    if(hasDepth){ const d=window.SHADED.parallax.sampleDepth(h.u,h.v); if(d!==null) h.depth=1-d; }
    else h.depth=1-weatherPseudoDepthAt(h.u,h.v);
    // Aufprall an der echten Oberfläche (nicht Himmel, siehe skyAt) statt an einer
    // festen Bildschirmkante v>0.92 — Boden/Dach liegen in dieser isometrischen
    // Perspektive über weite Teile des Bilds verteilt, nicht nur am unteren Rand.
    const grounded = ready && h.v>=0 && h.v<=1
      && !!window.SHADED.getMaterialTypeAt(h.u,h.v) && !window.SHADED.skyAt(h.u,h.v);
    if(grounded && h.bounce>0){
      h.vv=-h.vv*(0.20+Math.random()*0.18);
      h.vu+=(Math.random()-0.5)*0.08;
      h.bounce--;
      pressureBursts.push({u:h.u,v:h.v,r:0.006,life:0.45,seed:Math.random()*6.28});
      window.SHADED.trail.stamp(h.u,h.v,0.009,0,0.35);
    } else if(grounded){
      hailstones.splice(i,1); continue; // zweiter Aufprall: liegen geblieben
    }
    if(h.u<-0.1||h.u>1.1||h.v>1.15||h.life<=0) hailstones.splice(i,1);
  }
}

function weatherTick(dt){
  ecoTick(dt);
  snowTick(dt);
  rainTick(dt);
  hailTick(dt);
}

// --- Overlay-Rendering: aufgeteilt in zwei Hooks, weil drawOverlay() in shaded-engine.mjs
// dazwischen die Feuer-Flammen zeichnet (fires-Array bleibt dort) — die Original-Zeichenreihenfolge
// (Laub/Früchte UNTER Flammen, Rauch/Funken/... ÜBER Flammen) muss für identisches Layering
// exakt erhalten bleiben.
function weatherDrawBeforeFire(){
  const W=ov.width,H=ov.height;
  const S=W/1400;
  const night=CUR.dayNight;
  // Laub nur, wenn Herbst es erzählt
  if(CUR.autumn>0.06) leaves.forEach(l=>{
    ovx.save(); ovx.translate(l.u*W,(l.v-l.z*0.04)*H); ovx.rotate(l.ang);
    ovx.globalAlpha=0.85*Math.min(1,CUR.autumn*2)*(1-night*0.5);
    ovx.fillStyle=l.col;
    ovx.beginPath(); ovx.ellipse(0,0,7*S*l.s,3.5*S*l.s,0,0,6.283); ovx.fill();
    ovx.restore();
  });
  fruits.forEach(f=>{
    ovx.save(); ovx.translate(f.u*W,(f.v-f.z*0.05)*H);
    ovx.globalAlpha=Math.min(1,(18-f.age)/3);
    ovx.fillStyle='#c0262b'; ovx.beginPath(); ovx.arc(0,0,5.5*S,0,6.283); ovx.fill();
    ovx.fillStyle='#5c3a13'; ovx.fillRect(-0.8*S,-7*S,1.6*S,3*S);
    ovx.restore();
  });
}
function weatherDrawAfterFire(){
  const W=ov.width,H=ov.height;
  const S=W/1400;
  const night=CUR.dayNight;
  const time=window.SHADED_ENGINE_INTERNAL.time;
  smoke.forEach(s=>{
    ovx.globalAlpha=s.life*0.3;
    ovx.fillStyle= night>0.5?'rgba(120,125,140,1)':'rgba(90,90,96,1)';
    ovx.beginPath(); ovx.arc(s.u*W,s.v*H,s.r*W,0,6.283); ovx.fill();
  });
  sparks.forEach(s=>{
    ovx.globalAlpha=s.life;
    ovx.fillStyle=Math.random()<0.5?'#ffb347':'#ff5533';
    ovx.beginPath(); ovx.arc(s.u*W,s.v*H,1.6*S,0,6.283); ovx.fill();
  });
  breaths.forEach(b=>{
    ovx.globalAlpha=b.life*0.35;
    ovx.fillStyle='rgba(235,245,255,1)';
    ovx.beginPath(); ovx.arc(b.u*W,b.v*H,b.r*W,0,6.283); ovx.fill();
  });
  steamPuffs.forEach(s=>{
    const g=ovx.createRadialGradient(s.u*W,s.v*H,0,s.u*W,s.v*H,s.r*W);
    g.addColorStop(0,`rgba(245,248,255,${0.34*s.life})`);
    g.addColorStop(0.55,`rgba(200,215,225,${0.18*s.life})`);
    g.addColorStop(1,'rgba(200,215,225,0)');
    ovx.globalAlpha=1;
    ovx.fillStyle=g;
    ovx.beginPath(); ovx.arc(s.u*W,s.v*H,s.r*W,0,6.283); ovx.fill();
  });
  pressureBursts.forEach(p=>{
    ovx.globalAlpha=Math.max(0,p.life)*0.55;
    ovx.strokeStyle='rgba(160,220,255,1)';
    ovx.lineWidth=Math.max(1,2*S*p.life);
    ovx.beginPath();
    ovx.arc(p.u*W,p.v*H,p.r*W*(1+0.06*Math.sin(time*18+p.seed)),0,6.283);
    ovx.stroke();
  });
  lavaFlows.forEach(l=>{
    const g=ovx.createRadialGradient(l.u*W,l.v*H,0,l.u*W,l.v*H,l.r*W);
    g.addColorStop(0,`rgba(255,245,170,${0.92*l.heat})`);
    g.addColorStop(0.35,`rgba(255,90,20,${0.78*l.heat})`);
    g.addColorStop(1,`rgba(90,20,10,${0.18*l.heat})`);
    ovx.globalAlpha=1;
    ovx.fillStyle=g;
    ovx.beginPath(); ovx.arc(l.u*W,l.v*H,l.r*W,0,6.283); ovx.fill();
  });
  // Schneeflocken: Tiefenvarianz (vordere größer/sichtbar, hintere kleiner/subtil)
  snowflakes.forEach(sn=>{
    // Tiefe (echte Karte oder Pseudo-Tiefe, 0=fern..1=nah) steuert Größe/Transparenz
    const d = sn._depth ?? 0.5;
    const depthMultiplier = 0.6 + d*0.6;   // fern 0.6x .. nah 1.2x
    const depthAlpha = 0.5 + d*0.5;        // fern schwächer, nah kräftiger
    const layerBoost = sn.settled ? (1 + sn.layer*0.22) : 1; // Schichten wachsen sichtbar
    const maxAge = sn.settled ? 40 : 25;
    const pixelSize = sn.size * S * Math.pow(sn.age/maxAge + 0.1, 0.3) * depthMultiplier * layerBoost;
    // Exp. 3: nur NICHT-liegender Schnee kann hinter einer Gebäudesilhouette verschwinden —
    // liegender Schnee sitzt bewusst AUF der Struktur (z.B. Dach), nicht dahinter. Ober-/
    // Unterkante des kleinen Kreises mitprüfen (siehe Hagel-Fix: derselbe Randfall, wenn
    // eine dünne Dachkante nur den Kreisrand schneidet).
    if(!sn.settled){
      const sr=pixelSize/H;
      if(weatherOccludedAt(sn.u,sn.v) || weatherOccludedAt(sn.u,sn.v-sr) || weatherOccludedAt(sn.u,sn.v+sr)) return;
    }
    ovx.globalAlpha = Math.min(0.95, (1-sn.age/maxAge)*0.6 + CUR.snowfall*0.3) * depthAlpha;

    const fadeNight = night>0.6 ? (0.4+night*0.3) : 1.0;
    // Fernere Flocken leicht bluer (Luftperspektive)
    const blueShift = Math.max(0, (1-d)*20)|0;
    ovx.fillStyle = `rgba(${Math.max(180, 220*fadeNight-blueShift)|0},${230*fadeNight|0},${255*fadeNight|0},1)`;

    ovx.beginPath();
    ovx.arc(sn.u*W, sn.v*H, Math.max(0.3, pixelSize), 0, 6.283);
    ovx.fill();
  });
  // Regen-Tropfen: Tiefenvarianz (vordere Tropfen sichtbar, hintere subtil)
  raindrops.forEach(r=>{
    // Tiefere Tropfen sind länger (Parallax) aber dünner
    const depthMultiplier = 0.8 + r.depth*0.4;
    // Exp. 3: Tropfen verschwindet hinter einer Gebäudesilhouette statt darüber gemalt zu
    // werden. Ein Tropfen ist eine ~20-70px lange Diagonale, nicht nur sein Startpunkt —
    // adaptive Schrittweite (lineOccludedAt) statt fester Punktzahl schließt die Lücke
    // unabhängig von der Tropfenlänge (siehe Kommentar an lineOccludedAt).
    const endU = r.u + r.length*depthMultiplier, endV = r.v + r.length*2*depthMultiplier;
    if(lineOccludedAt(r.u, r.v, endU, endV)) return;
    // Tiefere Tropfen (r.depth ~ 1): schwächer und dünner (Parallax-Effekt)
    const depthAlpha = 0.4 + r.depth*0.6;  // vorne 0.4-1.0, hinten 0.4-0.7
    const lifetime = 8 + r.depth*4;
    ovx.globalAlpha = Math.min(0.8, CUR.rain*0.9 * (1-r.age/lifetime)) * depthAlpha;

    const depthFade = 0.3 + (1-r.v)*0.7;
    // Tiefere Tropfen leicht blauer (Luftperspektive)
    const blueShift = r.depth*20|0;
    ovx.strokeStyle = `rgba(${Math.max(0,180*depthFade-blueShift)|0},${200*depthFade|0},${255*depthFade|0},1)`;
    ovx.lineWidth = Math.max(0.3, (1.5 - r.v)*depthMultiplier);

    ovx.beginPath();
    const x1 = r.u*W, y1 = r.v*H;
    const x2 = endU*W, y2 = endV*H;
    ovx.moveTo(x1, y1);
    ovx.lineTo(x2, y2);
    ovx.stroke();
  });
  hailstones.forEach(h=>{
    // Exp. 3: Hagelkorn verschwindet hinter einer Gebäudesilhouette statt darüber gemalt zu
    // werden. Nur Mittelpunkt+Unterkante zu prüfen (erster Entwurf) ließ die OBERE Kante des
    // Kreises durchrutschen — gefunden via tools/verify-weather-depth.js: schwache, aber
    // echte Treffer, wenn eine dünne Dachkante genau die obere Kante des kleinen Kreises
    // schneidet, ohne Mittelpunkt oder Unterkante zu berühren. Alle vier Himmelsrichtungen
    // des Kreisrands prüfen schließt das.
    const depthScale=0.65+h.depth*0.55;
    const hr=h.r*depthScale;
    if(weatherOccludedAt(h.u,h.v) || weatherOccludedAt(h.u,h.v-hr) || weatherOccludedAt(h.u,h.v+hr)
      || weatherOccludedAt(h.u-hr,h.v) || weatherOccludedAt(h.u+hr,h.v)) return;
    ovx.globalAlpha=0.45+0.45*h.life;
    ovx.fillStyle='rgba(225,240,255,1)';
    ovx.strokeStyle='rgba(90,140,180,.65)';
    ovx.lineWidth=Math.max(0.6,S);
    ovx.beginPath(); ovx.arc(h.u*W,h.v*H,h.r*W*depthScale,0,6.283); ovx.fill(); ovx.stroke();
  });
}

// Zusätzliche schmale Durchreich-Funktionen für Kopplungen, die erst bei der Extraktion
// sichtbar wurden: dash() (Spieler-Cluster) stößt nahes Laub an und lässt Früchte fallen;
// fireTick() (Feuer-Cluster) spawnt eigene Rauch-/Funkenpartikel mit ANDEREN Jitter-Werten
// als elementPreset()s 'smoke'/'ember' (0.012/0.008 statt 0.08 Radius) — deshalb eigene
// Funktionen statt spawnElementParticles wiederzuverwenden. drawPlayer() (Spieler-Cluster)
// erzeugt Atemwolken. Beide „Alles zurücksetzen"-Knöpfe leeren dieselben sechs Arrays.
function stirLeavesNear(u,v,radius,force){
  leaves.forEach(l=>{
    const d=Math.hypot(l.u-u,(l.v-v));
    if(d<radius&&l.z<=0){ const a=Math.atan2(l.v-v,l.u-u);
      l.vz=0.5+Math.random()*0.5; l.vu+=Math.cos(a)*force; l.vv+=Math.sin(a)*force; l.va=(Math.random()-0.5)*14; }
  });
}
function spawnFruit(u,v){
  fruits.push({u,v,z:0.9,vz:0,vu:(Math.random()-0.5)*0.01,vv:(Math.random()-0.5)*0.01,age:0,r:1});
}
function spawnFireSmoke(u,v){
  smoke.push({u:u+(Math.random()-0.5)*0.012,v:v-0.008,
    vu:(Math.random()-0.5)*0.004+CUR.wind*0.012, vv:-0.015-Math.random()*0.012,
    r:0.004+Math.random()*0.004, life:1});
}
function spawnFireSpark(u,v){
  sparks.push({u:u+(Math.random()-0.5)*0.008,v:v-0.006,
    vu:(Math.random()-0.5)*0.02+CUR.wind*0.02, vv:-0.03-Math.random()*0.03, life:0.8});
}
function spawnBreath(p){ breaths.push(p); }
function clearElementParticles(){
  smoke.length=0; sparks.length=0; steamPuffs.length=0;
  pressureBursts.length=0; lavaFlows.length=0; hailstones.length=0;
}

window.SHADED_ENGINE_INTERNAL.initEco = initEco;
window.SHADED_ENGINE_INTERNAL.spawnElementParticles = spawnElementParticles;
window.SHADED_ENGINE_INTERNAL.weatherTick = weatherTick;
window.SHADED_ENGINE_INTERNAL.weatherDrawBeforeFire = weatherDrawBeforeFire;
window.SHADED_ENGINE_INTERNAL.weatherDrawAfterFire = weatherDrawAfterFire;
window.SHADED_ENGINE_INTERNAL.stirLeavesNear = stirLeavesNear;
window.SHADED_ENGINE_INTERNAL.spawnFruit = spawnFruit;
window.SHADED_ENGINE_INTERNAL.spawnFireSmoke = spawnFireSmoke;
window.SHADED_ENGINE_INTERNAL.spawnFireSpark = spawnFireSpark;
window.SHADED_ENGINE_INTERNAL.spawnBreath = spawnBreath;
window.SHADED_ENGINE_INTERNAL.clearElementParticles = clearElementParticles;
