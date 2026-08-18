# Danube Vessel Log – Version 0.14.22

Stand: 18.08.2026

## Zweck dieser Version

Version 0.14.22 korrigiert die Verarbeitung und Anzeige von Sichtungsmetadaten bei Foto-Sichtungen.

Auslöser waren insbesondere folgende Beobachtungen:

- Bei einem am 17.08.2026 um 07:07 Uhr aufgenommenen Foto wurde beim späteren Upload am 18.08.2026 nahezu der Uploadzeitpunkt als `captured_at` gespeichert.
- `location` blieb leer, obwohl eine bekannte Anlegestelle mit `location_id` ausgewählt war.
- Bei bereits automatisch zugeordneten Sichtungen wurde weiterhin der Bereich „Mögliche Schiffe“ angezeigt.
- Auf `vessel.html` wurde bei Sichtungen nur der Aufnahmeort, nicht zusätzlich die bekannte Anlegestelle angezeigt.

## Verbindliche Regel ab 0.14.22

Bei **„Schiffsichtung mit Foto(s)“** gilt künftig:

1. `captured_at` = Aufnahmezeitpunkt des ersten ausgewählten Fotos.
2. `uploaded_at` = tatsächlicher Uploadzeitpunkt; dieser wird weiterhin serverseitig gesetzt.
3. `photo_lat` / `photo_lon` = GPS-Daten des ersten ausgewählten Fotos.
4. Der aktuelle Standort des iPhones beim späteren Upload darf nicht als Foto-Aufnahmeort verwendet werden.
5. Ist kein verwertbarer Foto-GPS-Ort vorhanden, aber eine bekannte Anlegestelle ausgewählt, darf deren `location_id` als Standort-Fallback verwendet werden.

## Geänderte Dateien

- `cloudflare/worker.js`
- `docs/js/vessel.js`

Zusätzlich enthalten:

- `KURZBEFEHL_SCHIFFSSICHTUNG_MIT_FOTOS.md`
- `COMMIT_MESSAGE.txt`
- diese vollständige `README.md`

## Änderungen im Worker

### 1. Standort-Fallback über die Anlegestelle

Nach der Ermittlung der Anlegestelle prüft der Worker, ob `location` bereits erfolgreich bestimmt wurde.

Falls nicht und die gewählte Anlegestelle eine gültige `location_id` enthält, wird der zugehörige Eintrag aus `data/locations.csv` verwendet.

Beispiel:

- Anlegestelle: `BER-000001`
- `location_id`: `LOC-001`
- Ergebnis: Aufnahmeort wird über `LOC-001` ergänzt.

Eine bereits über Foto-GPS bzw. Koordinaten gefundene Location hat weiterhin Vorrang.

### 2. Anzeige-Fallback auch für bereits gespeicherte Sichtungen

Auch ältere Sichtungen können `location` leer gespeichert haben, obwohl `berth.location_id` vorhanden ist.

0.14.22 ergänzt deshalb bei den API-Ausgaben für

- die Sichtungsverwaltung und
- `vessel.html`

bei Bedarf die Location aus `data/locations.csv`.

Wichtig: Das ändert die alte Submission-Datei nicht rückwirkend. Es korrigiert die Anzeige aus den bereits vorhandenen Referenzdaten.

### 3. Keine „Möglichen Schiffe“ nach erfolgter Zuordnung

Bei `workflow.status = reviewed` werden in der Ausgabe der Review-Liste keine Vessel-Kandidaten mehr geliefert.

Damit blendet die bestehende Sichtungsseite den Bereich **„Mögliche Schiffe“** aus, sobald die Sichtung bereits zugeordnet wurde. Das gilt sinnvollerweise sowohl für automatische als auch für bereits abgeschlossene manuelle Zuordnungen.

Katalogkandidaten werden bei bereits bearbeiteten Sichtungen ebenfalls nicht mehr als offene Auswahl angeboten.

## Änderungen auf vessel.html

`docs/js/vessel.js` zeigt bei einer Sichtung künftig Aufnahmeort und Anlegestelle gemeinsam an, sofern beide vorhanden sind.

Beispiel:

`Nibelungenbrücke, Linz, Österreich · Linz-Schloss Nr. 11`

Das gilt sowohl

- in der Sichtungsliste als auch
- für den letzten Ort in der Zusammenfassung.

Ist nur die Anlegestelle bekannt, wird zumindest diese angezeigt.

## Änderung am iPhone-Kurzbefehl

Der Worker kann das tatsächliche Aufnahmedatum eines Fotos nicht aus einem bereits vom Kurzbefehl falsch befüllten `captured_at` rekonstruieren.

Darum muss **„Schiffsichtung mit Foto(s)“** angepasst werden.

Der Kurzbefehl enthält bereits am Anfang sinngemäß:

- `Erstes Objekt von Kurzbefehleingabe abrufen`
- `Ort aus Objekt aus Liste abrufen`
- `Aktuellen Ort abrufen`
- `Breitengrad aus Aktueller Standort abrufen`
- `Längengrad aus Aktueller Standort abrufen`
- `Aktuelles Datum`
- `Datum formatieren`

