# Worn Renders are produced by us in Blender, not taken from the TF2 wiki

The official TF2 wiki has a worn-on-class image for almost every cosmetic, but its image policy limits those images to the wiki itself, per-class images for all-class items follow three different naming schemes, and its API rate-limits readers into multi-minute bans. We therefore render every Worn Render ourselves: Blender reads the installed game's models and textures through SourceIO and produces one image per Cosmetic, Class, Team and Style, relying on the Steam Subscriber Agreement's non-commercial fan-art permission for publishing derivative imagery.

## Consequences

- The site must stay non-commercial: no ads, no paid features built on the renders.
- Raw extracted models and textures are never published or committed; only rendered images leave the machine.
- Valve's Backpack Icon is the fallback wherever a render is missing or fails, so the catalogue never hides an item for lack of a picture.
- Rendering runs on a local machine with the game installed; it is a batch job, not part of the site build.
