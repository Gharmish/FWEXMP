import { MountFade } from '@/components/ui/motion';

/**
 * Decorative Sarawat flourish — the divider between the hero and the category
 * row (no border hairline sits beside it). Four hand-drawn motifs join into
 * one continuous rolling ribbon: the Aseer skyline read as cloud and mist
 * rather than a literal peak profile, which is what the old polyline was.
 *
 * Craft notes:
 * - Organic art must never be stretched, so this drops the old
 *   `preserveAspectRatio="none"`; width drives height off the intrinsic
 *   ratio (~8.5:1) and `max-w-*` caps how heavy the strokes ever read.
 * - `currentColor` keeps it on-palette (BRIEF §3) — the tone lives in the
 *   className, never in the path data.
 * - The middle motif repeats, so it is defined once and `<use>`d twice;
 *   with coordinates rounded to 0.1 units that is ~54% less path data.
 * - `rtl:-scale-x-100` mirrors the gesture so it still flows from the
 *   inline-start edge in Arabic.
 *
 * Motif placement (the source artboard had these four strokes merely sitting
 * next to each other, so every junction stepped: centrelines were 2–6 units
 * apart and the closing motif overlapped its neighbour by 80 units into a
 * visible tangle). Each motif is now chained off the previous one — its start
 * centreline seated on the previous end centreline, with a 20-unit (one
 * stroke width) overlap so the rounded cap is buried inside the next body
 * and the union reads as one unbroken ribbon. Offsets were solved by probing
 * the filled band with `isPointInFill`, not by eye; changing one motif's
 * offset breaks the chain downstream, so re-solve rather than nudge.
 */

/** Repeated centre motif — placed twice, 326.8 units apart. */
const FLOURISH =
  'M 420.3 102.4 C 437.4 88.3 454.1 81.7 473.1 87.9 C 474.4 87 475.7 86 477 85.1 C 505.4 67.6 534.4 91.5 547.4 116.8 C 548.9 119.5 557.5 144.6 565.4 126.6 C 575.6 103.3 553.8 63.5 588.3 45.5 C 614.6 32 635.6 66.9 642.7 87.2 C 647.8 100.9 668.1 183.8 697.7 150.8 C 699.2 149.3 700.6 147.6 701.9 145.5 C 665.6 132.6 645.2 75.7 685 60.7 C 721.6 47 735.8 87.9 729.5 125.1 C 732.5 123.6 735.3 121.5 738.1 119.1 L 746.5 109.5 C 749.9 105.4 755.9 104.6 760.2 107.8 C 764.6 111 765.5 117.2 762.1 121.3 L 751.4 133.5 C 741.7 142.2 732.1 146.5 722.7 148 C 716.9 160.9 707.5 171.4 695.3 175.8 C 643.7 194 632.4 102.4 616.8 77.4 C 599.6 49.3 585.5 66.7 586.8 86 C 588.3 106.3 591.7 144.6 565 151.4 C 533.1 159.6 534.8 117 510 102.8 C 503.9 99.2 498.2 98.4 493.5 99.4 C 539.3 135.8 500.1 198.7 462.2 170.1 C 444.7 156.8 448.1 126.8 459.6 105.6 C 451.3 105.6 442.5 109.1 434.2 116.3 C 430.3 120.2 424.1 120 420.3 116.3 C 416.4 112.3 416.4 106.3 420.3 102.4 Z M 709.2 127.3 C 716.1 99 707.3 65 687.4 81.5 C 675.4 91.3 688.5 121.3 709.2 127.3 Z M 477.9 111.9 C 470.6 124.1 468 141.8 470.1 149.1 C 476.1 169.4 511.5 149.7 486 119.6 C 483.4 116.6 480.8 114 477.9 111.9 Z M 477.9 111.9';