Künftig muss gelten:

- `Aufnahmedatum` wird aus dem **ersten Foto** gelesen und ist die Quelle für `captured_at`.
- `Ort` wird aus dem **ersten Foto** gelesen und ist die Quelle für `photo_lat` / `photo_lon`.
- `Aktuelles Datum` darf bei Foto-Sichtungen nicht mehr `captured_at` liefern.
- `Aktueller Standort` darf bei Foto-Sichtungen nicht mehr als `photo_lat` / `photo_lon` verwendet werden.

Die genaue Schritt-für-Schritt-Anleitung steht in `KURZBEFEHL_SCHIFFSSICHTUNG_MIT_FOTOS.md`.

## Bestehende falsche Datumswerte

Version 0.14.22 korrigiert **zukünftige Uploads**, sobald der Kurzbefehl angepasst ist.

Bereits gespeicherte falsche `captured_at`-Werte können nicht automatisch korrigiert werden, weil der tatsächliche Aufnahmezeitpunkt nicht mehr zuverlässig aus der Submission hervorgeht.

Für die aktuelle Sichtung

`SUB-20260818-044727-5CB090`

ist bekannt:

- tatsächliche Fotoaufnahme laut Nutzer: **17.08.2026, 07:07 Uhr**
- gespeicherter Wert: praktisch Zeitpunkt des Uploads am 18.08.2026

Dieser Datensatz kann in einem getrennten Reparaturschritt korrigiert werden.

Für weitere bereits vorhandene Sichtungen benötigen wir jeweils den tatsächlichen Aufnahmezeitpunkt des betreffenden Fotos, bevor historische Daten verändert werden.

## Installation

1. ZIP-Datei entpacken.
2. `cloudflare/worker.js` im Repository vollständig ersetzen.
3. `docs/js/vessel.js` im Repository vollständig ersetzen.
4. Änderungen committen und pushen.
5. Cloudflare-Worker-Deployment abwarten bzw. wie bisher auslösen.
6. GitHub Pages aktualisieren lassen.
7. Den iPhone-Kurzbefehl anhand der beigefügten Anleitung anpassen.

## Test 1 – bestehende automatisch zugeordnete Sichtung

Die vorhandene Sichtung erneut in der Sichtungsverwaltung öffnen.

Erwartet:

- `Aufnahmeort` wird bei bekannter `berth.location_id` wieder angezeigt.
- Bereich „Mögliche Schiffe“ erscheint bei der bereits bearbeiteten Sichtung nicht mehr.
- der kanonische Stammdatensatz bleibt sichtbar.

Der alte falsche Aufnahmezeitpunkt bleibt bei diesem bestehenden Datensatz zunächst unverändert.

## Test 2 – vessel.html

Bei einer Sichtung mit Location und Anlegestelle wird beispielsweise angezeigt:

`Nibelungenbrücke, Linz, Österreich · Linz-Schloss Nr. 11`

Bei einer älteren Sichtung mit leerer Location, aber bekannter `berth.location_id`, wird der Aufnahmeort für die Anzeige aus der Standortreferenz ergänzt.

## Test 3 – neuer Foto-Upload nach Shortcut-Anpassung

Ein bereits vorhandenes Foto verwenden, dessen Aufnahmedatum bekannt ist.

Erwartet in der Submission:

- `uploaded_at` = Zeitpunkt des neuen Uploads
- `captured_at` = ursprünglicher Aufnahmezeitpunkt des Fotos
- `photo_lat` / `photo_lon` = Foto-GPS oder leer
- keine Übernahme des aktuellen Handy-Standorts als Foto-GPS
- bei bekannter Anlegestelle und fehlender Location: `location.status = matched`

Für das konkrete Beispiel vom 17.08.2026 um 07:07 Uhr muss die Website anschließend ebenfalls **17.08.2026, 07:07** anzeigen.

## Technische Prüfung

Vor dem Verpacken wurden durchgeführt:

- `node --check cloudflare/worker.js`
- `node --check docs/js/vessel.js`

Beide Dateien sind syntaktisch gültig.

## Nicht Bestandteil dieser Version

- Kein automatisches Umschreiben historischer falscher `captured_at`-Werte.
- Keine Änderung am Kurzbefehl „Schiffsichtung ohne Foto“.
- Keine Änderung am Datenmodell der Vessel-Stammdaten.
- Keine Änderung an Foto-Löschlogik; der frühere Löschfehler war im Zusammenhang mit der GitHub-Störung aufgetreten.

## Frühere provisorische 0.14.22-Pakete

Frühere in diesem Chat vorbereitete 0.14.22-Pakete gelten als **verworfen**.

Dieses Paket ist die maßgebliche Version 0.14.22 für Sichtungsmetadaten und Anzeige.

## Versionen

### `cloudflare/worker.js`

- Version: `0.14.22`
- Updated: `2026-08-18`

### `docs/js/vessel.js`

- Version: `0.14.22`
- Updated: `2026-08-18`
