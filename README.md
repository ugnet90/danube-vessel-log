# Danube Vessel Log – Version 0.14.22

Stand: 18.08.2026

## Zweck dieser Version

Version 0.14.22 korrigiert zwei Punkte bei Sichtungen mit Foto(s):

1. Wenn eine bekannte Anlegestelle gewählt wurde, soll deren `location_id` auch dann als Standort der Sichtung übernommen werden, wenn die Foto-/GPS-Koordinaten keiner bekannten Location zugeordnet werden konnten.
2. Im iPhone-Kurzbefehl soll `captured_at` aus dem Aufnahmedatum des Fotos kommen und nicht aus dem Zeitpunkt des späteren Uploads. Ebenso sollen `photo_lat`/`photo_lon` aus den Fotodaten stammen und nicht aus dem aktuellen Standort beim Upload.

## Geänderte Datei

- `cloudflare/worker.js`

## Zusätzlich enthalten

- `KURZBEFEHL_SCHIFFSSICHTUNG_MIT_FOTOS.md`
- `COMMIT_MESSAGE.txt`

## Worker-Änderung

Der Worker übernimmt künftig bei einer bereits eindeutig gematchten Anlegestelle deren `location_id` als Fallback, wenn `location` zuvor unbekannt geblieben ist.

Beispiel:

- Anlegestelle: `BER-000001` – Linz-Schloss Nr. 11
- Anlegestelle verweist auf: `LOC-001`
- Foto-GPS ist nicht vorhanden oder liegt außerhalb des Location-Radius

Dann wird die Submission trotzdem mit der zugehörigen `LOC-001` als `location` gespeichert. `location.matched_by` wird in diesem Fall auf `berth_id` gesetzt.

Bestehende Priorität bleibt erhalten:

1. Foto-/Beobachtungskoordinaten bzw. explizite `location_id`
2. Fallback über die gematchte Anlegestelle
3. sonst `location.status = unknown`

Eine bereits per Koordinaten gefundene Location wird durch die Anlegestelle nicht überschrieben.

## Wichtige Trennung der Zeitstempel

`uploaded_at` bleibt weiterhin der tatsächliche Zeitpunkt, zu dem die Sichtung an den Worker übertragen wurde.

`captured_at` soll dagegen der tatsächliche Aufnahmezeitpunkt des Fotos sein.

Beispiel:

- Foto aufgenommen: 17.08.2026 18:20
- Upload: 18.08.2026 06:47

Dann soll gelten:

- `captured_at` = 17.08.2026 18:20
- `uploaded_at` = 18.08.2026 06:47

## iPhone-Kurzbefehl

Die Änderung des Aufnahmezeitpunkts und der Foto-GPS-Daten erfolgt im Kurzbefehl **„Schiffsichtung mit Foto(s)“**. Der Worker kann das EXIF-Aufnahmedatum nicht aus den derzeit übertragenen Metadaten ableiten; der Kurzbefehl muss es vor dem Upload aus dem Originalfoto auslesen.

Die genauen Schritte stehen in `KURZBEFEHL_SCHIFFSSICHTUNG_MIT_FOTOS.md`.

## Installation Worker

1. ZIP entpacken.
2. `cloudflare/worker.js` im Repository vollständig durch die Datei aus diesem Paket ersetzen.
3. Committen.
4. Cloudflare Worker wie bisher deployen.
5. Danach den Kurzbefehl gemäß Anleitung anpassen.

## Testfälle

### A – Foto mit EXIF-Aufnahmedatum und GPS

Erwartet:

- `captured_at` entspricht dem Foto-Aufnahmedatum.
- `photo_lat`/`photo_lon` entsprechen dem Foto-GPS.
- `uploaded_at` entspricht dem Uploadzeitpunkt.
- `location` wird nach den Foto-Koordinaten bestimmt.

### B – Foto mit Aufnahmedatum, aber ohne GPS; bekannte Anlegestelle gewählt

Erwartet:

- `captured_at` entspricht dem Foto-Aufnahmedatum.
- `photo_lat`/`photo_lon` bleiben leer/null.
- `location` wird aus `berth.location_id` übernommen.
- `location.matched_by = "berth_id"`.

### C – Foto ohne Aufnahmedatum

Der Kurzbefehl soll nach dem tatsächlichen Aufnahmezeitpunkt fragen. Der Uploadzeitpunkt wird nicht automatisch als Aufnahmezeitpunkt verwendet.

## Rückfall

Falls die Worker-Änderung unerwartete Probleme verursacht, `cloudflare/worker.js` wieder durch Version 0.14.21 ersetzen und neu deployen.

## Version

`cloudflare/worker.js`

- Version: `0.14.22`
- Updated: `2026-08-18`