/** Opening (inline-start) motif. */
const OPENING =
  'M 18.1 170.4 C 23.1 168.7 25.8 163.3 24.1 158.3 C 23.2 155.9 24.1 153.6 25 152 C 26.9 148.6 30.5 145.9 34.1 145.1 C 43.6 142.9 53.9 148.7 59.1 152.4 C 63.2 155.2 67 158.3 71 161.7 C 76 165.8 81.1 170.1 86.8 173.7 C 95.3 179.2 104.8 182.9 114.6 185 C 131 188.5 148.5 187.2 164.2 180.9 C 164.9 180.6 165.7 180.3 166.4 179.9 C 167.6 180.8 168.8 181.5 170.1 182.2 C 175.6 185.3 181.8 187.1 187.9 187.5 C 194.6 188 201.2 186.8 206.8 183.9 C 214 180.3 219.8 174.1 223.7 166.1 C 226.9 159.5 228.7 151.7 229.1 143.6 C 229.4 136 228.6 128.6 227.9 121.5 C 227.3 115.8 226.7 110.4 226.7 105 C 226.7 97 228.1 85.6 235 76.9 C 240.6 69.7 249.8 65.8 257.3 67.4 C 257.3 67.4 257.3 67.4 257.3 67.4 C 266.9 69.4 274 79 281.5 89.1 C 290.3 101.1 300.3 114.5 316.7 118 C 317 118.1 317.2 118.1 317.5 118.2 C 322.1 119.1 327 119.1 331.9 118.2 C 336.1 117.4 340.3 116 344.7 113.9 C 352.3 110.3 359.2 105.2 365.6 100.3 C 369.8 97.1 370.5 91.1 367.3 86.9 C 364.1 82.8 358.1 82 354 85.2 C 348.4 89.5 342.5 93.9 336.5 96.7 C 330.7 99.5 325.6 100.4 321 99.5 C 311.4 97.7 304.3 88 296.7 77.8 C 287.9 65.9 277.9 52.4 261.3 48.8 C 261.3 48.8 261.3 48.8 261.2 48.8 C 253.7 47.2 245.7 48 238.1 51.3 C 231 54.3 224.8 59.1 220 65.1 C 209.8 78.2 207.7 94 207.7 105 C 207.6 111.4 208.3 117.5 208.9 123.5 C 209.7 130.2 210.3 136.6 210.1 142.8 C 209.7 151.7 206.4 162.8 198.2 166.9 C 194.5 168.8 189.7 169.1 184.9 167.9 C 188.5 164.5 191.7 160.6 194.3 155.9 C 197.7 149.6 199.5 142.2 199.4 135 C 199.2 127.1 196.8 119.8 192.2 114 C 189.6 110.6 186.2 107.8 182.3 105.7 C 178.5 103.7 174.4 102.5 170.2 102.1 C 162.1 101.3 154.6 103.7 148.9 108.7 C 145.3 111.9 142.6 116 141 120.7 C 139.6 124.7 139.1 129.1 139.3 133.9 C 139.7 141.7 142.4 150.2 146.7 157.8 C 148.2 160.4 149.8 162.9 151.5 165.2 C 133.4 170.6 113 167.9 97.1 157.7 C 92.3 154.7 87.9 151 83.2 147.1 C 79 143.6 74.7 140 69.9 136.7 C 56.2 127.3 42.3 123.7 29.9 126.5 C 21 128.5 12.9 134.5 8.4 142.7 C 4.4 149.7 3.6 157.4 6 164.5 C 7.1 167.7 9.9 170 13 170.7 C 14.7 171 16.4 170.9 18.1 170.4 Z M 177.2 125.6 C 181.4 130.9 181.5 139.6 177.6 146.7 C 175.4 150.8 172.3 154 168.9 156.6 C 166.9 154.2 165 151.4 163.3 148.3 C 160.4 143.3 158.6 137.7 158.4 132.9 C 158.1 128.4 159.2 125 161.6 122.9 C 163.8 120.9 166.8 120.9 168.4 121 C 168.9 121.1 169.5 121.2 170 121.3 C 172.9 121.9 175.6 123.5 177.2 125.6 Z M 177.2 125.6';
