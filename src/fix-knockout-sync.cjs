/*
 * WRG2026 — Knockout sync + scoring fix
 * --------------------------------------
 * Root cause: the knockout bracket stores `rounds` as an array-of-arrays.
 * Firestore refuses to store nested arrays, so every setDoc that included a
 * generated bracket threw and was swallowed — the bracket lived only in the
 * organiser's browser and never reached Firebase. Viewers saw nothing (refresh
 * didn't help), and the bracket vanished on the organiser's own reload, which
 * is why scoring felt like it disappeared before the final.
 *
 * Fix:
 *   1. Serialise knockoutData to a JSON string before writing to Firestore.
 *   2. Parse it back on read.
 *   3. Show the SCORE button on every ready match (both players present, not a
 *      bye, not yet completed) instead of only status === "pending".
 *
 * The in-memory bracket shape is UNCHANGED, so no bracket/render logic moves.
 *
 * Usage (PowerShell, from the repo root or src folder):
 *   node fix-knockout-sync.cjs
 * or pass an explicit path:
 *   node fix-knockout-sync.cjs "C:\Users\sysco\Documents\GitHub\WRG2026\src\WRG2026-Dashboard.jsx"
 */
const fs = require("fs");
const path = require("path");

const CANDIDATES = [
  process.argv[2],
  "WRG2026-Dashboard.jsx",
  path.join("src", "WRG2026-Dashboard.jsx"),
  path.join("..", "src", "WRG2026-Dashboard.jsx"),
].filter(Boolean);

const target = CANDIDATES.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } });
if (!target) {
  console.error("❌ Could not find WRG2026-Dashboard.jsx.");
  console.error("   Run from the repo/src folder, or pass the full path as an argument.");
  process.exit(1);
}
console.log("→ Target file:", path.resolve(target));

const EDITS = [
  {
    name: "1/3  stringify knockoutData on Firestore write",
    old: '        knockoutData:   stateData.knockoutData   ?? knockoutData,',
    new: '        knockoutData:   JSON.stringify(stateData.knockoutData ?? knockoutData),',
  },
  {
    name: "2/3  parse knockoutData on Firestore read",
    old: '        if(d.knockoutData) setKnockoutData(d.knockoutData);',
    new: [
      '        if(d.knockoutData){',
      '          try{ setKnockoutData(typeof d.knockoutData==="string"?JSON.parse(d.knockoutData):d.knockoutData); }',
      '          catch(err){ console.error("knockoutData parse failed:",err); }',
      '        }',
    ].join("\n"),
  },
  {
    name: "3/3  show SCORE button on every ready match",
    old: '                const canScore=isAdmin&&m.status==="pending"&&m.p1&&m.p2;',
    new: '                const canScore=isAdmin&&m.p1&&m.p2&&m.status!=="completed"&&m.status!=="bye";',
  },
];

let src = fs.readFileSync(target, "utf8");

// Safety pass: every target string must exist exactly once, and not already be patched.
for (const e of EDITS) {
  const already = src.split(e.new).length - 1;
  if (already > 0) {
    console.error(`❌ Edit "${e.name}" looks ALREADY APPLIED. Aborting so nothing is double-patched.`);
    process.exit(1);
  }
  const count = src.split(e.old).length - 1;
  if (count !== 1) {
    console.error(`❌ Edit "${e.name}" — expected to find its target exactly once, found ${count}.`);
    console.error("   File may differ from the reviewed version. Aborting; nothing written.");
    process.exit(1);
  }
}

// Backup, then apply.
const backup = target + ".bak";
fs.writeFileSync(backup, src, "utf8");
for (const e of EDITS) { src = src.replace(e.old, e.new); console.log("   ✓ applied:", e.name); }
fs.writeFileSync(target, src, "utf8");

console.log("\n✅ Done. Backup saved to:", path.resolve(backup));
console.log("\nNext steps:");
console.log("  1. Hard-refresh the live site once after Vercel redeploys (Ctrl+Shift+R).");
console.log("  2. Regenerate the knockout bracket — it now writes to Firebase.");
console.log("  3. Open the shared link on another device: the bracket should appear and update live.");
console.log("  4. Score a round: winner advances AND persists for everyone.");
