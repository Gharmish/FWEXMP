#!/usr/bin/env python3
"""Regenerate lib/og/plex-arabic-metrics.ts from the OG-card font subsets.

Satori (next/og) measures Arabic text runs using ISOLATED glyph advances but
draws them SHAPED — init/medi/fina contextual forms AND rlig ligatures, both
narrower — leaving a variable phantom gap on the right of every run box that
wrecked the cards' right alignment. lib/og/satori-arabic `arabicOverhang`
undoes it using the tables this script emits.

Requires fontTools (`pip install fonttools`). Run from the repo root after
changing the TTFs in lib/og/fonts:

    python3 scripts/generate-plex-arabic-metrics.py
"""

from fontTools.ttLib import TTFont

FONTS = {
    "400": ("lib/og/fonts/plex-arabic-regular.ttf", "Regular (weight 400)"),
    "600": ("lib/og/fonts/plex-arabic-semibold.ttf", "SemiBold (weight 600)"),
}

OUT = "lib/og/plex-arabic-metrics.ts"

FORM_IDX = {"init": 1, "medi": 2, "fina": 3}


def build(path):
    font = TTFont(path)
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    gsub = font["GSUB"].table
    lookups = {}
    for record in gsub.FeatureList.FeatureRecord:
        if record.FeatureTag not in FORM_IDX:
            continue
        for index in record.Feature.LookupListIndex:
            for subtable in gsub.LookupList.Lookup[index].SubTable:
                mapping = getattr(subtable, "mapping", None)
                if mapping:
                    lookups.setdefault(record.FeatureTag, {}).update(mapping)

    forms_table = {}
    reverse = {}  # glyph name -> (codepoint, form index)
    codepoints = [cp for cp in cmap if (0x0600 <= cp <= 0x06FF) or cp in (0x20, 0xA0)]
    for cp in sorted(codepoints):
        base = cmap[cp]
        row = [hmtx[base][0], 0, 0, 0]
        reverse.setdefault(base, (cp, 0))
        for tag, idx in FORM_IDX.items():
            glyph = lookups.get(tag, {}).get(base, base)
            row[idx] = hmtx[glyph][0]
            reverse.setdefault(glyph, (cp, idx))
        forms_table[cp] = row

    ligature_table = {}
    for record in gsub.FeatureList.FeatureRecord:
        if record.FeatureTag != "rlig":
            continue
        for index in record.Feature.LookupListIndex:
            for subtable in gsub.LookupList.Lookup[index].SubTable:
                table = getattr(subtable, "ligatures", None)
                if not table:
                    continue
                for first, entries in table.items():
                    for entry in entries:
                        if len(entry.Component) != 1:
                            continue
                        second = entry.Component[0]
                        if first not in reverse or second not in reverse:
                            continue
                        cp1, f1 = reverse[first]
                        cp2, f2 = reverse[second]
                        parts = hmtx[first][0] + hmtx[second][0]
                        savings = parts - hmtx[entry.LigGlyph][0]
                        if savings > 0:
                            ligature_table[(cp1, f1, cp2, f2)] = savings
    return forms_table, ligature_table


def emit_forms(table):
    return "\n".join(
        f"  [0x{cp:04X}, [{f[0]}, {f[1]}, {f[2]}, {f[3]}]]," for cp, f in table.items()
    )


def emit_ligs(table):
    return "\n".join(
        f"  ['{cp1:X}:{f1}|{cp2:X}:{f2}', {savings}],"
        for (cp1, f1, cp2, f2), savings in sorted(table.items())
    )


header = """/**
 * GENERATED — metrics for the Plex Arabic OG-card subsets, used by
 * lib/og/satori-arabic `arabicOverhang` to undo Satori's Arabic measurement
 * bug (it measures runs with ISOLATED advances but draws them SHAPED with
 * init/medi/fina forms AND rlig ligatures, leaving a variable phantom gap on
 * the right of every run box).
 *
 * - `PLEX_ARABIC_*`: per-character advances (font units, UPM 1000) per
 *   contextual form [isolated, initial, medial, final].
 * - `PLEX_LIGATURES_*`: advance saved when the renderer fuses an adjacent
 *   glyph pair into an rlig ligature, keyed "cp:form|cp:form" (hex cp,
 *   form index as above).
 *
 * Regenerate with `python3 scripts/generate-plex-arabic-metrics.py` after
 * changing the TTFs in lib/og/fonts.
 */

export type FormAdvances = readonly [number, number, number, number];
"""

parts = [header]
for weight, (path, label) in FONTS.items():
    forms, ligs = build(path)
    parts.append(
        f"\n/** IBM Plex Sans Arabic {label}. */\n"
        f"export const PLEX_ARABIC_{weight}: ReadonlyMap<number, FormAdvances> = new Map([\n"
        f"{emit_forms(forms)}\n]);\n"
        f"\n/** rlig savings, {label}. */\n"
        f"export const PLEX_LIGATURES_{weight}: ReadonlyMap<string, number> = new Map([\n"
        f"{emit_ligs(ligs)}\n]);\n"
    )

with open(OUT, "w", encoding="utf-8") as handle:
    handle.write("".join(parts))
print(f"wrote {OUT}")
