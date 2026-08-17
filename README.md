# Danube Vessel Log – Version 0.14.21

**Stand:** 17.08.2026  
**Basis:** Version 0.14.20

## Zweck dieser Version

Version 0.14.21 schließt den Ablauf für bereits bekannte Schiffe: Wenn der Worker bei einer neuen Sichtung genau **einen eindeutigen vorhandenen Vessel-Datensatz** erkennt, wird die Sichtung automatisch diesem Schiff zugeordnet. Die manuelle Schaltfläche **„Zuordnung bestätigen“** ist für solche eindeutigen Fälle nicht mehr erforderlich.

Mehrdeutige Treffer und nicht erkannte Schiffe bleiben weiterhin offen und werden wie bisher in `submissions.html` manuell geprüft.

Zusätzlich ist der Worker jetzt darauf vorbereitet, dass die iPhone-Kurzbefehle künftig bei der Auswahl eines bestehenden Schiffs direkt dessen `vessel_id` mitsenden. Eine explizit mitgesendete gültige Vessel-ID hat Vorrang vor dem Namensabgleich.

## Geänderte Dateien

```text
cloudflare/worker.js
```

Es werden in dieser Version keine HTML-, CSS- oder sonstigen JavaScript-Dateien geändert.

## Änderungen im Detail

### 1. Automatische Bestätigung eindeutiger Schiffstreffer

Eine neu hochgeladene Sichtung wird automatisch bestätigt, wenn der automatische Treffer gleichzeitig folgende Bedingungen erfüllt:

- `workflow.auto.vessel_match.status == "matched"`
- `candidate_count == 1`
- `vessel_id` entspricht dem Format `VES-000000`
- der zugehörige kanonische Vessel-Datensatz ist im Repository vorhanden und konsistent

Beispiel:

```json
{
  "status": "matched",
  "vessel_id": "VES-000112",
  "matched_by": "normalized_name",
  "candidate_count": 1,
  "candidate_ids": ["VES-000112"]
}
```

Dieser Treffer wird ab 0.14.21 unmittelbar wie eine manuell bestätigte Zuordnung verarbeitet.

### 2. Submission-Workflow

Bei erfolgreicher automatischer Bestätigung wird die Submission auf den bestehenden Review-Status umgestellt:

```text
workflow.status = reviewed
workflow.review.reviewed = true
workflow.review.decision = confirmed
workflow.review.vessel_id = VES-……
```

Als Review-Notiz wird gespeichert:

```text
Automatisch bestätigt: eindeutige Zuordnung.
```

Die Sichtung erscheint dadurch nicht mehr unter den offenen Sichtungen.

### 3. `data/sightings.json`

Die automatisch bestätigte Sichtung wird über dieselbe bestehende Logik wie eine manuell bestätigte Sichtung in `data/sightings.json` eingetragen bzw. aktualisiert.

Damit stehen die Sichtung und ihre Fotos unmittelbar für `vessel.html` zur Verfügung.

### 4. Aktivitätsstatus des Schiffs

Die bestehende Aktivitätsregel bleibt vollständig erhalten:

- ist das Schiff bereits `active`, bleibt der Status unverändert;
- ist es `unknown`, `inactive` oder `scrapped`, wird es durch die bestätigte eigene Sichtung auf `active` gesetzt;
- die Statusänderung wird mit Submission-ID und Sichtungszeitpunkt in der Historie dokumentiert.

Bei einer erforderlichen Statusänderung werden Vessel-JSON, `data/vessels.csv`, Submission und Sichtungsindex gemeinsam atomar gespeichert.

### 5. Fehlerfall bei der automatischen Bestätigung

Der eigentliche Upload wird zuerst sicher gespeichert. Kann die nachfolgende automatische Bestätigung aus irgendeinem Grund nicht abgeschlossen werden, geht die Sichtung **nicht verloren**.

Sie bleibt dann offen und kann weiterhin manuell geprüft werden.

