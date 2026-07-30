/* SHADED — "Wenn das 2 ist", Akt 1: Ankunft & Stans Voodoo-Särge.
 *
 * Reiner Inhalt, keine Motorlogik (die lebt in index.html, Runde 10: Dialog-Engine).
 * Transkription des Originaltexts aus "SHADED- WENN DAS 2 IST.docx" (Eigentum des
 * Repository-Owners) in das Beat-Format von SHADED.dialogue.play().
 *
 * Deckt den Prolog von SCHWARZBILD bis zum Ende von "PFLICHTDIALOG MIT STAN" ab.
 * NICHT enthalten (Folge-Runde): die eigentliche Interaktions-/Rätsellogik des
 * Controllers (Tastendruck-Zählung, KLAK-Eskalation als echter Spielzustand statt
 * Erzähltext), die optionalen Stan-Nebendialoge, Wallys Kartenrätsel, das Finale.
 *
 * Laden (optional, NICHT automatisch in index.html enthalten - SHADED bleibt als
 * Engine generisch):
 *   <script src="content/prolog-act1.js"></script>  <!-- nach index.html -->
 *   <script>SHADED.dialogue.play(window.SHADED_PROLOG_ACT1);</script>
 */
window.SHADED_PROLOG_ACT1 = [
  { type: 'direction', text: 'SCHWARZBILD. Das Monkey-Island-Thema beginnt. Nicht pompös. Nicht ironisch gebrochen. Einfach die ersten vertrauten Töne, sauber und klein, als kämen sie aus einem Raum, den man seit dreißig Jahren nicht geöffnet hat.' },
  { type: 'direction', text: 'Nach vier Takten erscheint Guybrush Threepwood auf dem Anleger von Phatt Island. Er steht regungslos da.' },
  { type: 'line', speaker: 'GUYBRUSH', text: 'Bei dieser Musik bin ich plötzlich wieder neun.' },
  { type: 'direction', text: 'Kurze Pause.' },
  { type: 'line', speaker: 'GUYBRUSH', text: 'Das ist ungünstig. Ich trage einen Gürtel und habe unbeaufsichtigten Zugang zu Geld.' },
  { type: 'direction', text: 'Die normale SCUMM-Oberfläche erscheint. Maussteuerung. Keine Hinweise auf Tastaturbedienung. Im Inventar liegt eine kleine Muschel, die Guybrush offenbar schon die ganze Zeit besitzt.' },
  { type: 'direction', text: 'MUSCHEL ANSEHEN' },
  { type: 'line', speaker: 'GUYBRUSH', text: 'Eine hochauflösende Entwicklerkommentar-Muschel. Wally sagt, sie enthalte die Erinnerung eines Jungen, der dieses Abenteuer früher mit seinem Bruder gespielt hat.' },
  { type: 'direction', text: 'Die Muschel knistert.' },
  { type: 'line', speaker: 'STIMME AUS DER MUSCHEL', text: 'Als Kind spielte er dieses Spiel gemeinsam mit seinem Bruder. Jahre später erzählte er davon, während das alte Abenteuer noch einmal neu gemalt wurde.' },
  { type: 'direction', text: 'Guybrush dreht die Muschel um.' },
  { type: 'line', speaker: 'GUYBRUSH', text: 'Ich habe als Kind wiederum seine Spiele gespielt.' },
  { type: 'direction', text: 'Die Muschel knistert erneut.' },
  { type: 'line', speaker: 'GUYBRUSH', text: 'Damit besitzt diese Muschel jetzt eine Erinnerung an jemanden, der sich daran erinnert, dass jemand anderes sich erinnert.' },
  { type: 'direction', text: 'Pause.' },
  { type: 'line', speaker: 'GUYBRUSH', text: 'Das ist entweder sehr rührend oder der Anfang eines Zeitreiseproblems.' },
  { type: 'direction', text: 'Vom Marktplatz ertönt ein gewaltiges metallisches Scheppern.' },
  { type: 'line', speaker: 'STAN, AUS DEM OFF', text: 'TOD IST KEIN GRUND, BEIM KOMFORT ABSTRICHE ZU MACHEN!' },
  { type: 'direction', text: 'Guybrush seufzt.' },
  { type: 'line', speaker: 'GUYBRUSH', text: 'Zeitreiseproblem wäre mir lieber gewesen.' },

  { type: 'direction', text: '1. STANS GEBRAUCHTE, HOCHMODERNE VOODOO-SÄRGE' },
  { type: 'direction', text: 'Stan hat auf Phatt Island einen improvisierten Verkaufsplatz aufgebaut. Hinter ihm stehen Särge mit Messingbeschlägen, Voodoo-Antennen, Getränkehaltern und Rädern, die offenkundig nicht zum Rollen gedacht sind.' },
  { type: 'direction', text: 'Stan trägt einen schwarzen Anzug mit Grabsteinmuster. Seine Arme bewegen sich in einer Geschwindigkeit, die in mehreren Ländern als Windkraftanlage angemeldet werden müsste.' },
  { type: 'line', speaker: 'STAN', text: 'Guybrush Threepwood! Pirat! Abenteurer! Mann mit nachweislich geringer Restlebenserwartung!' },
  { type: 'line', speaker: 'GUYBRUSH', text: 'Stan.' },
  { type: 'line', speaker: 'STAN', text: 'Sag nichts! Ich sehe es in deinen Augen!' },
  { type: 'line', speaker: 'GUYBRUSH', text: 'Das ist Müdigkeit.' },
  { type: 'line', speaker: 'STAN', text: 'VORAUSSCHAUENDE MÜDIGKEIT!' },
  { type: 'direction', text: 'Stan schlägt auf einen grauen, klobigen Kasten. Er besitzt fünf schwere Tasten, nummeriert von 1 bis 5. Jede Taste sieht aus, als könnte man damit entweder eine Gruft öffnen oder eine kleinere Gruft herstellen.' },
  { type: 'line', speaker: 'STAN', text: 'Der Individual Burial Matrix-Controller!' },
  { type: 'direction', text: 'Er hält den Kasten direkt vor Guybrushs Gesicht.' },
  { type: 'line', speaker: 'STAN', text: 'Kurz: I. B. M.!' },
  { type: 'line', speaker: 'GUYBRUSH', text: 'Natürlich.' },
  { type: 'line', speaker: 'STAN', text: 'Damit gibst du den digitalen Voodoo-Code deines Premium-Sicherheitssarges ein! Fünf Tasten! Maximale Übersicht! Mehr kann sich ein Toter ohnehin nicht merken!' },
  { type: 'line', speaker: 'GUYBRUSH', text: 'Warum sollte ein Toter seinen Sarg von innen abschließen?' },
  { type: 'direction', text: 'Stan senkt die Stimme.' },
  { type: 'line', speaker: 'STAN', text: 'Weil draußen die Lebenden sind.' },
  { type: 'direction', text: 'Guybrush betrachtet die Menschen auf Phatt Island.' },
  { type: 'line', speaker: 'GUYBRUSH', text: 'Das ist das erste überzeugende Argument, das du je hattest.' },
  { type: 'direction', text: 'Stan drückt ihm den Controller in die Hand. Er landet im Inventar.' },
  { type: 'direction', text: 'Von diesem Moment an erzeugen die echten Tasten 1 bis 5 auf der Tastatur ein sattes, mechanisches: KLAK. Die Spielgrafik reagiert noch nicht. Drückt der Spieler eine Taste, holt Guybrush den Controller kurz hervor, tippt die entsprechende Zahl und steckt ihn wieder ein.' },
  { type: 'line', speaker: 'GUYBRUSH', text: 'Nichts da, wo ich das reinstecken könnte.' },
  { type: 'direction', text: 'Beim zweiten Tastendruck:' },
  { type: 'line', speaker: 'GUYBRUSH', text: 'Immer noch nichts.' },
  { type: 'direction', text: 'Beim dritten:' },
  { type: 'line', speaker: 'GUYBRUSH', text: 'Ich weiß nicht, was schlimmer ist: dass ich es weiter versuche oder dass das Gerät offenbar mitzählt.' },
  { type: 'direction', text: 'Beim sechsten:' },
  { type: 'line', speaker: 'CONTROLLER', text: 'KLAK.' },
  { type: 'line', speaker: 'GUYBRUSH', text: 'Das klang urteilend.' },

  { type: 'direction', text: 'PFLICHTDIALOG MIT STAN' },
  { type: 'line', speaker: 'GUYBRUSH', text: 'Ist das Gerät neu?' },
  { type: 'line', speaker: 'STAN', text: 'Besser! Es ist gebraucht!' },
  { type: 'line', speaker: 'GUYBRUSH', text: 'Das ist normalerweise nicht besser.' },
  { type: 'line', speaker: 'STAN', text: 'Neu bedeutet ungetestet! Gebraucht bedeutet, dass mindestens ein Vorbesitzer den vollständigen Produktlebenszyklus erfolgreich abgeschlossen hat!' },
  { type: 'direction', text: 'Stan deutet auf einen Sarg mit einem großen Loch im Deckel.' },
  { type: 'line', speaker: 'GUYBRUSH', text: 'Ist er da ausgestiegen?' },
  { type: 'line', speaker: 'STAN', text: 'Das ist eine Frage der juristischen Blickrichtung.' },
  { type: 'direction', text: 'Guybrush erfährt, dass Stan den Controller aus einem zahlungsunfähigen Geheimclub in der alten Gasse von Phatt Island zurückholen wollte. Der Club habe jedoch behauptet, der Controller sei Bestandteil des Türsystems und dürfe wegen „laufender Sicherheitsrituale“ nicht entfernt werden.' },
  { type: 'line', speaker: 'STAN', text: 'Du bringst ihn hin, sie testen ihn, ich erhalte eine Kundenreferenz und du bekommst—' },
  { type: 'direction', text: 'Stan schaut auf seine leeren Hände.' },
  { type: 'line', speaker: 'STAN', text: '—ein starkes Gefühl, geholfen zu haben.' },
  { type: 'line', speaker: 'GUYBRUSH', text: 'Ich lehne ab.' },
  { type: 'line', speaker: 'STAN', text: 'Ausgezeichnet! Dann einigen wir uns auf eine unverbindliche Teststellung mit automatischer Zustimmung!' },
  { type: 'direction', text: 'Der Controller bleibt im Inventar.' },
];