/** Closing (inline-end) motif. */
const CLOSING =
  'M 1372.2 166.3 C 1367 165.1 1363.9 159.9 1365.1 154.8 C 1365.7 152.4 1364.6 150.1 1363.6 148.6 C 1361.4 145.4 1357.6 143 1353.9 142.6 C 1344.3 141.3 1334.6 148 1329.7 152.2 C 1325.9 155.3 1322.4 158.8 1318.7 162.5 C 1314.1 167.1 1309.4 171.8 1304 176 C 1296.1 182.1 1287 186.8 1277.5 189.7 C 1261.4 194.7 1243.8 195 1227.6 190.1 C 1226.9 189.9 1226.2 189.7 1225.4 189.4 C 1224.3 190.4 1223.1 191.2 1221.9 192 C 1216.7 195.6 1210.7 198 1204.7 199 C 1198 200.1 1191.3 199.4 1185.5 197.1 C 1178 194.1 1171.7 188.5 1167.1 180.8 C 1163.3 174.6 1160.7 167 1159.6 159 C 1158.6 151.4 1158.7 144 1158.8 136.9 C 1158.9 131.1 1159 125.7 1158.5 120.4 C 1157.8 112.4 1155.3 101.2 1147.6 93.1 C 1141.4 86.4 1131.9 83.4 1124.5 85.7 C 1124.5 85.7 1124.5 85.7 1124.5 85.7 C 1115.2 88.6 1109 98.8 1102.5 109.5 C 1094.8 122.2 1086.1 136.6 1070 141.5 C 1069.8 141.6 1069.5 141.7 1069.3 141.8 C 1064.7 143.1 1059.9 143.5 1054.9 143.1 C 1050.7 142.7 1046.4 141.7 1041.8 140 C 1033.9 137.1 1026.5 132.7 1019.7 128.3 C 1015.3 125.5 1014 119.6 1016.8 115.2 C 1019.6 110.8 1025.5 109.5 1029.9 112.3 C 1035.8 116.1 1042.2 119.9 1048.3 122.1 C 1054.4 124.3 1059.5 124.8 1064 123.5 C 1073.4 120.8 1079.6 110.5 1086.2 99.7 C 1093.9 87 1102.7 72.6 1118.8 67.5 C 1118.9 67.5 1118.9 67.5 1118.9 67.5 C 1126.3 65.2 1134.3 65.3 1142.2 67.9 C 1149.5 70.2 1156.2 74.4 1161.5 80 C 1172.8 92 1176.4 107.6 1177.4 118.6 C 1178 124.9 1177.9 131.1 1177.8 137.1 C 1177.7 143.9 1177.6 150.3 1178.5 156.4 C 1179.7 165.3 1184 176 1192.5 179.4 C 1196.4 180.9 1201.2 180.8 1205.8 179.1 C 1202 176.1 1198.4 172.4 1195.4 168 C 1191.4 162 1188.9 154.8 1188.4 147.7 C 1187.9 139.8 1189.6 132.3 1193.6 126.1 C 1195.9 122.5 1199.1 119.4 1202.8 116.9 C 1206.3 114.7 1210.4 113 1214.5 112.3 C 1222.5 110.8 1230.2 112.4 1236.2 116.9 C 1240.2 119.8 1243.2 123.5 1245.2 128.1 C 1247 132 1247.9 136.3 1248.1 141.1 C 1248.4 148.9 1246.6 157.6 1242.9 165.6 C 1241.7 168.3 1240.3 170.9 1238.9 173.4 C 1257.4 177.1 1277.4 172.6 1292.4 160.9 C 1296.8 157.5 1300.9 153.4 1305.2 149.1 C 1309.1 145.2 1313.1 141.2 1317.5 137.6 C 1330.3 126.9 1343.8 122.1 1356.4 123.7 C 1365.5 124.9 1374 130.2 1379.3 137.9 C 1383.9 144.5 1385.4 152.1 1383.7 159.3 C 1382.9 162.7 1380.3 165.2 1377.2 166.2 C 1375.6 166.6 1373.9 166.7 1372.2 166.3 Z M 1209.6 136.3 C 1206 142 1206.6 150.7 1211.2 157.4 C 1213.7 161.2 1217.1 164.1 1220.7 166.4 C 1222.5 163.8 1224.1 160.9 1225.6 157.7 C 1228 152.4 1229.3 146.6 1229.1 141.8 C 1228.9 137.3 1227.5 134.1 1225 132.2 C 1222.6 130.4 1219.5 130.7 1217.9 131 C 1217.4 131.1 1216.9 131.2 1216.5 131.3 C 1213.6 132.2 1211.1 134 1209.6 136.3 Z M 1209.6 136.3';

export function HeroRidgeline() {
  return (
    <MountFade delay={0.35}>
      <svg
        viewBox="0 -8 1368 163"
        aria-hidden
        // Opacity rides the element, not the fill: the motifs overlap by one
        // stroke width at each join, and a translucent *fill* would
        // double-composite there into visible dark seams. Fading the whole
        // layer keeps the ribbon one even tone.
        //
        // al-qatt-red is the palette's red (BRIEF §3) and the apt one here:
        // Al-Qatt Al-Aseeri is itself red decorative line work. 65% reads as
        // warm terracotta — unmistakably red, but short of the full-strength
        // brick that turned the divider into a focal point competing with the
        // headline and the category tiles below.
        //
        // Full-bleed to 1600px, centred beyond it. Height is driven entirely
        // by width at the artwork's 8.4:1 ratio, so an uncapped ribbon grows
        // to a ~305px band on a 2560px display; the cap also holds the stroke
        // weight the tone was tuned against, and still bleeds edge to edge on
        // every phone, tablet, and laptop.
        className="text-al-qatt-red mx-auto h-auto w-full max-w-[1600px] opacity-65 rtl:-scale-x-100"
      >
        <defs>
          <path id="gharmish-flourish" d={FLOURISH} />
        </defs>
        {/* Chained left to right: each offset seats this motif's start
            centreline on the previous motif's end centreline. Solved, not
            eyeballed — see the header note before editing any of them. */}
        <g fill="currentColor">
          <path d={OPENING} transform="translate(-4.7,-34.5)" />
          <g fillRule="evenodd">
            <use href="#gharmish-flourish" transform="translate(-72.8,-49.6)" />
            <use href="#gharmish-flourish" transform="translate(254,-41.1)" />
          </g>
          <path d={CLOSING} transform="translate(-17.1,-44.8)" />
        </g>
      </svg>
    </MountFade>
  );
}
