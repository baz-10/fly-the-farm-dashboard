# Railway Corridor and KMZ Import Design

## Purpose

Extend mission boundary import so operators can:

1. Import ordinary polygon boundaries from KML, KMZ or shapefile data.
2. Explicitly import railway centreline KML/KMZ data and convert it into a spray corridor polygon with a configurable buffer on each side.

The railway workflow must correctly handle the supplied `railway centre.kml`, which contains WGS84 `LineString` features and no KML `Polygon`.

## User experience

The mission map import area presents two clearly separated actions:

- **Boundary file** — imports polygon KML, polygon KMZ, zipped shapefiles, or shapefile sidecars exactly as the current boundary workflow does.
- **Railway corridor** — imports line-based KML or KMZ only.

Selecting **Railway corridor** opens a small confirmation dialog with:

- Selected filename.
- **Buffer each side (m)** numeric field.
- Default value `3.5`.
- Plain-language result: a value of `3.5` creates a total corridor width of `7 m`.
- **Create corridor boundary** and **Cancel** actions.

The buffer must be greater than zero and no more than 100 metres per side. A successful import replaces the current mission boundary using the same confirmation and preservation rules as other imports. Map annotations and the rest of the mission remain intact.

## Standard boundary import

- `.kml` continues through the existing KML polygon parser.
- `.shp`, `.dbf`, `.prj`, `.cpg` and `.zip` continue through the existing shapefile parser.
- `.kmz` is added as a supported polygon-boundary format.
- KMZ extraction prefers an internal file named `doc.kml`, case-insensitively. If absent, it uses the first `.kml` entry in stable filename order.
- Empty, corrupt, encrypted, oversized, or KML-free KMZ archives produce actionable errors.
- A line-only file selected through **Boundary file** is not automatically buffered. It explains that no polygon was present and directs the operator to **Railway corridor**.

## Railway corridor conversion

- Parse every valid KML `LineString`, including line strings nested inside `MultiGeometry`.
- Ignore altitude values and retain WGS84 longitude/latitude positions.
- Reject line sets with fewer than two valid positions.
- Convert the combined linework to GeoJSON and buffer it by the operator-entered distance using Turf in metres.
- Treat the buffer result’s polygon or multipolygon components as mission boundary polygons.
- Overlapping and adjoining line buffers must be dissolved so overlapping areas are not double-counted.
- Calculate area and boundary metadata through the existing boundary result model.
- Store the original source file against the mission with `fileType: kml` or `fileType: kmz`.
- Record the chosen buffer in the import success message and generated boundary name, for example `Railway corridor - 3.5 m each side`.

## File and archive safeguards

- Maximum selected KML/KMZ file size: 25 MB.
- Maximum extracted KML size: 25 MB.
- Maximum KMZ archive entries inspected: 250.
- Reject path traversal entry names, although extraction remains in memory and never writes archive files to disk.
- Decode KML as UTF-8 and reject invalid XML through the existing XML validation.
- Add `fflate` as a direct project dependency rather than relying on jsPDF’s transitive copy.

## Architecture

- `src/utils/boundaryImport.ts`
  - Retains polygon KML and shapefile functions.
  - Adds line parsing, corridor buffering, and explicit errors for line-only polygon imports.
  - Adds in-memory KMZ extraction and polygon/corridor KMZ entry points.
- `src/components/FieldBoundaryEditor.tsx`
  - Separates the two import actions.
  - Owns the corridor-buffer dialog state and applies either import result through the existing boundary update path.
  - Stores correct `kml`, `kmz`, or `shp` source metadata.
- Existing `BoundaryImportResult` remains the common output contract.

## Error handling

Messages distinguish:

- Invalid KML XML.
- Valid KML with linework but no polygon.
- Valid KML with neither usable lines nor polygons.
- Corrupt or encrypted KMZ.
- KMZ without a KML document.
- Railway mode selected for polygon-only data.
- Invalid corridor buffer.
- Shapefile missing required sidecars or projection.

The generic “No valid WGS84 polygon” message remains appropriate only when polygon coordinates are present but invalid.

## Testing

- Existing KML polygon and shapefile tests remain green.
- A regression fixture based on the supplied railway KML structure proves line extraction and a 3.5 m each-side buffer.
- Tests prove the output has non-zero area, valid polygons, and approximately 7 m total corridor width on a simple line.
- Tests prove overlapping line segments are not double-counted.
- KMZ tests cover `doc.kml`, fallback KML selection, polygon mode, corridor mode, missing KML, corruption and size/entry limits.
- Component tests cover separate actions, default/editable buffer, correct dispatch and actionable errors.
- Full unit suite and production build must pass.

## Out of scope

- Automatically inferring railway mode from filenames or mission names.
- Accepting arbitrary line data as a mission boundary without explicit operator selection.
- Geodesic survey-grade corridor generation; Turf’s WGS84 buffering is suitable for operational planning but does not replace cadastral or engineering survey data.
- Changing stored mission schema or requiring a database migration.