Die Upload-Antwort enthält in diesem Fall `auto_confirmation_error` mit dem Grund.

### 6. Neue Felder in der Upload-Antwort

Sowohl `/submission` als auch `/submission-photo` liefern zusätzlich:

```json
{
  "auto_confirmed": true,
  "vessel_id": "VES-000112",
  "auto_confirmation_error": "",
  "auto_confirmation_commit": "..."
}
```

Bei einer nicht automatisch bestätigten Sichtung ist `auto_confirmed` `false`.

### 7. Direkte `vessel_id` aus dem iPhone-Kurzbefehl

`resolveVessel()` akzeptiert ab 0.14.21 optional:

```json
{
  "vessel_id": "VES-000112"
}
```

Ist diese ID vorhanden und gültig, wird sie direkt gegen den Schiffsindex geprüft und als eindeutiger Treffer verwendet (`matched_by = "vessel_id"`).

Fehlt `vessel_id`, bleibt der bisherige Namensabgleich unverändert aktiv. Die bereits funktionierende Namensauswahl im Kurzbefehl muss daher für den ersten Test dieser Worker-Version noch nicht weiter geändert werden.

## Installation

1. ZIP-Datei entpacken.
2. Im Repository ausschließlich diese Datei ersetzen:

```text
cloudflare/worker.js
```

3. Änderung committen.
4. Den Cloudflare Worker deployen bzw. den automatischen Deploy abwarten.

## Commit-Kommentar

```text
Auto-confirm unambiguous vessel sightings
```

Der Commit-Kommentar liegt zusätzlich als `COMMIT_MESSAGE.txt` im Paket.

## Test nach dem Deployment

### Test A – vorhandenes Schiff, Sichtung mit Foto

1. Den bereits umgebauten Kurzbefehl **„Schiffsichtung mit Foto(s)“** verwenden.
2. Einen vorhandenen Schiffsnamen aus der dynamischen Liste auswählen.
3. Eine Sichtung mit einem Foto hochladen.
4. Upload-Antwort kontrollieren.

Erwartet:

```text
auto_confirmed = true
vessel_id = passende VES-……
auto_confirmation_error = leer
```

Danach prüfen:

- die neue Sichtung steht **nicht** unter „Offen“ in `submissions.html`;
- `vessel.html` zeigt eine zusätzliche Sichtung;
- die Fotoanzahl ist entsprechend erhöht;
- das neue Foto ergänzt vorhandene Fotos und ersetzt sie nicht.

### Test B – vorhandenes Schiff, Sichtung ohne Foto

Dasselbe anschließend mit **„Schiffsichtung ohne Foto“** prüfen. Auch hier muss ein eindeutiger Treffer automatisch bestätigt und im Sichtungsindex erfasst werden.

### Test C – neuer/unbekannter Name

Einen Namen eingeben, der keinem vorhandenen Schiff eindeutig zugeordnet werden kann.

Erwartet:

```text
auto_confirmed = false
```

Die Sichtung muss weiterhin unter „Offen“ erscheinen. Das ist beabsichtigt.

## Noch nicht Bestandteil dieses Pakets

Der iPhone-Kurzbefehl sendet derzeit bei Auswahl eines vorhandenen Namens noch nicht dessen `vessel_id` mit. Das ist für den Funktionstest von 0.14.21 nicht erforderlich, weil der eindeutige Namensabgleich bereits funktioniert.

Nach erfolgreichem Test von 0.14.21 kann der Kurzbefehl im nächsten Schritt so erweitert werden, dass Name **und** Vessel-ID aus dem Eintrag von `/vessel-names` übernommen werden. Der Worker ist dafür bereits vorbereitet.

## Rückfall auf 0.14.20

Falls unerwartete Probleme auftreten, genügt es, `cloudflare/worker.js` wieder durch die vorherige Version 0.14.20 zu ersetzen und den Worker erneut zu deployen. Datenstrukturen werden durch 0.14.21 nicht inkompatibel geändert.
