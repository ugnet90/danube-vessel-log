# Danube Vessel Log – Version 0.14.23

Stand: 18.08.2026

## Zweck dieser Version

Version 0.14.23 korrigiert zwei Darstellungsdetails bei Sichtungen und baut auf dem vollständigen Stand von 0.14.22 auf.

Dieses Paket ist kumulativ: 0.14.22 muss **nicht** vorher installiert werden. Die enthaltenen Dateien `cloudflare/worker.js` und `docs/js/vessel.js` enthalten auch die in 0.14.22 vorgenommenen Änderungen zu Location-Fallback und Sichtungsanzeige.

## Geänderte Dateien

- `cloudflare/worker.js`
- `docs/js/vessel.js`

Zusätzlich enthält das Paket:

- `README.md`
- `COMMIT_MESSAGE.txt`

## Änderungen

### 1. Doppelte Ortsangabe entfernt

Bisher konnte ein Aufnahmeort so erscheinen:

`Nibelungenbrücke, Linz, Linz, Österreich`

Ursache: Der öffentliche Location-Name enthält bereits `Linz`, während `municipality` zusätzlich ebenfalls `Linz` enthält.

Ab 0.14.23 werden Location-Bestandteile bei der API-Ausgabe dedupliziert. Der Worker erkennt, ob Gemeinde oder Land bereits als kommagetrennter Bestandteil im Location-Namen enthalten sind.

Erwartete Anzeige:

`Nibelungenbrücke, Linz, Österreich`

Die Korrektur wirkt auch auf ältere bereits gespeicherte Sichtungen, da die Bereinigung bei der Ausgabe erfolgt. Neue Sichtungen werden zusätzlich bereits mit bereinigten Location-Bestandteilen gespeichert.

### 2. Sichtungsdarstellung auf vessel.html neu geordnet

Bisher:

`Nibelungenbrücke, Linz, Linz, Österreich · Linz-Schloss Nr. 11`

`angelegt · flussaufwärts · SUB-20260817-100752-22C490`

Ab 0.14.23:

`Nibelungenbrücke, Linz, Österreich · SUB-20260817-100752-22C490`

`angelegt · flussaufwärts · Linz-Schloss Nr. 11`

Damit steht die Submission-ID direkt beim Aufnahmeort und die konkrete Anlegestelle bei den Bewegungs-/Sichtungsdaten.

### 3. Zusätzliche Absicherung im Frontend

`docs/js/vessel.js` entfernt doppelte Ortsbestandteile auch selbst. Dadurch bleibt die Darstellung korrekt, selbst wenn eine ältere API-Antwort oder ein historischer Datensatz noch `Linz` sowohl im Namen als auch im Feld `municipality` enthält.

## Unverändert

- automatische Zuordnung vorhandener Schiffe über `vessel_id`
- Unterdrückung der Kandidatenanzeige bei bereits zugeordneten Sichtungen
- Location-Fallback über die Anlegestelle (`berth.location_id`)
- Foto-Löschung
- Hauptfoto-Logik
- Sichtungsindex
- Datenmodell und vorhandene IDs
- Authentifizierung

## Hinweis zum Aufnahmezeitpunkt von Fotos

Diese Version ändert **nicht** den iPhone-Kurzbefehl.

Damit bei einem später hochgeladenen Foto der tatsächliche Aufnahmezeitpunkt gespeichert wird, muss der Kurzbefehl weiterhin so angepasst werden, dass `captured_at` aus dem Aufnahmedatum des ersten Fotos stammt und nicht aus `Aktuelles Datum` beim Upload.

Beispiel:

- Foto aufgenommen: 17.08.2026, 07:07
- Upload: 18.08.2026
- `captured_at`: 17.08.2026, 07:07
- `uploaded_at`: 18.08.2026

Diese Shortcut-Anpassung erfolgt separat Schritt für Schritt.

## Installation

1. ZIP-Datei entpacken.
2. Im Repository die vorhandene Datei `cloudflare/worker.js` vollständig durch die Datei aus diesem Paket ersetzen.
3. `docs/js/vessel.js` vollständig durch die Datei aus diesem Paket ersetzen.
4. Beide Dateien committen.
5. Cloudflare Worker wie bisher deployen.
6. GitHub Pages aktualisieren lassen.
7. Browserseite anschließend neu laden; falls nötig mit erzwungenem Reload.

## Test

### Sichtungsseite / Submission

Bei einer Sichtung an der Nibelungenbrücke muss der Aufnahmeort lauten:

`Nibelungenbrücke, Linz, Österreich`

Nicht mehr:

`Nibelungenbrücke, Linz, Linz, Österreich`

### vessel.html

Für die Sichtung `SUB-20260817-100752-22C490` soll die Darstellung beispielsweise lauten:

`Nibelungenbrücke, Linz, Österreich · SUB-20260817-100752-22C490`

`angelegt · flussaufwärts · Linz-Schloss Nr. 11`

### Historische Sichtungen

Auch bereits gespeicherte Sichtungen mit doppelter Gemeinde im Location-Objekt sollen bei der Anzeige nur noch eine einmalige Ortsangabe zeigen.

## Technische Prüfung

Die beiden geänderten JavaScript-Dateien wurden mit `node --check` auf Syntaxfehler geprüft.

## Rückfall

Bei unerwarteten Problemen können `cloudflare/worker.js` und `docs/js/vessel.js` auf Version 0.14.22 zurückgesetzt und erneut deployed werden.

## Versionen

### cloudflare/worker.js

- Version: `0.14.23`
- Updated: `2026-08-18`

### docs/js/vessel.js

- Version: `0.14.23`
- Updated: `2026-08-18`
