# iPhone-Kurzbefehl „Foto(s) zu Schiff hinzufügen“

Stand: Danube Vessel Log 0.14.31 · 20.08.2026

## Zweck

Der Kurzbefehl hängt ein oder mehrere Fotos an ein bereits vorhandenes Schiff an, ohne daraus eine neue Sichtung zu erzeugen. Jedes Foto kann einen eigenen Aufnahmezeitpunkt und eigene GPS-Koordinaten besitzen.

## Fotoindividuelle Metadaten

Der Kurzbefehl erzeugt vor der JPEG-Konvertierung für jedes Originalfoto einen Eintrag und sendet diese in derselben Reihenfolge wie die Fotos:

```json
"photo_metadata": [
  {
    "captured_at": "2026-08-20T07:15:00+02:00",
    "photo_lat": "48.3085",
    "photo_lon": "14.2843"
  },
  {
    "captured_at": "2026-08-20T07:23:00+02:00",
    "photo_lat": "48.3068",
    "photo_lon": "14.2834"
  }
]
```

Die gemeinsamen Felder `captured_at`, `photo_lat` und `photo_lon` des ersten Fotos bleiben zusätzlich im Haupt-JSON erhalten. Sie dienen ausschließlich der Rückwärtskompatibilität.

## Verhalten ab Worker 0.14.31

Für jedes Foto wird nun separat gespeichert:

- `captured_at`
- `photo_lat`
- `photo_lon`
- `location` / `area_id` gemäß `data/location_areas.geojson`
- `metadata_version = 1`

Die Position im `photo_metadata`-Array muss exakt der Position des jeweiligen Fotos im Upload entsprechen.

## Fotos ohne GPS

Hat ein Foto keinen Standort, werden beide Koordinaten leer übermittelt:

```json
{
  "captured_at": "2026-08-20T07:23:00+02:00",
  "photo_lat": "",
  "photo_lon": ""
}
```

Der Worker speichert dann für dieses einzelne Foto `Aufnahmeort unbekannt`.

## Test nach Deployment

Am besten zwei Fotos mit unterschiedlichen Aufnahmezeiten und bekannten unterschiedlichen Polygonbereichen auswählen. Auf der Schiffseite müssen anschließend beide Zeiten und beide jeweiligen Aufnahmeorte separat erscheinen.
