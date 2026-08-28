# FreeStylized local material library

SHADED can build a local, non-redistributed cache of the public FreeStylized PBR material library.

## Why local only

FreeStylized permits use of its public content in commercial and non-commercial projects, but its disclaimer restricts redistribution of unchanged content on other platforms. Therefore **downloaded textures are never committed to SHADED**. `.cache/materials/` is gitignored.

Source: <https://freestylized.com/all-textures/>  
License/disclaimer: <https://freestylized.com/disclaimer/>

## One command

```bash
npm run materials:freestylized
```

This discovers the current FreeStylized texture categories and material pages, records each public 1K/2K/4K download URL, downloads the **1K** set by default, extracts it, detects common PBR channels, and writes local provenance metadata.

Output:

```text
.cache/materials/freestylized/
├─ catalog.json
├─ library-1k.json
└─ 1k/
   └─ <category>/
      └─ <material>/
         ├─ <downloaded texture maps>
         └─ material.json
```

Use another resolution only when needed:

```bash
node tools/freestylized-materials.mjs sync --resolution 2k
node tools/freestylized-materials.mjs sync --resolution 4k
```

The importer is cache-safe: an existing `material.json` marks a material as already synchronized. ZIP archives are deleted after successful extraction unless `--keep-zips` is supplied.

## SHADED boundary

This importer is a **source library**, not automatic semantic material assignment. It does not write `classGrid`, does not infer a material class from a texture, and does not bake world state into the downloaded channels. `material.json` deliberately keeps `assignment: null`.

Detected channel names are currently limited to common filename conventions for albedo/base-color, normal, roughness, metallic, height/displacement, AO, and emissive. The original files remain untouched; channel detection only creates metadata pointers.

## Verification

The normal project check now includes an offline test of HTML discovery, R2 download-link parsing, ZIP extraction, channel detection, and path-traversal rejection:

```bash
node tools/test-freestylized-materials.mjs
```

No network request is performed by that test.
