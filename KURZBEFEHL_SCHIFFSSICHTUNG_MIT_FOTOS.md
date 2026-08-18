# Kurzbefehl „Schiffsichtung mit Foto(s)“ – Fotodaten verwenden

## Ziel

Der Kurzbefehl soll für die Sichtung die Daten des Fotos verwenden, nicht Datum und GPS des späteren Uploads.

## Bestehender Anfang

Der Kurzbefehl enthält bereits sinngemäß:

- `Erstes Objekt von Kurzbefehleingabe abrufen`
- `Ort aus Objekt aus Liste abrufen`
- `Aktuellen Ort abrufen`
- `Breitengrad aus Aktueller Standort abrufen`
- `Längengrad aus Aktueller Standort abrufen`
- `Aktuelles Datum`
- `Datum formatieren`

## Änderung 1 – Foto-GPS statt aktuellem Standort

Die bereits vorhandene Aktion

`Ort aus Objekt aus Liste abrufen`

liefert den im Foto gespeicherten Aufnahmeort.

Die danach verwendeten Koordinaten sollen künftig aus diesem `Ort` stammen.

Die Aktionen

- `Aktuellen Ort abrufen`
- `Breitengrad aus Aktueller Standort abrufen`
- `Längengrad aus Aktueller Standort abrufen`

dürfen für `photo_lat`/`photo_lon` nicht mehr verwendet werden.

Stattdessen:

1. `Breitengrad aus [Ort] abrufen`
2. `Längengrad aus [Ort] abrufen`

Diese beiden Werte bleiben die Variablen, die später im Metadata-JSON als `photo_lat` und `photo_lon` eingesetzt werden.

Wenn das Foto keinen gespeicherten Ort besitzt, sollen die Koordinaten leer bleiben. Nicht auf den aktuellen Standort beim Upload zurückfallen.

## Änderung 2 – Aufnahmedatum des Fotos

Direkt nach `Erstes Objekt von Kurzbefehleingabe abrufen` eine weitere Bilddetail-Aktion einfügen bzw. die bestehende Detail-Aktion duplizieren:

`Aufnahmedatum aus [Objekt aus Liste] abrufen`

Das Ergebnis ist der tatsächliche Aufnahmezeitpunkt des ersten Fotos.

Danach:

- Wenn `Aufnahmedatum` einen Wert hat: diesen Wert als `sighting_captured_at` verwenden.
- Wenn kein Aufnahmedatum vorhanden ist: nach dem tatsächlichen Aufnahmezeitpunkt fragen und das Ergebnis als `sighting_captured_at` verwenden.

Die bisherige Aktion `Aktuelles Datum` darf nicht mehr die Quelle für `captured_at` sein.

Die vorhandene Aktion `Datum formatieren` bleibt erhalten, ihre Eingabe wird aber von `Aktuelles Datum` auf `sighting_captured_at` geändert.

Der formatierte Wert wird weiterhin im Metadata-JSON als `captured_at` verwendet.

## Mehrere Fotos

Für eine Sichtung mit mehreren Fotos verwendet die Sichtung den Aufnahmezeitpunkt des **ersten ausgewählten Fotos**. Die Fotos gehören derselben Sichtung an.

## Metadata-JSON

Die vorhandene Struktur bleibt unverändert. Insbesondere:

```json
{
  "captured_at":"[Formatiertes Datum]",
  "photo_lat":"[Breitengrad aus Foto-Ort]",
  "photo_lon":"[Längengrad aus Foto-Ort]",
  "movement":"[movement]",
  "direction":"[direction]",
  "berth_status":"[berth_status]",
  "berth_id":"[berth_id]",
  "berth_name_entered":"[berth_name_entered]",
  "vessel_name_entered":"[vessel_name_entered]",
  "vessel_id":"[vessel_id]",
  "notes":""
}
```

## Kontrolle nach dem Test

In der erzeugten Submission prüfen:

- `uploaded_at` = Zeitpunkt des Uploads
- `captured_at` = Aufnahmezeitpunkt des Fotos
- `photo_lat` / `photo_lon` = Foto-GPS, nicht aktueller Handy-Standort
- bei bekannter Anlegestelle ohne passende Foto-GPS-Zuordnung: `location.status = "matched"` und `location.matched_by = "berth_id"`
