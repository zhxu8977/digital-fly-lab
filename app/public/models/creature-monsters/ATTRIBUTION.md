# Creature art sources

The game's names, descriptions, palettes, statistics, family catalog and evolution rules are original. No Pokémon models, Nintendo artwork, or Party Animals assets are included.

## Quaternius Ultimate Monsters

- Author: Quaternius
- Official source: https://quaternius.com/packs/ultimatemonsters.html
- Distribution mirror: https://poly.pizza/bundle/Ultimate-Monsters-Bundle-5oyGWAmOB6
- License: CC0 1.0, https://creativecommons.org/publicdomain/zero/1.0/
- Downloaded 2026-10-05, 45 self-contained GLB files from the public GLB bundle. Artist-made skeletal animation clips are preserved. Only selected species are lazily loaded by the application.

## Quaternius Ultimate Animated Animals

- Official source: https://quaternius.com/packs/ultimateanimatedanimals.html
- Distribution mirror: https://poly.pizza/bundle/Animated-Animal-Pack-ILAPXeUYiS
- License: CC0 1.0.
- `../creature-animals/` contains 12 GLB files with skeletal walk, gallop, eating and attack clips. Actual quadruped animations are used for fox/deer species.

## Quaternius Cute Animated Monsters

- Official source: https://quaternius.com/packs/cutemonsters.html
- Author-uploaded download: https://opengameart.org/content/textured-cute-monster-pack
- License: CC0 1.0.
- `../creature-pack/` contains the Bat/Penguin FBX and texture files used by corresponding species. The penguin pack provides an idle clip; the adapter adds a soft lateral waddling motion when moving.

## Portraits and modifications

`../creature-portraits/` contains CC0 model preview images from those distribution bundles. Imported skins are recolored for the game's original elemental families. Evolved families select evolved assets when provided, and final forms add a small mineral crest. Procedural plush species retain their existing joint/ragdoll rigs and receive directly painted coat markings plus distinctive shells, manes and rounded ears. Their generated SVG portraits are original code-native artwork.

## Integration API

`applySpeciesAppearance(mesh, species, { rival })` synchronously styles the existing simulation wrapper. `attachSpeciesAsset(mesh, species, { rival })` lazily attaches imported art, returns `Promise<boolean>`, and retains the wrapper's body type/physics. Render imported art with `mesh.userData.assetAnimator.update(delta, entity, { attacking, hit, knockedDown, reaction })` before the gaze overlay. Call `releaseSpeciesAppearance(mesh)` before disposing a replaced wrapper; it releases independently cloned materials/mixer but keeps cached shared geometry alive. Call `getSpeciesPortrait(species)` for a local WebP or original SVG portrait.
