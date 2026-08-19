// SHADED Dialog-Engine Verifikation (Runde 10) — testet den Motor generisch (Typewriter-Effekt,
// Beat-Fortschritt, Trigger-Beats, Tastatur/Klick, sauberes Ende). Nutzt bewusst NICHT den
// echten Skripttext (der lebt separat in content/ und ist reiner Inhalt, kein Motorverhalten).
// Nutzung: node tools/verify-dialogue.js
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'verify-out');
fs.mkdirSync(OUT, { recursive: true });
const BASE_IMG = path.join(REPO, 'file_00000000974871f49fe71f6b456f9579.png');
const MARKER_IMG = path.join(REPO, 'file_00000000c84071f4bcd6ff9afdba7246.png');

const server = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html');
  try {
    const data = fs.readFileSync(p === REPO + '/' ? path.join(REPO, 'index.html') : p);
    res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : 'image/png' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end(); }
});

(async () => {
  await new Promise((r) => server.listen(8936, r));
  const launchOpts = { args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] };
  if (process.env.CHROMIUM) launchOpts.executablePath = process.env.CHROMIUM;
  else if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1500, height: 860 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  console.log('=== SHADED Dialog-Engine Verifikation (Runde 10) ===\n');
  let failed = false;
  function check(name, ok, detail) { console.log(`  ${ok ? '✓ PASS' : '✗ FAIL'}: ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed = true; }

  await page.goto('http://localhost:8936/index.html');
  await page.setInputFiles('#f-scene', BASE_IMG);
  await page.waitForFunction(() => /Szene geladen|Tiefenkarte geladen/.test(document.getElementById('status').textContent));
  await page.setInputFiles('#f-mat', MARKER_IMG);
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('Material-Map geladen'));
  await page.click('#btn-create');
  await page.waitForFunction(() => window.SHADED.isReady());
  await page.evaluate(() => { window.SHADED.applyAct('tag'); window.SHADED.setTime(2.0, true); });
  await page.waitForTimeout(200);

  console.log('Test 1: Box ist initial versteckt, kein Dialog aktiv');
  const initiallyHidden = await page.evaluate(() => document.getElementById('dialogue-box').classList.contains('hidden') && !window.SHADED.dialogue.isPlaying());
  check('Box versteckt, isPlaying()==false vor play()', initiallyHidden);

  console.log('\nTest 2: play() zeigt die Box, Typewriter deckt Text schrittweise auf');
  await page.evaluate(() => window.SHADED.dialogue.play([
    { type: 'direction', text: 'Eine Testregieanweisung.' },
    { type: 'line', speaker: 'TESTFIGUR', text: 'Ein kurzer Testsatz fuer den Motor.' },
    { type: 'lens', n: 3 },
    { type: 'line', speaker: 'TESTFIGUR', text: 'Zweite Zeile nach dem Trigger.' },
  ]));
  await page.waitForTimeout(30);
  const afterPlay = await page.evaluate(() => ({
    hidden: document.getElementById('dialogue-box').classList.contains('hidden'),
    playing: window.SHADED.dialogue.isPlaying(),
    speakerClass: document.getElementById('dialogue-speaker').className,
    partialLen: document.getElementById('dialogue-text').textContent.length,
    fullLen: window.SHADED.dialogue.current().beat.text.length,
  }));
  check('Box sichtbar nach play()', !afterPlay.hidden);
  check('isPlaying()==true', afterPlay.playing);
  check('erster Beat als "direction" erkannt (Speaker-Klasse)', afterPlay.speakerClass === 'direction', afterPlay.speakerClass);
  check('Typewriter hat NICHT sofort den ganzen Text gezeigt', afterPlay.partialLen > 0 && afterPlay.partialLen < afterPlay.fullLen, `${afterPlay.partialLen}/${afterPlay.fullLen}`);

  console.log('\nTest 3: advance() deckt zuerst den Rest des Texts auf, statt gleich weiterzuspringen');
  await page.evaluate(() => window.SHADED.dialogue.advance());
  const afterFirstAdvance = await page.evaluate(() => ({ index: window.SHADED.dialogue.current().index, text: document.getElementById('dialogue-text').textContent }));
  check('noch auf Beat 0, aber Text jetzt komplett', afterFirstAdvance.index === 0 && afterFirstAdvance.text === 'Eine Testregieanweisung.', JSON.stringify(afterFirstAdvance));

  console.log('\nTest 4: zweites advance() springt zu Beat 1 (Sprecher wird korrekt gesetzt)');
  await page.evaluate(() => window.SHADED.dialogue.advance());
  const beat1 = await page.evaluate(() => ({ index: window.SHADED.dialogue.current().index, speaker: document.getElementById('dialogue-speaker').textContent }));
  check('Beat 1 aktiv, Speaker == TESTFIGUR', beat1.index === 1 && beat1.speaker === 'TESTFIGUR', JSON.stringify(beat1));

  console.log('\nTest 5: Lens-Trigger-Beat läuft automatisch durch (kein Warten) und wirkt echt');
  await page.evaluate(() => window.SHADED.dialogue.advance()); // Rest von Beat 1 aufdecken
  await page.evaluate(() => window.SHADED.dialogue.advance()); // zu Beat 2 (lens) -> läuft durch zu Beat 3
  const afterLensBeat = await page.evaluate(() => ({ lens: window.SHADED.lens.get(), index: window.SHADED.dialogue.current().index, speaker: document.getElementById('dialogue-speaker').textContent }));
  check('Lens-Trigger hat SHADED.lens tatsächlich auf 3 gesetzt', afterLensBeat.lens === 3, `lens=${afterLensBeat.lens}`);
  check('Dialog ist automatisch bei Beat 3 (Trigger übersprungen, kein Klick nötig)', afterLensBeat.index === 3, JSON.stringify(afterLensBeat));
  await page.evaluate(() => window.SHADED.lens.set(0)); // aufräumen für den Rest des Laufs

  console.log('\nTest 6: Tastatur (Leertaste) advanced, ohne gleichzeitig den Spieler-Dash auszulösen');
  await page.evaluate(() => { window.SHADED.player.enable(); });
  const beforeSpace = await page.evaluate(() => window.SHADED.player.pos());
  await page.evaluate(() => window.SHADED.dialogue.advance()); // Text von Beat 3 komplett aufdecken
  await page.keyboard.press(' ');
  await page.waitForTimeout(50);
  const afterSpace = await page.evaluate(() => ({ pos: window.SHADED.player.pos(), playing: window.SHADED.dialogue.isPlaying() }));
  check('Leertaste hat Dialog beendet (letzter Beat war 3)', !afterSpace.playing, JSON.stringify(afterSpace));
  check('Leertaste hat KEINEN Spieler-Dash ausgelöst (Position unverändert)', Math.abs(afterSpace.pos.u - beforeSpace.u) < 0.001 && Math.abs(afterSpace.pos.v - beforeSpace.v) < 0.001, `${JSON.stringify(beforeSpace)} -> ${JSON.stringify(afterSpace.pos)}`);

  console.log('\nTest 7: Box ist nach Sequenzende wieder versteckt');
  const boxHiddenAtEnd = await page.evaluate(() => document.getElementById('dialogue-box').classList.contains('hidden'));
  check('Box versteckt nach letztem Beat', boxHiddenAtEnd);

  console.log('\nTest 8: skip() beendet eine laufende Sequenz sofort');
  await page.evaluate(() => window.SHADED.dialogue.play([{ type: 'line', speaker: 'X', text: 'abc' }, { type: 'line', speaker: 'Y', text: 'def' }]));
  await page.evaluate(() => window.SHADED.dialogue.skip());
  const afterSkip = await page.evaluate(() => ({ playing: window.SHADED.dialogue.isPlaying(), hidden: document.getElementById('dialogue-box').classList.contains('hidden') }));
  check('skip() beendet sofort', !afterSkip.playing && afterSkip.hidden, JSON.stringify(afterSkip));

  console.log('\nKonsole-Fehler:', errors.length ? errors.join(' | ') : '(keine)');
  check('keine Page-/Shader-Errors', !errors.some((e) => e.startsWith('PAGEERROR')));

  await browser.close();
  server.close();
  console.log(failed ? '\n❌ verify-dialogue FAILED' : '\n✅ verify-dialogue PASSED');
  process.exitCode = failed ? 1 : 0;
})();
