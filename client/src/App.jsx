import { useState, useMemo, useRef, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { auth, db, provider } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

import {
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Moon,
  Sun,
  Sparkles,
  Swords,
  Shield,
  Target,
  Trash2,
  Film,
  Image as ImageIcon,
  Music,
  Link as LinkIcon,
  Flame,
  Gauge,
  Wind,
  GitBranch,
  Layers,
  Crosshair,
  Upload,
  Tv,
  Clock,
  ChevronsUpDown,
  Star,
  User2,
  Camera,
  Skull,
  Search,
  Menu,
  Loader,
} from "lucide-react";

/* ===========================================================================
 * Constants
 * ======================================================================== */

const VARIANT_TAGS = [
  "Special Variant",
  "Ground Variant",
  "Air Variant",
  "Crouch Variant",
  "Enemy conditioned (if enemy is wall slamed, downslamed, uptlitled or spinning)",
];
 
const ENEMY_CONDITIONS = ["Wall Slammed", "Downslammed", "Uptilted", "Spinning"];

/* Status Affliction — also carries elemental identity now. Element was
 * removed as a separate field; these five are the shipping set. */
const STATUSES = [
  "None",
  "Bleed",
  "Fire",
  "Poison",
  "Freeze",
  "Electricity",
];

/* Move type definitions — each type has its own classification + spec schema
 * and default keyframe markers (Roblox KeyframeReached events).             */

/* Move-type system — two-level.
 *
 *   Primary type: one of Attack, Defense, Special.
 *   Subtype:      refines behaviour within a primary type.
 *
 *     Attack   → Physical, Projectile, Special
 *     Defense  → Evasive, Defense, Buff, Enemy Nerf
 *     Special  → SubMode, Awakening, Transformation, Buff, Utility, Other
 *
 * Spec field "kinds":
 *   "text"   — single text input (the default; no kind field needed).
 *   "stun"   — composite: { duration, priority }.
 *   "endlag" — composite: { success, fail }.
 *   "hitbox" — toggleable:
 *                mode="Size"   → { x, y, z, offsetX, offsetY, offsetZ }
 *                mode="Radius" → { radius }
 *
 *   (Custom variable interactions live outside the spec array — see
 *   VariableInteractionsSection. Resource Cost is intentionally absent.)
 */

const MOVE_TYPES = {
  Attack: {
    icon: Swords,
    blurb: "Deals damage through a hitbox — melee, projectile, or special.",
    subtypes: ["Physical", "Projectile", "Special"],
    classification: [
      { key: "status", label: "Status Affliction", options: STATUSES },
      {
        key: "hitProperty",
        label: "Hit Property",
        options: ["High", "Mid", "Low", "Overhead", "Unblockable"],
      },
      {
        key: "stunType",
        label: "Stun Type",
        options: ["Normal", "Spin", "Wall", "Downslam", "Uptilt"],
      },
      {
        key: "blockable",
        label: "Blockable?",
        options: ["Yes", "No", "Only with parry"],
      },
      {
        key: "cutscene",
        label: "Cutscene Style",
        options: ["None", "Grab", "Cinematic"],
      },
    ],
    spec: [
      { key: "damage", label: "Damage", placeholder: "12" },
      { key: "knockback", label: "Knockback Force", placeholder: "30" },
      { key: "cooldown", label: "Cooldown (s)", placeholder: "0.5" },
      { key: "windup", label: "Windup (s)", placeholder: "0.20" },
      { key: "endlag", label: "Endlag", kind: "endlag" },
      { key: "stun", label: "Stun", kind: "stun" },
      { key: "hitbox", label: "Hitbox", kind: "hitbox" },
    ],
    /* Per-subtype spec fields. Appended to the base spec inside the Spec
     * Sheet — gives each subtype its own "personality" without forcing a
     * full schema split.                                                   */
    subtypeSpec: {
      Physical: [
        { key: "reach", label: "Reach (studs)", placeholder: "5" },
        {
          key: "hitCount",
          label: "Hit Count",
          kind: "picker",
          options: ["Single", "2 hits", "3 hits", "4+ hits"],
        },
        { key: "pushback", label: "Pushback (studs)", placeholder: "3" },
      ],
      Projectile: [
        {
          key: "trajectory",
          label: "Trajectory",
          kind: "picker",
          options: ["Linear", "Bezier", "Double Bezier", "Homing"],
        },
        {
          key: "aimMode",
          label: "Aim Mode",
          kind: "picker",
          options: ["Cursor Aim", "Character Aim", "Auto Aim", "Locked Forward"],
        },
        { key: "projectileCount", label: "Projectile Count", placeholder: "1" },
        { key: "projectileSpeed", label: "Projectile Speed (studs/s)", placeholder: "120" },
        { key: "projectileLifetime", label: "Lifetime (s)", placeholder: "2.0" },
        { key: "aoeRadius", label: "AOE Radius (studs)", placeholder: "0" },
        {
          key: "pierce",
          label: "Pierce",
          kind: "picker",
          options: ["No", "1 target", "Unlimited"],
        },
      ],
      Special: [
        { key: "chargeTime", label: "Charge Time (s)", placeholder: "0.50" },
        {
          key: "multiStage",
          label: "Multi-Stage",
          kind: "picker",
          options: ["Single", "2 stages", "3+ stages"],
        },
        { key: "aoeRadius", label: "AOE Radius (studs)", placeholder: "0" },
      ],
    },
    defaultMarkers: [
      { name: "WindupEnd", time: "0.20", track: "player" },
      { name: "HitboxStart", time: "0.30", track: "player" },
      { name: "HitboxEnd", time: "0.50", track: "player" },
      { name: "RecoveryEnd", time: "1.20", track: "player" },
    ],
  },
  Defense: {
    icon: Shield,
    blurb: "Evasion, block, counter, debuff — protective or disruptive tools.",
    subtypes: ["Evasive", "Defense", "Buff", "Enemy Nerf"],
    classification: [
      { key: "status", label: "Status Applied", options: STATUSES },
      {
        key: "target",
        label: "Target",
        options: ["Self", "Allies", "Enemies", "AoE around self"],
      },
      {
        key: "trigger",
        label: "Trigger",
        options: ["Manual", "On block", "On hit", "On low HP", "Always on"],
      },
      {
        key: "iframes",
        label: "I-frames",
        options: ["None", "Partial", "Full"],
      },
    ],
    spec: [
      { key: "cooldown", label: "Cooldown (s)", placeholder: "4" },
      { key: "duration", label: "Duration (s)", placeholder: "2" },
      { key: "distance", label: "Distance (studs)", placeholder: "20" },
      { key: "speed", label: "Speed (studs/s)", placeholder: "80" },
      { key: "iframeWindow", label: "I-frame Window (s)", placeholder: "0.30" },
      { key: "effect", label: "Effect Magnitude", placeholder: "+25% defense" },
      { key: "endlag", label: "Endlag", kind: "endlag" },
      { key: "stun", label: "Stun on Target", kind: "stun" },
    ],
    subtypeSpec: {
      Evasive: [
        {
          key: "direction",
          label: "Direction",
          kind: "picker",
          options: ["Forward", "Backward", "Lateral", "Free 8-way", "Toward Cursor"],
        },
        { key: "iframeStart", label: "I-Frame Start (s)", placeholder: "0.0" },
        { key: "cancelWindow", label: "Cancel Window (s)", placeholder: "0.20" },
      ],
      Defense: [
        {
          key: "blockType",
          label: "Block Type",
          kind: "picker",
          options: ["Block", "Parry", "Reflect", "Absorb"],
        },
        {
          key: "coverage",
          label: "Coverage",
          kind: "picker",
          options: ["High Only", "Mid Only", "Low Only", "All"],
        },
        { key: "damageReduction", label: "Damage Reduction", placeholder: "50%" },
        { key: "parryWindow", label: "Parry Window (s)", placeholder: "0.10" },
      ],
      Buff: [
        {
          key: "stat",
          label: "Stat Affected",
          kind: "picker",
          options: ["Damage", "Defense", "Speed", "Cooldown", "Custom"],
        },
        { key: "magnitude", label: "Magnitude", placeholder: "+25%" },
        { key: "stacks", label: "Max Stacks", placeholder: "1" },
      ],
      "Enemy Nerf": [
        {
          key: "stat",
          label: "Stat Affected",
          kind: "picker",
          options: ["Damage", "Defense", "Speed", "Healing", "Custom"],
        },
        { key: "magnitude", label: "Magnitude", placeholder: "-25%" },
        { key: "range", label: "Range (studs)", placeholder: "30" },
        {
          key: "targets",
          label: "Targets",
          kind: "picker",
          options: ["Single", "Frontline", "AoE around target", "All in range"],
        },
      ],
    },
    defaultMarkers: [
      { name: "StartUp", time: "0.10", track: "player" },
      { name: "EffectStart", time: "0.15", track: "player" },
      { name: "EffectEnd", time: "0.50", track: "player" },
      { name: "RecoveryEnd", time: "0.70", track: "player" },
    ],
  },
  Special: {
    icon: Sparkles,
    blurb: "Signature ability — sub-modes, awakenings, transformations.",
    subtypes: ["SubMode", "Awakening", "Transformation", "Buff", "Utility", "Other"],
    classification: [
      { key: "status", label: "Status Applied", options: STATUSES },
      {
        key: "category",
        label: "Category",
        options: ["Offensive", "Defensive", "Setup", "Mobility", "Utility"],
      },
      {
        key: "interruptible",
        label: "Interruptible?",
        options: ["No", "Yes — by attack", "Yes — by parry"],
      },
      {
        key: "stackable",
        label: "Stackable?",
        options: ["No", "Refresh duration", "Yes — N stacks"],
      },
    ],
    spec: [
      { key: "cooldown", label: "Cooldown (s)", placeholder: "8" },
      { key: "duration", label: "Duration (s)", placeholder: "10" },
      { key: "effectDuration", label: "Effect Duration (s)", placeholder: "3" },
      { key: "effect", label: "Effect Magnitude", placeholder: "+25% damage" },
      { key: "damage", label: "Damage (optional)", placeholder: "—" },
      { key: "stun", label: "Stun (optional)", kind: "stun" },
    ],
    subtypeSpec: {
      SubMode: [
        {
          key: "enterCondition",
          label: "Enter Condition",
          kind: "picker",
          options: [
            "Manual",
            "On meter full",
            "On HP threshold",
            "On stack threshold",
          ],
        },
        {
          key: "exitCondition",
          label: "Exit Condition",
          kind: "picker",
          options: [
            "Timer",
            "Manual cancel",
            "On hit",
            "On block",
            "On meter empty",
          ],
        },
        { key: "replacesMoves", label: "Replaces Moves", placeholder: "M1, M2, M3" },
        { key: "meterCost", label: "Meter Cost", placeholder: "0" },
      ],
      Awakening: [
        { key: "meterCost", label: "Meter Cost", placeholder: "100" },
        { key: "threshold", label: "Threshold", placeholder: "Below 30% HP" },
        { key: "maxDuration", label: "Max Duration (s)", placeholder: "20" },
        {
          key: "replacesMoveset",
          label: "Moveset Behavior",
          kind: "picker",
          options: [
            "Replaces all moves",
            "Adds submoves only",
            "No change — buff only",
          ],
        },
      ],
      Transformation: [
        { key: "meterCost", label: "Meter Cost", placeholder: "100" },
        {
          key: "replacesMesh",
          label: "Replaces Mesh?",
          kind: "picker",
          options: ["Yes", "No"],
        },
        {
          key: "replacesMoveset",
          label: "Moveset Behavior",
          kind: "picker",
          options: [
            "Replaces all moves",
            "Adds submoves only",
            "No change — buff only",
          ],
        },
      ],
      Buff: [
        {
          key: "stat",
          label: "Stat Affected",
          kind: "picker",
          options: ["Damage", "Defense", "Speed", "Cooldown", "Custom"],
        },
        { key: "magnitude", label: "Magnitude", placeholder: "+25%" },
        { key: "stacks", label: "Max Stacks", placeholder: "1" },
      ],
      Utility: [
        {
          key: "utilityKind",
          label: "Utility Kind",
          kind: "picker",
          options: [
            "Mobility",
            "Traversal",
            "Healing",
            "Resource Gen",
            "Setup",
            "Misc",
          ],
        },
        { key: "chargeUses", label: "Charges", placeholder: "1" },
        { key: "range", label: "Range (studs)", placeholder: "20" },
      ],
      Other: [],
    },
    defaultMarkers: [
      { name: "EffectStart", time: "0.30", track: "player" },
      { name: "EffectEnd", time: "1.00", track: "player" },
      { name: "RecoveryEnd", time: "1.40", track: "player" },
    ],
  },
};

/* Icon hint per subtype — used in the tree + editor for visual flavor. */
const SUBTYPE_ICON = {
  Physical: Swords,
  Projectile: Target,
  Special: Sparkles,
  Evasive: Wind,
  Defense: Shield,
  Buff: Star,
  "Enemy Nerf": Skull,
  SubMode: Flame,
  Awakening: Flame,
  Transformation: Flame,
  Utility: Gauge,
  Other: Sparkles,
};

const MOVE_TYPE_KEYS = Object.keys(MOVE_TYPES);

/* Icon for a variant — prefer the subtype icon, fall back to primary. */
const iconForVariant = (v) =>
  (v?.subtype && SUBTYPE_ICON[v.subtype]) ||
  MOVE_TYPES[v?.type || "Attack"].icon;

/* Determine which marker tracks should be visible for a given variant.
 * Any variant flagged as a cinematic interaction (classification.cutscene
 * === "Cinematic") gets enemy + camera tracks so you can author the grab /
 * throw / finisher like a cutscene.                                         */
const tracksFor = (variant) => {
  if (variant.classification?.cutscene === "Cinematic") {
    return ["player", "enemy", "camera"];
  }
  if (variant.classification?.cutscene === "Grab") {
    return ["player", "enemy"];
  }
  return ["player"];
};

const TRACK_META = {
  player: { label: "Player Animation", Icon: User2 },
  enemy: { label: "Enemy Reaction", Icon: Skull },
  camera: { label: "Camera Cutscene", Icon: Camera },
};

/* Default move slots — utility/awakening flagged for special handling */
const DEFAULT_SLOTS = [
  { key: "move1", label: "Move 1", removable: false },
  { key: "move2", label: "Move 2", removable: false },
  { key: "move3", label: "Move 3", removable: false },
  { key: "move4", label: "Move 4", removable: false },
  { key: "utility", label: "Utility", removable: true },
  { key: "awakening", label: "Awakening / Ultimate", removable: false, isFinisher: true },
];

/* ===========================================================================
 * Helpers
 * ======================================================================== */

let _counter = 0;
const newId = () =>
  `id_${Date.now().toString(36)}_${(++_counter).toString(36)}`;

const seedMarkersForType = (type) =>
  MOVE_TYPES[type].defaultMarkers.map((m) => ({
    ...m,
    id: newId(),
    description: "",
  }));

const makeVariant = (tag = "Ground", type = "Attack", subtype = null) => {
  const primary = MOVE_TYPES[type] ? type : "Attack";
  const sub =
    subtype && MOVE_TYPES[primary].subtypes.includes(subtype)
      ? subtype
      : MOVE_TYPES[primary].subtypes[0];
  return {
    id: newId(),
    tag,
    type: primary,
    subtype: sub,
    classification: {},
    spec: {},
    /* Map of passive-variable-id → { effect, note }. Populated from the
     * Variable Interactions editor once the owning character defines
     * passive variables.                                                   */
    variableInteractions: {},
    /* Cross-references to other variants / moves / passives on the same
     * character. Each entry: { id, kind: "variant"|"move"|"passive",
     * targetId, subTargetId (optional for variant inside move), note }.   */
    references: [],
    /* Only used when subtype === "Awakening" — a nested sub-moveset the
     * character can execute while awakened. Each entry is shaped like a
     * top-level move (name, description, variants).                       */
    submoves: [],
    markers: seedMarkersForType(primary),
    media: [],
    flavor: "",
    combo: "",
    scaling: "",
    conditions: [],
  };
};

const makeMove = (type = "Attack", subtype = null) => ({
  name: "",
  description: "",
  variants: [makeVariant("Ground", type, subtype)],
});

const makeFinisher = (kind = "Awakening") => ({
  ...makeMove("Special", "Awakening"),
  finisherKind: kind,
});

/* Passive abilities — persistent effects / state tables. Each passive can
 * declare variables that any move variant can then "bind to" via the
 * Variable Interactions editor in its Spec Sheet.                         */
const makePassive = (overrides = {}) => ({
  id: newId(),
  name: "",
  description: "",
  variables: [],
  references: [],
  ...overrides,
});

const makePassiveVariable = (overrides = {}) => ({
  id: newId(),
  name: "",
  kind: "number",
  initial: "",
  description: "",
  ...overrides,
});

const makeCharacter = (overrides = {}) => ({
  id: newId(),
  name: "New Character",
  anime: "Untitled Anime",
  gimmick: "",
  enabledSlots: ["move1", "move2", "move3", "move4", "utility", "awakening"],
  moves: {
    move1: makeMove("Attack", "Physical"),
    move2: makeMove("Attack", "Physical"),
    move3: makeMove("Attack", "Projectile"),
    move4: makeMove("Special", "SubMode"),
    utility: makeMove("Defense", "Evasive"),
    awakening: makeFinisher("Awakening"),
  },
  passives: [],
  ...overrides,
});

const seed = () => {
  const yumi = makeCharacter({
    name: "Yumi Kuronagi",
    anime: "Spectral Blade Chronicles",
    gimmick:
      "Spirit Meter (0–100): builds 8 on hit, 4 on block. At 100, Yumi enters Azure Bloom — every special gains a follow-up and the Awakening unlocks. Spending 50% Spirit enables Phantom Step (i-frame dash-cancel) out of any grounded special on hit.",
  });
  // Spirit Meter passive with a variable we can reference from variants
  const spiritPassive = makePassive({
    name: "Spirit Meter",
    description:
      "0–100 resource. Builds 8 on hit, 4 on block. Enables Phantom Step and unlocks the Azure Bloom awakening when full.",
    variables: [
      makePassiveVariable({
        name: "Spirit",
        kind: "number",
        initial: "0",
        description: "Current spirit charge (0–100).",
      }),
      makePassiveVariable({
        name: "AzureBloom",
        kind: "boolean",
        initial: "false",
        description: "True while the awakening buff is active.",
      }),
    ],
  });
  yumi.passives = [spiritPassive];
  yumi.moves.move1.name = "Crescent Slash";
  yumi.moves.move1.description = "A quick horizontal slash that opens combo strings.";
  const yv = yumi.moves.move1.variants[0];
  yv.classification = {
    status: "None",
    hitProperty: "Mid",
    stunType: "Normal",
    cutscene: "None",
  };
  yv.spec = {
    damage: "12",
    knockback: "20",
    cooldown: "0.5",
    windup: "0.20",
    endlag: { success: "0.0", fail: "0.35" },
    stun: { duration: "0.65", priority: "1" },
    hitbox: {
      mode: "Size",
      x: "5",
      y: "6",
      z: "6",
      offsetX: "0",
      offsetY: "0",
      offsetZ: "-3.5",
    },
  };
  // Wire up an example variable interaction: Crescent Slash builds Spirit on hit.
  yv.variableInteractions = {
    [spiritPassive.variables[0].id]: {
      effect: "+8 on hit, +4 on block",
      note: "Standard gauge build for a basic string opener.",
    },
  };
  yv.flavor =
    "Single flickering arc of moonlight. Camera whip-pans to a low side profile on impact. SFX: sharp steel-ring layered with a wind-cutting whoosh. VFX: cyan crescent trail dissolving into sakura petals.";
  yv.combo = "Cancels into: Move 2, Move 3, any Dash. Links into itself once.";
  yv.scaling = "First hitter: 100%. Each subsequent hit: −10%. Floors at 30%.";
  yumi.moves.move2.name = "Moonlit Thrust";
  yumi.moves.move2.description = "Forward lunge with i-frames mid-animation.";
  yumi.moves.move3.name = "Void Cutter";
  yumi.moves.move3.description = "Chargeable crescent projectile.";
  yumi.moves.move3.variants[0] = makeVariant("Ground", "Attack", "Projectile");
  yumi.moves.move4.name = "Eclipse Rush";
  yumi.moves.move4.description = "Command grab cloaked in shadow.";
  // Cinematic grab: use Attack/Special with cutscene=Cinematic to unlock
  // the enemy + camera marker tracks.
  yumi.moves.move4.variants[0] = makeVariant("Ground", "Attack", "Special");
  yumi.moves.move4.variants[0].classification = {
    status: "None",
    hitProperty: "Unblockable",
    stunType: "Downslam",
    blockable: "No",
    cutscene: "Cinematic",
  };
  yumi.moves.utility.name = "Phantom Veil";
  yumi.moves.utility.description = "Teleport forward leaving a decoy.";
  yumi.moves.awakening.name = "Samsara · Final Moon";
  yumi.moves.awakening.description = "Cinematic finisher across three astral planes.";
  yumi.moves.awakening.finisherKind = "Ultimate";
  // Awakening subtype already seeded by makeFinisher — add a sample submove
  const awakeningVariant = yumi.moves.awakening.variants[0];
  awakeningVariant.submoves = [
    {
      id: newId(),
      name: "Lunar Rend",
      description: "Azure-Bloom-only follow-up: a cross-cut that arcs twice.",
      variants: [makeVariant("Ground", "Attack", "Special")],
    },
  ];

  const asahi = makeCharacter({
    name: "Asahi Tenma",
    anime: "Bonfire Country",
    gimmick:
      "Heat Stacks (0–5): each connected projectile adds a stack. At 3, projectiles ignite. At 5, gains a one-time free Awakening cast.",
  });
  // Heat Stacks passive — demonstrates variables feeding variant interactions.
  const heatPassive = makePassive({
    name: "Heat Stacks",
    description:
      "Accumulates on connected projectiles. Thresholds modify subsequent specials.",
    variables: [
      makePassiveVariable({
        name: "HeatStacks",
        kind: "number",
        initial: "0",
        description: "0–5 stacks. Resets on whiff or death.",
      }),
    ],
  });
  asahi.passives = [heatPassive];
  asahi.moves.move1.name = "Ember Jab";
  asahi.moves.move2.name = "Cinder Wave";
  asahi.moves.move2.variants[0] = makeVariant("Ground", "Attack", "Projectile");
  asahi.moves.move3.name = "Solar Flare";
  asahi.moves.move4.name = "Kindle Counter";
  asahi.moves.move4.variants[0] = makeVariant("Ground", "Defense", "Defense");
  asahi.enabledSlots = asahi.enabledSlots.filter((s) => s !== "utility");
  asahi.moves.awakening.name = "Phoenix Bloom";
  asahi.moves.awakening.finisherKind = "Awakening";

  return [yumi, asahi];
};

/* ===========================================================================
 * Luau export — serialize a character into a Roblox Studio module script
 * with local Cooldowns / Damages / Endlag / Stuns tables and an Info table
 * that references them. Mirrors the style used in hand-written movesets.
 * ======================================================================== */

const LUA_RESERVED = new Set([
  "and", "break", "do", "else", "elseif", "end", "false", "for",
  "function", "goto", "if", "in", "local", "nil", "not", "or",
  "repeat", "return", "then", "true", "until", "while",
]);

const luaIdent = (raw) => {
  if (!raw) return "Unnamed";
  const parts = String(raw)
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "Unnamed";
  const pascal = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
  return /^[0-9]/.test(pascal) ? `_${pascal}` : pascal;
};

const luaString = (s) =>
  `"${String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, "\\n")}"`;

const luaKey = (raw) => {
  const s = String(raw ?? "");
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s) && !LUA_RESERVED.has(s)) return s;
  return `[${luaString(s)}]`;
};

const luaNum = (v, fallback = 0) => {
  if (v == null || v === "") return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const hasStunData = (s) => s && typeof s === "object" && (s.duration || s.priority);
const hasEndlagData = (e) => e && typeof e === "object" && (e.success || e.fail);
const hasHitboxData = (h) => {
  if (!h || typeof h !== "object") return false;
  if (h.mode === "Radius") return !!h.radius;
  return !!(h.x || h.y || h.z || h.offsetX || h.offsetY || h.offsetZ);
};

/* Map classification field keys to the PascalCase names we emit in Luau.  */
const CLASSIFICATION_EMIT = {
  status: "Status",
  hitProperty: "HitProperty",
  stunType: "StunType",
  blockable: "Blockable",
  cutscene: "Cutscene",
  target: "Target",
  iframes: "IFrames",
  trigger: "Trigger",
  category: "Category",
  interruptible: "Interruptible",
  stackable: "Stackable",
};

/* Map spec field keys to PascalCase names we emit in Luau. Covers both the
 * base spec and the subtype-specific spec, so adding a new field to
 * MOVE_TYPES.subtypeSpec is enough to make it round-trip into the export. */
const SPEC_EMIT_NAME = {
  // Base spec scalars (not routed through local tables)
  knockback: "Knockback",
  windup: "Windup",
  speed: "Speed",
  lifetime: "Lifetime",
  range: "Range",
  distance: "Distance",
  iframeWindow: "IFrameWindow",
  duration: "Duration",
  effectDuration: "EffectDuration",
  effect: "EffectMagnitude",
  // Attack subtypes
  reach: "Reach",
  hitCount: "HitCount",
  pushback: "Pushback",
  trajectory: "Trajectory",
  aimMode: "AimMode",
  projectileCount: "ProjectileCount",
  projectileSpeed: "ProjectileSpeed",
  projectileLifetime: "ProjectileLifetime",
  aoeRadius: "AoeRadius",
  pierce: "Pierce",
  chargeTime: "ChargeTime",
  multiStage: "MultiStage",
  // Defense subtypes
  direction: "Direction",
  iframeStart: "IFrameStart",
  cancelWindow: "CancelWindow",
  blockType: "BlockType",
  coverage: "Coverage",
  damageReduction: "DamageReduction",
  parryWindow: "ParryWindow",
  stat: "StatAffected",
  magnitude: "Magnitude",
  stacks: "MaxStacks",
  targets: "Targets",
  // Special subtypes
  enterCondition: "EnterCondition",
  exitCondition: "ExitCondition",
  replacesMoves: "ReplacesMoves",
  meterCost: "MeterCost",
  threshold: "Threshold",
  maxDuration: "MaxDuration",
  replacesMoveset: "MovesetBehavior",
  replacesMesh: "ReplacesMesh",
  utilityKind: "UtilityKind",
  chargeUses: "Charges",
};

/* Keys that are handled by special code paths above and must not be re-
 * emitted by the generic spec walker. (Composite editors + local-table
 * scalars + the hitbox structure.)                                         */
const SPEC_HANDLED_KEYS = new Set([
  "damage", "reactionDamage", "cooldown",
  "stun", "endlag", "hitbox",
]);

const characterToLuau = (character) => {
  const slotMoves = DEFAULT_SLOTS.filter((s) =>
    character.enabledSlots.includes(s.key)
  ).map((s) => ({ slot: s, move: character.moves[s.key] }));

  const cooldowns = [];
  const damages = [];
  const endlags = [];
  const stuns = [];

  // Build a lookup map to resolve cross-references to human-readable labels.
  const variantLabels = new Map(); // variant.id -> "Move name · Tag"
  const moveLabels = new Map(); // slot.key -> "Slot: Move name"
  for (const { slot, move } of slotMoves) {
    moveLabels.set(slot.key, `${slot.label}: ${move.name || "Unnamed"}`);
    for (const v of move.variants) {
      variantLabels.set(
        v.id,
        `${move.name || slot.label} · ${v.tag} (${v.type}${v.subtype ? "/" + v.subtype : ""})`
      );
    }
  }
  const passiveLabels = new Map();
  for (const p of character.passives || []) {
    passiveLabels.set(p.id, p.name || "Unnamed Passive");
  }
  const passiveVarLookup = new Map(); // varId -> { passive, variable }
  for (const p of character.passives || []) {
    for (const v of p.variables) passiveVarLookup.set(v.id, { passive: p, variable: v });
  }

  // First pass: collect flat entries into the local tables (top-level only;
  // sub-moveset variants go inline).
  for (const { slot, move } of slotMoves) {
    const moveKey = luaIdent(move.name || slot.label);
    for (const v of move.variants) {
      const varKey = luaIdent(v.tag);
      const full = `${moveKey}_${varKey}`;
      const sp = v.spec || {};
      if (sp.cooldown) cooldowns.push([full, luaNum(sp.cooldown)]);
      if (sp.damage) damages.push([full, luaNum(sp.damage)]);
      if (sp.reactionDamage) damages.push([full, luaNum(sp.reactionDamage)]);
      if (hasStunData(sp.stun))
        stuns.push([
          full,
          { duration: luaNum(sp.stun.duration), priority: luaNum(sp.stun.priority, 1) },
        ]);
      if (hasEndlagData(sp.endlag))
        endlags.push([
          full,
          { success: luaNum(sp.endlag.success), fail: luaNum(sp.endlag.fail) },
        ]);
    }
  }

  const lines = [];
  const push = (s = "") => lines.push(s);
  const indent = (n) => "\t".repeat(n);
  const subtypeFieldFor = (primary) =>
    primary === "Defense"
      ? "DefenseType"
      : primary === "Special"
      ? "SpecialType"
      : "AttackType";

  /* Emit a single variant body (everything inside the variant table). The
   * `fullKey` is the local-table key (e.g. CrescentSlash_Ground) and `d`
   * is the indentation depth in tabs. Used both for top-level variants
   * (which reference local tables) and for inline submove variants
   * (which inline their numbers).                                          */
  const emitVariantBody = (v, fullKey, d, opts = {}) => {
    const sp = v.spec || {};
    const useLocals = !!fullKey && !opts.inline;
    const I = indent(d);

    // Type fields
    push(`${I}MoveType = ${luaString(v.type || "Attack")},`);
    if (v.subtype) {
      push(`${I}${subtypeFieldFor(v.type || "Attack")} = ${luaString(v.subtype)},`);
    }

    // Classification — fields filtered by current MOVE_TYPES schema
    const classFields = MOVE_TYPES[v.type || "Attack"]?.classification || [];
    for (const field of classFields) {
      const emitName = CLASSIFICATION_EMIT[field.key];
      if (!emitName) continue;
      const val = v.classification?.[field.key];
      if (val && val !== "None") {
        push(`${I}${emitName} = ${luaString(val)},`);
      }
    }

    // References to local tables (top-level only — submoves go inline)
    if (useLocals) {
      if (sp.damage) push(`${I}Damage = Damages.${fullKey},`);
      if (sp.reactionDamage) push(`${I}ReactionDamage = Damages.${fullKey},`);
      if (hasStunData(sp.stun)) push(`${I}Stun = Stuns.${fullKey},`);
      if (sp.cooldown) push(`${I}Cooldown = Cooldowns.${fullKey},`);
      if (hasEndlagData(sp.endlag)) push(`${I}Endlag = Endlag.${fullKey},`);
    } else {
      // Submoves: inline scalar values directly so the parent variant is
      // self-contained (no local-table indirection at nested scope).
      if (sp.damage) push(`${I}Damage = ${luaNum(sp.damage)},`);
      if (sp.reactionDamage) push(`${I}ReactionDamage = ${luaNum(sp.reactionDamage)},`);
      if (sp.cooldown) push(`${I}Cooldown = ${luaNum(sp.cooldown)},`);
      if (hasStunData(sp.stun)) {
        push(`${I}Stun = { Duration = ${luaNum(sp.stun.duration)}, Priority = ${luaNum(sp.stun.priority, 1)} },`);
      }
      if (hasEndlagData(sp.endlag)) {
        push(`${I}Endlag = { Success = ${luaNum(sp.endlag.success)}, Fail = ${luaNum(sp.endlag.fail)} },`);
      }
    }

    // Inline numeric / string spec fields — walk both the base spec and
    // the active subtype-specific spec so any new MOVE_TYPES field round-
    // trips into the export. Pickers always emit as strings; everything
    // else tries number first and falls back to a string.
    {
      const def = MOVE_TYPES[v.type || "Attack"];
      const sub = v.subtype || def.subtypes[0];
      const allFields = [
        ...(def.spec || []),
        ...((def.subtypeSpec && def.subtypeSpec[sub]) || []),
      ];
      const seen = new Set();
      for (const field of allFields) {
        if (seen.has(field.key)) continue;
        seen.add(field.key);
        if (SPEC_HANDLED_KEYS.has(field.key)) continue;
        const emitName = SPEC_EMIT_NAME[field.key];
        if (!emitName) continue;
        const val = sp[field.key];
        if (val == null || val === "") continue;
        if (field.kind === "picker") {
          push(`${I}${emitName} = ${luaString(val)},`);
        } else {
          const n = parseFloat(val);
          if (Number.isFinite(n) && /^-?\d*\.?\d+%?$/.test(String(val).trim()) && !String(val).trim().endsWith("%")) {
            push(`${I}${emitName} = ${n},`);
          } else {
            push(`${I}${emitName} = ${luaString(val)},`);
          }
        }
      }
    }

    // Hitbox
    if (hasHitboxData(sp.hitbox)) {
      const h = sp.hitbox;
      push(`${I}Hitbox = {`);
      if (h.mode === "Radius") {
        push(`${I}\tRadius = ${luaNum(h.radius)},`);
      } else {
        push(
          `${I}\tSize = Vector3.new(${luaNum(h.x)}, ${luaNum(h.y)}, ${luaNum(h.z)}),`
        );
        if (h.offsetX || h.offsetY || h.offsetZ) {
          push(
            `${I}\tOffset = CFrame.new(${luaNum(h.offsetX)}, ${luaNum(h.offsetY)}, ${luaNum(h.offsetZ)}),`
          );
        }
      }
      push(`${I}},`);
    }

    // Variable interactions (bindings to passive variables)
    const vi = v.variableInteractions || {};
    const viIds = Object.keys(vi).filter((id) => passiveVarLookup.has(id));
    if (viIds.length) {
      push(`${I}VariableInteractions = {`);
      for (const id of viIds) {
        const { passive, variable } = passiveVarLookup.get(id);
        const binding = vi[id] || {};
        push(`${I}\t{`);
        push(`${I}\t\tPassive = ${luaString(passive.name || "Unnamed Passive")},`);
        push(`${I}\t\tVariable = ${luaString(variable.name || "unnamed")},`);
        if (binding.effect) push(`${I}\t\tEffect = ${luaString(binding.effect)},`);
        if (binding.note) push(`${I}\t\tNote = ${luaString(binding.note)},`);
        push(`${I}\t},`);
      }
      push(`${I}},`);
    }

    // References (cross-links to other variants/moves/passives)
    if (v.references && v.references.length) {
      push(`${I}References = {`);
      for (const r of v.references) {
        push(`${I}\t{`);
        push(`${I}\t\tKind = ${luaString(r.kind || "variant")},`);
        const fresh =
          r.kind === "passive"
            ? passiveLabels.get(r.targetId)
            : r.kind === "move"
            ? moveLabels.get(r.targetId)
            : variantLabels.get(r.targetId);
        push(`${I}\t\tTarget = ${luaString(fresh || r.label || "(orphaned)")},`);
        if (r.note) push(`${I}\t\tNote = ${luaString(r.note)},`);
        push(`${I}\t},`);
      }
      push(`${I}},`);
    }

    // Markers
    if (v.markers && v.markers.length) {
      push(`${I}Markers = {`);
      for (const m of v.markers) {
        push(
          `${I}\t{ Name = ${luaString(m.name)}, Time = ${luaNum(m.time)}, Track = ${luaString(m.track || "player")} },`
        );
      }
      push(`${I}},`);
    }

    // Submoves (only meaningful for Awakening, but we just emit if present)
    if (v.submoves && v.submoves.length) {
      push(`${I}Submoves = {`);
      for (const sm of v.submoves) {
        const smKey = luaKey(sm.name || "Submove");
        push(`${I}\t${smKey} = {`);
        if (sm.description) {
          push(`${I}\t\tDescription = ${luaString(sm.description)},`);
        }
        push(`${I}\t\tVariants = {`);
        for (const sv of sm.variants) {
          const svKey = luaIdent(sv.tag);
          push(`${I}\t\t\t${svKey} = {`);
          emitVariantBody(sv, null, d + 4, { inline: true });
          push(`${I}\t\t\t},`);
        }
        push(`${I}\t\t},`);
        push(`${I}\t},`);
      }
      push(`${I}},`);
    }

    // Flavor / combo / scaling (free-form strings — useful for dev notes)
    if (v.flavor) push(`${I}Flavor = ${luaString(v.flavor)},`);
    if (v.combo) push(`${I}Combo = ${luaString(v.combo)},`);
    if (v.scaling) push(`${I}Scaling = ${luaString(v.scaling)},`);
  };

  push(`-- ============================================================`);
  push(`-- ${character.name || "Character"} — Moveset Module`);
  if (character.anime) push(`-- Source: ${character.anime}`);
  push(`-- Generated by the Anime Moveset Wiki (Roblox Studio format)`);
  push(`-- ============================================================`);
  push();
  push(`-- ============================================================`);
  push(`-- LOCAL DATA TABLES (organized by concern, easy to scan/balance)`);
  push(`-- ============================================================`);
  push();

  push(`local Cooldowns = {`);
  if (cooldowns.length === 0) push(`\t-- (none)`);
  for (const [k, v] of cooldowns) push(`\t${k} = ${v},`);
  push(`}`);
  push();

  push(`local Damages = {`);
  if (damages.length === 0) push(`\t-- (none)`);
  for (const [k, v] of damages) push(`\t${k} = ${v},`);
  push(`}`);
  push();

  push(`local Endlag = {`);
  if (endlags.length === 0) push(`\t-- (none)`);
  for (const [k, v] of endlags)
    push(`\t${k} = { Success = ${v.success}, Fail = ${v.fail} },`);
  push(`}`);
  push();

  push(`local Stuns = {`);
  if (stuns.length === 0) push(`\t-- (none)`);
  for (const [k, v] of stuns)
    push(`\t${k} = { Duration = ${v.duration}, Priority = ${v.priority} },`);
  push(`}`);
  push();

  // Mechanics (passives) live in their own local table. Each passive has
  // its own variables dictionary so gameplay code can read/write them.
  const passives = character.passives || [];
  push(`local Mechanics = {`);
  if (passives.length === 0) push(`\t-- (none)`);
  for (const p of passives) {
    const pKey = luaKey(p.name || "Passive");
    push(`\t${pKey} = {`);
    push(`\t\tName = ${luaString(p.name || "Unnamed Passive")},`);
    if (p.description) push(`\t\tDescription = ${luaString(p.description)},`);
    push(`\t\tVariables = {`);
    for (const pv of p.variables) {
      const vKey = luaKey(pv.name || "var");
      const initialBlock =
        pv.kind === "boolean"
          ? `${(pv.initial || "").toLowerCase() === "true" ? "true" : "false"}`
          : pv.kind === "number"
          ? `${luaNum(pv.initial)}`
          : luaString(pv.initial || "");
      push(`\t\t\t${vKey} = {`);
      push(`\t\t\t\tKind = ${luaString(pv.kind || "number")},`);
      push(`\t\t\t\tInitial = ${initialBlock},`);
      if (pv.description) push(`\t\t\t\tDescription = ${luaString(pv.description)},`);
      push(`\t\t\t},`);
    }
    push(`\t\t},`);
    if (p.references && p.references.length) {
      push(`\t\tReferences = {`);
      for (const r of p.references) {
        const fresh =
          r.kind === "passive"
            ? passiveLabels.get(r.targetId)
            : r.kind === "move"
            ? moveLabels.get(r.targetId)
            : variantLabels.get(r.targetId);
        push(`\t\t\t{`);
        push(`\t\t\t\tKind = ${luaString(r.kind || "variant")},`);
        push(`\t\t\t\tTarget = ${luaString(fresh || r.label || "(orphaned)")},`);
        if (r.note) push(`\t\t\t\tNote = ${luaString(r.note)},`);
        push(`\t\t\t},`);
      }
      push(`\t\t},`);
    }
    push(`\t},`);
  }
  push(`}`);
  push();

  push(`-- ============================================================`);
  push(`-- INFO MODULE (Moveset with all variants at equal scope)`);
  push(`-- ============================================================`);
  push();
  push(`local Info = {`);
  push(`\tName = ${luaString(character.name || "Character")},`);
  if (character.anime) push(`\tSource = ${luaString(character.anime)},`);
  push();
  push(`\t-- Expose local tables on Info for external access`);
  push(`\tCooldowns = Cooldowns,`);
  push(`\tDamages = Damages,`);
  push(`\tEndlag = Endlag,`);
  push(`\tStuns = Stuns,`);
  push(`\tMechanics = Mechanics,`);
  push();
  push(`\tMoveset = {`);

  for (const { slot, move } of slotMoves) {
    const moveKey = luaIdent(move.name || slot.label);
    const displayKey = luaKey(move.name || slot.label);

    push(`\t\t${displayKey} = {`);
    const primaryType = move.variants[0]?.type || "Attack";
    const primarySub = move.variants[0]?.subtype;
    push(`\t\t\tMoveType = ${luaString(primaryType)},`);
    if (primarySub) {
      push(`\t\t\t${subtypeFieldFor(primaryType)} = ${luaString(primarySub)},`);
    }
    if (move.description) push(`\t\t\tDescription = ${luaString(move.description)},`);
    if (slot.isFinisher) push(`\t\t\tFinisherKind = ${luaString(move.finisherKind || "Awakening")},`);
    push(`\t\t\tSlot = ${luaString(slot.label)},`);
    push(`\t\t\tVariants = {`);

    for (const v of move.variants) {
      const varKey = luaIdent(v.tag);
      const full = `${moveKey}_${varKey}`;
      push(`\t\t\t\t${varKey} = {`);
      emitVariantBody(v, full, 5);
      push(`\t\t\t\t},`);
    }

    push(`\t\t\t},`);
    push(`\t\t},`);
    push();
  }

  push(`\t},`);
  if (character.gimmick) {
    push();
    push(`\tGimmick = ${luaString(character.gimmick)},`);
  }
  push(`}`);
  push();
  push(`return Info`);
  push();

  return lines.join("\n");
};

/* ===========================================================================
 * Theme — neutral base + customizable accent color.
 * The accent-dependent classes (accent, accentBg, accentRing, chipActive,
 * danger, confirm) resolve to custom CSS classes whose rules use the
 * `--accent` CSS variable injected at the App root. This lets the user
 * recolor every red accent in the UI from a color picker.
 * ======================================================================== */

const ACCENT_PRESETS = [
  "#ef4444", // red (default)
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
];

const DEFAULT_ACCENT = "#ef4444";

const makeTheme = (dark) =>
  dark
    ? {
        page: "bg-neutral-950 text-neutral-100",
        sidebar: "bg-neutral-950 border-neutral-800",
        surface: "bg-neutral-900",
        surfaceAlt: "bg-neutral-900/60",
        card: "bg-neutral-900 border-neutral-800",
        soft: "bg-neutral-900/50",
        border: "border-neutral-800",
        subBorder: "border-neutral-800/70",
        text: "text-neutral-100",
        sub: "text-neutral-400",
        faint: "text-neutral-500",
        inputBg: "bg-neutral-900",
        hover: "hover:bg-neutral-800/70",
        chipIdle: "bg-neutral-900 border-neutral-800 text-neutral-400",
        chipActive: "accent-chip-active",
        accent: "accent-text",
        accentBg: "accent-bg",
        accentRing: "accent-ring",
        divider: "bg-neutral-800",
        danger: "accent-danger",
        animeTag: "text-neutral-300 bg-neutral-800 border-neutral-700",
        confirm: "accent-confirm",
      }
    : {
        page: "bg-white text-neutral-900",
        sidebar: "bg-neutral-50 border-neutral-200",
        surface: "bg-white",
        surfaceAlt: "bg-neutral-50",
        card: "bg-white border-neutral-200",
        soft: "bg-neutral-50",
        border: "border-neutral-200",
        subBorder: "border-neutral-200/80",
        text: "text-neutral-900",
        sub: "text-neutral-500",
        faint: "text-neutral-400",
        inputBg: "bg-white",
        hover: "hover:bg-neutral-100",
        chipIdle: "bg-white border-neutral-200 text-neutral-600",
        chipActive: "accent-chip-active",
        accent: "accent-text",
        accentBg: "accent-bg",
        accentRing: "accent-ring",
        divider: "bg-neutral-200",
        danger: "accent-danger",
        animeTag: "text-neutral-700 bg-neutral-100 border-neutral-300",
        confirm: "accent-confirm",
      };

/* Stylesheet for accent classes — injected once at App root. Uses
 * color-mix() so tinted fills adjust automatically to any hex value. */
const ACCENT_CSS = `
.accent-text { color: var(--accent, ${DEFAULT_ACCENT}); }
.accent-bg { background-color: color-mix(in srgb, var(--accent, ${DEFAULT_ACCENT}) 10%, transparent); }
.accent-ring { box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent, ${DEFAULT_ACCENT}) 30%, transparent); }
.accent-chip-active {
  background-color: color-mix(in srgb, var(--accent, ${DEFAULT_ACCENT}) 15%, transparent);
  border-color: color-mix(in srgb, var(--accent, ${DEFAULT_ACCENT}) 40%, transparent);
  color: var(--accent, ${DEFAULT_ACCENT});
}
.accent-danger { color: var(--accent, ${DEFAULT_ACCENT}); }
.accent-danger:hover { background-color: color-mix(in srgb, var(--accent, ${DEFAULT_ACCENT}) 10%, transparent); }
.accent-confirm {
  background-color: color-mix(in srgb, var(--accent, ${DEFAULT_ACCENT}) 20%, transparent);
  color: var(--accent, ${DEFAULT_ACCENT});
  border-color: color-mix(in srgb, var(--accent, ${DEFAULT_ACCENT}) 40%, transparent);
}
.accent-border { border-color: color-mix(in srgb, var(--accent, ${DEFAULT_ACCENT}) 50%, transparent); }
.accent-bg-strong { background-color: var(--accent, ${DEFAULT_ACCENT}); }
`;

/* ===========================================================================
 * Primitives
 * ======================================================================== */

const Field = ({ value, onChange, placeholder, t, className = "" }) => (
  <input
    value={value ?? ""}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className={`w-full bg-transparent outline-none rounded px-2 py-1 transition-colors ${t.hover} placeholder:${t.faint} ${className}`}
  />
);

const Area = ({ value, onChange, placeholder, rows = 3, t, className = "" }) => (
  <textarea
    value={value ?? ""}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    rows={rows}
    className={`w-full bg-transparent outline-none rounded px-2 py-1 transition-colors resize-y leading-relaxed ${t.hover} placeholder:${t.faint} ${className}`}
  />
);

const Picker = ({ value, onChange, options, t, className = "" }) => (
  <select
    value={value ?? options[0]}
    onChange={(e) => onChange(e.target.value)}
    className={`bg-transparent outline-none rounded px-2 py-1 border ${t.border} ${t.inputBg} ${className}`}
  >
    {options.map((o) => (
      <option key={o} value={o} className={t.inputBg}>
        {o}
      </option>
    ))}
  </select>
);

const Toggle = ({ title, icon: Icon, defaultOpen = true, t, children, meta, action }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      className={`border ${t.border} rounded-lg ${t.surface} overflow-hidden transition-colors`}
    >
      <div
        className={`flex items-center gap-2 px-3 py-2 ${
          open ? "" : t.surfaceAlt
        } ${t.hover}`}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2.5 flex-1 text-left min-w-0"
        >
          <ChevronRight
            size={14}
            className={`${t.sub} shrink-0 transition-transform duration-150 ${
              open ? "rotate-90" : ""
            }`}
          />
          {Icon && (
            <Icon
              size={14}
              className={`shrink-0 transition-colors ${
                open ? t.accent : t.sub
              }`}
            />
          )}
          <span className="font-medium text-[13px] tracking-tight truncate">
            {title}
          </span>
          {meta && (
            <span className={`text-[11px] ${t.faint} truncate`}>· {meta}</span>
          )}
        </button>
        {action}
      </div>
      {open && (
        <div className={`px-4 pb-4 pt-3 border-t ${t.subBorder}`}>{children}</div>
      )}
    </section>
  );
};

/* SectionGroup — a small typographic divider that labels a cluster of
 * related Toggle sections. Used inside the variant editor to give the long
 * scroll some structure without forcing collapsible nesting.            */
const SectionGroup = ({ label, t }) => (
  <div
    className={`flex items-center gap-3 pt-3 pb-1 px-1 select-none ${t.faint}`}
  >
    <span className="text-[10px] uppercase tracking-[0.18em] font-medium">
      {label}
    </span>
    <span className={`flex-1 h-px ${t.divider}`} />
  </div>
);

const IconBtn = ({ children, onClick, t, title, className = "", danger = false }) => (
  <button
    onClick={onClick}
    title={title}
    className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
      danger ? t.danger : `${t.sub} ${t.hover}`
    } ${className}`}
  >
    {children}
  </button>
);

/* Two-click delete — replaces window.confirm() (which is blocked in
 * sandboxed iframes, the reason the previous delete buttons were silent). */
const ConfirmDelete = ({ onConfirm, t, title = "Delete", icon: Icon = Trash2, size = 12, className = "" }) => {
  const [armed, setArmed] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const arm = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setArmed(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setArmed(false), 2500);
  };

  const fire = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setArmed(false);
    onConfirm();
  };

  if (armed) {
    return (
      <button
        onClick={fire}
        title="Click again to confirm"
        className={`text-[10px] px-1.5 py-0.5 rounded border ${t.confirm} font-medium ${className}`}
      >
        Confirm?
      </button>
    );
  }

  return (
    <button
      onClick={arm}
      title={title}
      className={`p-1 rounded transition-colors ${t.danger} ${className}`}
    >
      <Icon size={size} />
    </button>
  );
};

/* ===========================================================================
 * Media — supports YouTube/Streamable embeds, direct video/image/audio
 * URLs, and local file uploads (via blob URLs).
 * ======================================================================== */

const youtubeId = (url) => {
  const m = url?.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/
  );
  return m ? m[1] : null;
};

const streamableId = (url) => {
  const m = url?.match(/streamable\.com\/(?:e\/)?([a-z0-9]+)/i);
  return m ? m[1] : null;
};

const detectMediaType = (urlOrName, mime) => {
  if (mime) {
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("audio/")) return "audio";
  }
  const url = urlOrName || "";
  if (youtubeId(url) || streamableId(url)) return "video";
  if (/\.(mp4|webm|mov|m4v|ogv)(\?|$)/i.test(url)) return "video";
  if (/\.(gif|png|jpg|jpeg|webp|svg|bmp)(\?|$)/i.test(url)) return "image";
  if (/\.(mp3|wav|ogg|m4a|flac|aac)(\?|$)/i.test(url)) return "audio";
  return "link";
};

const MEDIA_TYPE_META = {
  video: { Icon: Film, label: "Video" },
  image: { Icon: ImageIcon, label: "Image" },
  audio: { Icon: Music, label: "Audio" },
  link: { Icon: LinkIcon, label: "Link" },
};

const MediaItem = ({ item, t, onRemove, onRelabel }) => {
  const [imageError, setImageError] = useState(false);
  const [proxyAttempted, setProxyAttempted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  let displayUrl = item.url;
  if (item.source === "file") {
    try {
      displayUrl = convertFileSrc(item.url);
    } catch (err) {
      displayUrl = item.url;
    }
  } else if (proxyAttempted) {
    displayUrl = `https://corsproxy.io/?${encodeURIComponent(item.url)}`;
  }
  
  const yt = youtubeId(item.url);
  const sm = streamableId(item.url);
  const Meta = MEDIA_TYPE_META[item.kind] || MEDIA_TYPE_META.link;

  if (item.kind === "audio") {
    return (
      <div className={`rounded-lg border ${t.border} ${t.surface} p-3`}>
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-8 h-8 rounded ${t.accentBg} ${t.accent} flex items-center justify-center`}>
            <Music size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <input
              value={item.label || ""}
              onChange={(e) => onRelabel(e.target.value)}
              placeholder="Audio label / SFX name"
              className={`w-full bg-transparent outline-none text-sm placeholder:${t.faint}`}
            />
            <div className={`text-[10px] uppercase tracking-wider ${t.faint}`}>
              {item.source === "file" ? "File" : "Link"} · Audio
            </div>
          </div>
          <ConfirmDelete onConfirm={onRemove} t={t} title="Remove" />
        </div>
        <audio src={displayUrl} controls className="w-full" />
      </div>
    );
  }

  const renderPreview = () => {
    if (item.kind === "video") {
      if (yt)
        return (
          <iframe
            src={`https://www.youtube.com/embed/${yt}`}
            className="w-full h-full"
            title="YouTube preview"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        );
      if (sm)
        return (
          <iframe
            src={`https://streamable.com/e/${sm}`}
            className="w-full h-full"
            title="Streamable preview"
            allowFullScreen
          />
        );
      return (
        <video
          src={displayUrl}
          controls
          playsInline
          className="w-full h-full bg-black"
          referrerPolicy="no-referrer"
        />
      );
    }
    if (item.kind === "image") {
      if (imageError) {
        return (
          <div className="w-full h-full flex flex-col items-center justify-center text-neutral-400 gap-2 p-3 bg-neutral-900/50">
            <ImageIcon size={20} className="opacity-50" />
            <span className="text-xs text-center text-red-400/80">Image Not Found</span>
            <a href={displayUrl} target="_blank" rel="noreferrer" className="text-[10px] underline break-all text-center opacity-50">
              {item.url}
            </a>
          </div>
        );
      }
      return (
        <div className="w-full h-full overflow-hidden flex items-center justify-center bg-black/40 relative">
          {isLoading && !imageError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
              <Loader className="animate-spin text-neutral-400" size={24} />
            </div>
          )}
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <img
            src={displayUrl}
            className={`max-w-full max-h-full object-contain ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
            referrerPolicy="no-referrer"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              if (!proxyAttempted && item.source === "link") {
                setProxyAttempted(true);
                setIsLoading(true);
              } else {
                console.error("Failed to load image:", displayUrl);
                setImageError(true);
                setIsLoading(false);
              }
            }}
          />
        </div>
      );
    }
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-neutral-400 gap-2 p-3">
        <LinkIcon size={20} />
        <a
          href={displayUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs underline break-all text-center"
        >
          {item.url}
        </a>
      </div>
    );
  };

  return (
    <div className={`rounded-lg border ${t.border} overflow-hidden ${t.surface} group`}>
      <div className="relative aspect-video bg-black/80">{renderPreview()}</div>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <Meta.Icon size={13} className={t.faint} />
        <span className={`text-[10px] uppercase tracking-wider ${t.faint} whitespace-nowrap`}>
          {item.source === "file" ? "File" : "Link"} · {Meta.label}
        </span>
        <input
          value={item.label || ""}
          onChange={(e) => onRelabel(e.target.value)}
          placeholder="Label / notes"
          className={`flex-1 bg-transparent outline-none text-xs ${t.sub} placeholder:${t.faint}`}
        />
        <ConfirmDelete onConfirm={onRemove} t={t} title="Remove" />
      </div>
    </div>
  );
};

const MediaGallery = ({ variant, updateVariant, t }) => {
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("all");
  const fileRef = useRef(null);

  const addUrl = () => {
    if (!draft.trim()) return;
    let url = draft.trim();

    // Auto-fix Reddit Media links (extract the 'url=' parameter)
    if (url.includes("reddit.com/media?url=")) {
      try {
        const urlParam = new URL(url).searchParams.get("url");
        if (urlParam) url = decodeURIComponent(urlParam);
      } catch (err) {
        // Ignore if not parseable
      }
    }

    // Auto-fix Tenor "view" links to point to the raw GIF
    if (url.includes("tenor.com/view/") && !url.endsWith(".gif")) {
      url = url.split("?")[0] + ".gif";
    }

    const kind = detectMediaType(url);
    updateVariant({
      ...variant,
      media: [
        ...variant.media,
        { id: newId(), kind, url, source: "link", label: "" },
      ],
    });
    setDraft("");
  };

  const handleFiles = async (files) => {
    if (!files?.length) return;

    // Filter out files that are too large (1MB limit for Firestore)
    const validFiles = Array.from(files).filter(file => {
      if (file.size > 1000000) {
        window.alert(`File "${file.name}" is too large for cloud sync (Max 1MB).`);
        return false;
      }
      return true;
    });

    if (!validFiles.length) return;

    const results = await Promise.allSettled(
      validFiles.map(async (file) => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        let localPath = "";
        try {
          // If running in Tauri, save to local disk
          localPath = await invoke("save_media", {
            fileName: file.name,
            data: btoa(binary),
          });
        } catch (err) {
          // Fallback for web browser: use base64 data URL
          const mime = file.type || "application/octet-stream";
          localPath = `data:${mime};base64,${btoa(binary)}`;
        }
        return {
          id: newId(),
          kind: detectMediaType(file.name, file.type),
          url: localPath,
          source: "file",
          label: file.name,
          mime: file.type,
        };
      })
    );
    const items = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value);
    if (!items.length) return;
    updateVariant({
      ...variant,
      media: [...variant.media, ...items],
    });
  };

  const removeItem = (id) => {
    updateVariant({
      ...variant,
      media: variant.media.filter((m) => m.id !== id),
    });
  };

  const filtered =
    filter === "all"
      ? variant.media
      : variant.media.filter((m) => m.kind === filter);

  const counts = variant.media.reduce(
    (acc, m) => ({ ...acc, [m.kind]: (acc[m.kind] || 0) + 1 }),
    {}
  );

  const FilterBtn = ({ k, label }) => (
    <button
      onClick={() => setFilter(k)}
      className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
        filter === k ? t.chipActive : t.chipIdle
      }`}
    >
      {label}
      {k !== "all" && counts[k] != null && (
        <span className={`ml-1 ${t.faint}`}>{counts[k]}</span>
      )}
    </button>
  );

  return (
    <Toggle
      title="Media Gallery"
      icon={Film}
      defaultOpen={variant.media.length > 0}
      meta={`${variant.media.length} item${variant.media.length === 1 ? "" : "s"}`}
      t={t}
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <FilterBtn k="all" label={`All · ${variant.media.length}`} />
        <FilterBtn k="video" label="Videos" />
        <FilterBtn k="image" label="Images / GIFs" />
        <FilterBtn k="audio" label="Audio" />
        <FilterBtn k="link" label="Links" />
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addUrl()}
          placeholder="Paste URL — YouTube, Streamable, or direct video/image/audio link"
          className={`flex-1 min-w-[260px] text-sm rounded-md border ${t.border} ${t.inputBg} px-3 py-2 outline-none`}
        />
        <button
          onClick={addUrl}
          className={`text-sm px-3 py-2 rounded-md border ${t.border} ${t.hover} inline-flex items-center gap-1`}
        >
          <LinkIcon size={14} /> Add link
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className={`text-sm px-3 py-2 rounded-md border ${t.border} ${t.hover} inline-flex items-center gap-1`}
        >
          <Upload size={14} /> Upload file
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="video/*,image/*,audio/*"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <div
          className={`rounded-lg border border-dashed ${t.border} ${t.soft} py-10 flex flex-col items-center justify-center gap-2 ${t.faint}`}
        >
          <ImageIcon size={20} />
          <div className="text-xs">
            {variant.media.length === 0
              ? "No references yet — paste a URL or upload videos / GIFs / sound files."
              : "Nothing matches that filter."}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((m) => (
            <MediaItem
              key={m.id}
              item={m}
              t={t}
              onRemove={() => removeItem(m.id)}
              onRelabel={(label) =>
                updateVariant({
                  ...variant,
                  media: variant.media.map((x) =>
                    x.id === m.id ? { ...x, label } : x
                  ),
                })
              }
            />
          ))}
        </div>
      )}
    </Toggle>
  );
};


/* ===========================================================================
 * Type-driven Classification + Spec
 * ======================================================================== */

const TypePicker = ({ variant, updateVariant, t }) => {
  const def = MOVE_TYPES[variant.type];
  const PrimaryIcon = def.icon;
  const SubIcon = SUBTYPE_ICON[variant.subtype] || PrimaryIcon;

  const changePrimary = (newType) => {
    if (newType === variant.type) return;
    const newDef = MOVE_TYPES[newType];
    const newSub = newDef.subtypes[0];
    const usingDefaults = variant.markers.every((m) =>
      MOVE_TYPES[variant.type].defaultMarkers.some(
        (d) => d.name === m.name && d.time === m.time && d.track === m.track
      )
    );
    updateVariant({
      ...variant,
      type: newType,
      subtype: newSub,
      // Wipe classification — schema fields change wholesale between primaries
      classification: {},
      markers: usingDefaults ? seedMarkersForType(newType) : variant.markers,
    });
  };

  const changeSubtype = (newSub) => {
    updateVariant({ ...variant, subtype: newSub });
  };

  return (
    <div className={`rounded-xl border ${t.border} ${t.surface} p-4 ${t.accentRing}`}>
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${t.accentBg} ${t.accent}`}
        >
          <PrimaryIcon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-[11px] uppercase tracking-wider ${t.faint}`}>
            Move Type · sets the rest of this card's structure
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <select
              value={variant.type}
              onChange={(e) => changePrimary(e.target.value)}
              className={`text-lg font-semibold bg-transparent outline-none ${t.text}`}
            >
              {MOVE_TYPE_KEYS.map((k) => (
                <option key={k} value={k} className={t.inputBg}>
                  {k}
                </option>
              ))}
            </select>
            <ChevronsUpDown size={14} className={t.faint} />
            <span className={`${t.faint} mx-1`}>·</span>
            <SubIcon size={13} className={t.accent} />
            <select
              value={variant.subtype || def.subtypes[0]}
              onChange={(e) => changeSubtype(e.target.value)}
              className={`text-sm font-medium bg-transparent outline-none ${t.text}`}
            >
              {def.subtypes.map((s) => (
                <option key={s} value={s} className={t.inputBg}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className={`text-xs ${t.sub} mt-1`}>
            {def.blurb}
          </div>
        </div>
      </div>
    </div>
  );
};

const ClassificationSection = ({ variant, updateVariant, t }) => {
  const def = MOVE_TYPES[variant.type];
  return (
    <Toggle
      title="Classification"
      icon={Target}
      t={t}
      meta={`${variant.type} · ${variant.subtype || def.subtypes[0]}`}
    >
      <div className={`rounded-lg border ${t.border} overflow-hidden`}>
        <table className="w-full text-sm">
          <tbody>
            {def.classification.map((field, i) => (
              <tr
                key={field.key}
                className={
                  i !== def.classification.length - 1
                    ? `border-b ${t.subBorder}`
                    : ""
                }
              >
                <td className={`w-1/2 px-3 py-2 ${t.sub} text-xs uppercase tracking-wider`}>
                  {field.label}
                </td>
                <td className="px-2 py-1">
                  <Picker
                    value={variant.classification[field.key] ?? field.options[0]}
                    onChange={(v) =>
                      updateVariant({
                        ...variant,
                        classification: {
                          ...variant.classification,
                          [field.key]: v,
                        },
                      })
                    }
                    options={field.options}
                    t={t}
                    className="text-sm w-full"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`text-[11px] ${t.faint} mt-2`}>
        Changing the type up top reshapes which classification lines apply.
      </p>
    </Toggle>
  );
};

/* Composite spec-field editors — each is a fragment that writes back into
 * the owning variant's `spec[field.key]` object. */

const StunSpecEditor = ({ value, onChange, t }) => {
  const v = value && typeof value === "object" ? value : {};
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <span className={`text-[10px] uppercase tracking-wider ${t.faint} w-16`}>
        Duration
      </span>
      <Field
        value={v.duration}
        onChange={(x) => onChange({ ...v, duration: x })}
        placeholder="0.65"
        t={t}
        className="font-mono text-sm tabular-nums flex-1"
      />
      <span className={`text-[10px] uppercase tracking-wider ${t.faint} w-16`}>
        Priority
      </span>
      <Field
        value={v.priority}
        onChange={(x) => onChange({ ...v, priority: x })}
        placeholder="1"
        t={t}
        className="font-mono text-sm tabular-nums flex-1"
      />
    </div>
  );
};

const EndlagSpecEditor = ({ value, onChange, t }) => {
  const v = value && typeof value === "object" ? value : {};
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <span className={`text-[10px] uppercase tracking-wider ${t.faint} w-16`}>
        Success
      </span>
      <Field
        value={v.success}
        onChange={(x) => onChange({ ...v, success: x })}
        placeholder="0.1"
        t={t}
        className="font-mono text-sm tabular-nums flex-1"
      />
      <span className={`text-[10px] uppercase tracking-wider ${t.faint} w-16`}>
        Fail
      </span>
      <Field
        value={v.fail}
        onChange={(x) => onChange({ ...v, fail: x })}
        placeholder="1.0"
        t={t}
        className="font-mono text-sm tabular-nums flex-1"
      />
    </div>
  );
};

const HitboxSpecEditor = ({ value, onChange, t }) => {
  const v = value && typeof value === "object" ? value : { mode: "Size" };
  const mode = v.mode === "Radius" ? "Radius" : "Size";
  return (
    <div className="px-2 py-1 space-y-2">
      <div className="flex items-center gap-1">
        {["Size", "Radius"].map((m) => (
          <button
            key={m}
            onClick={() => onChange({ ...v, mode: m })}
            className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
              mode === m ? t.chipActive : t.chipIdle
            }`}
          >
            {m}
          </button>
        ))}
        <span className={`text-[10px] ml-2 ${t.faint}`}>
          {mode === "Size"
            ? "Vector3.new(x, y, z)"
            : "single-number sphere radius"}
        </span>
      </div>

      {mode === "Size" ? (
        <>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] uppercase tracking-wider ${t.faint} w-16`}>
              Size
            </span>
            {["x", "y", "z"].map((axis) => (
              <Field
                key={axis}
                value={v[axis]}
                onChange={(x) => onChange({ ...v, [axis]: x })}
                placeholder={axis === "z" ? "6" : "5"}
                t={t}
                className="font-mono text-sm tabular-nums flex-1"
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] uppercase tracking-wider ${t.faint} w-16`}>
              Offset
            </span>
            {["offsetX", "offsetY", "offsetZ"].map((axis, i) => (
              <Field
                key={axis}
                value={v[axis]}
                onChange={(x) => onChange({ ...v, [axis]: x })}
                placeholder={i === 2 ? "-3.5" : "0"}
                t={t}
                className={`font-mono text-sm tabular-nums flex-1 ${t.sub}`}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <span className={`text-[10px] uppercase tracking-wider ${t.faint} w-16`}>
            Radius
          </span>
          <Field
            value={v.radius}
            onChange={(x) => onChange({ ...v, radius: x })}
            placeholder="4"
            t={t}
            className="font-mono text-sm tabular-nums flex-1"
          />
        </div>
      )}
    </div>
  );
};

const SpecSheet = ({ variant, updateVariant, t }) => {
  const def = MOVE_TYPES[variant.type];
  const sub = variant.subtype || def.subtypes[0];
  const subtypeFields = (def.subtypeSpec && def.subtypeSpec[sub]) || [];

  const setSpec = (key, v) =>
    updateVariant({
      ...variant,
      spec: { ...variant.spec, [key]: v },
    });

  const renderCell = (field) => {
    if (field.kind === "stun") {
      return (
        <StunSpecEditor
          value={variant.spec[field.key]}
          onChange={(v) => setSpec(field.key, v)}
          t={t}
        />
      );
    }
    if (field.kind === "endlag") {
      return (
        <EndlagSpecEditor
          value={variant.spec[field.key]}
          onChange={(v) => setSpec(field.key, v)}
          t={t}
        />
      );
    }
    if (field.kind === "hitbox") {
      return (
        <HitboxSpecEditor
          value={variant.spec[field.key]}
          onChange={(v) => setSpec(field.key, v)}
          t={t}
        />
      );
    }
    if (field.kind === "picker") {
      return (
        <Picker
          value={variant.spec[field.key] ?? field.options[0]}
          onChange={(v) => setSpec(field.key, v)}
          options={field.options}
          t={t}
          className="text-sm w-full"
        />
      );
    }
    return (
      <Field
        value={variant.spec[field.key]}
        onChange={(v) => setSpec(field.key, v)}
        placeholder={field.placeholder}
        t={t}
        className="font-mono text-sm"
      />
    );
  };

  const renderRow = (field, isLast) => {
    const isComposite = field.kind === "stun" || field.kind === "endlag" || field.kind === "hitbox";
    return (
      <tr
        key={field.key}
        className={!isLast ? `border-b ${t.subBorder}` : ""}
      >
        <td
          className={`w-1/3 px-3 py-2 ${t.sub} text-xs uppercase tracking-wider align-top`}
        >
          {field.label}
        </td>
        <td className={isComposite ? "py-1" : "px-2 py-1"}>
          {renderCell(field)}
        </td>
      </tr>
    );
  };

  return (
    <Toggle
      title="Spec Sheet"
      icon={Gauge}
      t={t}
      meta={`${variant.type} · ${sub}`}
    >
      <div className={`rounded-lg border ${t.border} overflow-hidden`}>
        <table className="w-full text-sm">
          <tbody>
            {def.spec.map((field, i) =>
              renderRow(
                field,
                i === def.spec.length - 1 && subtypeFields.length === 0
              )
            )}
            {subtypeFields.length > 0 && (
              <tr className={`border-t ${t.subBorder} ${t.surfaceAlt}`}>
                <td
                  colSpan={2}
                  className={`px-3 py-1.5 ${t.sub} text-[10px] uppercase tracking-widest`}
                >
                  Subtype-specific · {sub}
                </td>
              </tr>
            )}
            {subtypeFields.map((field, i) =>
              renderRow(field, i === subtypeFields.length - 1)
            )}
          </tbody>
        </table>
      </div>
    </Toggle>
  );
};

const MarkerTrackTable = ({ variant, updateVariant, track, t }) => {
  const meta = TRACK_META[track];
  const Icon = meta.Icon;
  const rows = variant.markers.filter((m) => m.track === track);

  const updateMarker = (id, patch) =>
    updateVariant({
      ...variant,
      markers: variant.markers.map((m) =>
        m.id === id ? { ...m, ...patch } : m
      ),
    });

  const removeMarker = (id) =>
    updateVariant({
      ...variant,
      markers: variant.markers.filter((m) => m.id !== id),
    });

  const addMarker = () =>
    updateVariant({
      ...variant,
      markers: [
        ...variant.markers,
        { id: newId(), name: "NewMarker", time: "0.00", description: "", track },
      ],
    });

  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center gap-2 mb-2 px-1">
        <Icon size={13} className={t.accent} />
        <span className={`text-[11px] uppercase tracking-wider font-medium ${t.sub}`}>
          {meta.label}
        </span>
        <span className={`text-[10px] ${t.faint}`}>
          {rows.length} marker{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className={`rounded-lg border ${t.border} overflow-hidden`}>
        {rows.length === 0 ? (
          <div className={`px-3 py-4 text-xs ${t.faint} text-center`}>
            No markers in this track yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className={`${t.surfaceAlt} ${t.sub}`}>
                <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider">
                  Marker Name
                </th>
                <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider w-24">
                  Time (s)
                </th>
                <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider">
                  Notes
                </th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className={`border-t ${t.subBorder}`}>
                  <td className="px-2 py-1">
                    <Field
                      value={m.name}
                      onChange={(v) => updateMarker(m.id, { name: v })}
                      placeholder="HitboxStart"
                      t={t}
                      className="font-mono text-sm"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Field
                      value={m.time}
                      onChange={(v) => updateMarker(m.id, { time: v })}
                      placeholder="0.30"
                      t={t}
                      className="font-mono text-sm tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Field
                      value={m.description}
                      onChange={(v) => updateMarker(m.id, { description: v })}
                      placeholder="What happens at this marker"
                      t={t}
                      className={`text-xs ${t.sub}`}
                    />
                  </td>
                  <td className="px-1">
                    <ConfirmDelete onConfirm={() => removeMarker(m.id)} t={t} icon={X} size={13} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <button
        onClick={addMarker}
        className={`mt-2 text-xs px-3 py-1.5 rounded-md border ${t.border} ${t.hover} inline-flex items-center gap-1 ${t.sub}`}
      >
        <Plus size={12} /> Add marker to {meta.label.toLowerCase()}
      </button>
    </div>
  );
};

const KeyframeMarkers = ({ variant, updateVariant, t }) => {
  const tracks = tracksFor(variant);
  const isCinematic = tracks.length > 1;

  const resetToDefaults = () =>
    updateVariant({
      ...variant,
      markers: seedMarkersForType(variant.type).filter((m) =>
        tracks.includes(m.track)
      ),
    });

  return (
    <Toggle
      title="Animation Keyframe Markers"
      icon={Clock}
      t={t}
      meta={
        isCinematic
          ? `${tracks.length} track${tracks.length === 1 ? "" : "s"} · ${variant.markers.length} markers`
          : `${variant.markers.length} markers`
      }
      action={
        <IconBtn t={t} onClick={resetToDefaults} title="Reset to type defaults">
          Reset
        </IconBtn>
      }
    >
      <div className={`text-[11px] ${t.faint} mb-3`}>
        Roblox-style: name and time (seconds) of each <code>KeyframeMarker</code>{" "}
        the animation script should listen for.
        {isCinematic && (
          <>
            {" "}
            Cinematic interactions use separate tracks for the player and victim
            animations
            {tracks.includes("camera")
              ? " — and a camera track since Cutscene Style is set to Cinematic."
              : "."}
          </>
        )}
      </div>

      {tracks.map((track) => (
        <MarkerTrackTable
          key={track}
          variant={variant}
          updateVariant={updateVariant}
          track={track}
          t={t}
        />
      ))}
    </Toggle>
  );
};

const FlavorBlock = ({ variant, updateVariant, t }) => (
  <Toggle title="Concept & Visuals" icon={Wind} t={t}>
    <Area
      value={variant.flavor}
      onChange={(v) => updateVariant({ ...variant, flavor: v })}
      placeholder="SFX, VFX, camera angles, animation beats. How does this move FEEL?"
      rows={5}
      t={t}
      className={`text-sm ${t.sub}`}
    />
  </Toggle>
);

const ComboSynergy = ({ variant, updateVariant, t }) => (
  <Toggle title="Combo Synergy" icon={GitBranch} t={t}>
    <Area
      value={variant.combo}
      onChange={(v) => updateVariant({ ...variant, combo: v })}
      placeholder="What does this cancel into? What chains with it? Any meter or state requirements?"
      rows={4}
      t={t}
      className={`text-sm ${t.sub}`}
    />
  </Toggle>
);

const ScalingLogic = ({ variant, updateVariant, t }) => (
  <Toggle title="Scaling Logic" icon={Gauge} t={t}>
    <Area
      value={variant.scaling}
      onChange={(v) => updateVariant({ ...variant, scaling: v })}
      placeholder="How does damage / effect strength scale based on combo position?"
      rows={3}
      t={t}
      className={`text-sm ${t.sub}`}
    />
  </Toggle>
);

/* ===========================================================================
 * Variable Interactions — spec-sheet section that lets this variant bind
 * to / react to variables declared by the character's passives. Each
 * binding is keyed by passive-variable-id and stores a free-form "effect"
 * description plus an optional note.
 * ======================================================================== */

const VariableInteractionsSection = ({ variant, updateVariant, character, t }) => {
  const passives = character.passives || [];
  const allVars = passives.flatMap((p) =>
    p.variables.map((v) => ({ ...v, passiveId: p.id, passiveName: p.name || "Passive" }))
  );
  const interactions = variant.variableInteractions || {};

  const setInteraction = (varId, patch) =>
    updateVariant({
      ...variant,
      variableInteractions: {
        ...interactions,
        [varId]: { ...(interactions[varId] || {}), ...patch },
      },
    });

  const removeInteraction = (varId) => {
    const next = { ...interactions };
    delete next[varId];
    updateVariant({ ...variant, variableInteractions: next });
  };

  const boundIds = Object.keys(interactions);
  const unboundVars = allVars.filter((v) => !interactions[v.id]);

  return (
    <Toggle
      title="Variable Interactions"
      icon={Gauge}
      t={t}
      meta={`${boundIds.length} bound · ${allVars.length} available`}
    >
      {allVars.length === 0 ? (
        <div className={`text-[11px] ${t.faint} italic`}>
          Add passive variables up in the character header to wire them into
          this variant (e.g. "+8 Spirit on hit", "consumes 2 Heat Stacks").
        </div>
      ) : (
        <>
          {boundIds.length === 0 && (
            <div className={`text-[11px] ${t.faint} mb-2`}>
              Bind this variant to any passive variable to describe how it
              reads or writes that variable.
            </div>
          )}

          {boundIds.length > 0 && (
            <div className={`rounded-lg border ${t.border} overflow-hidden mb-3`}>
              <table className="w-full text-sm">
                <tbody>
                  {boundIds.map((id, i) => {
                    const v = allVars.find((x) => x.id === id);
                    const binding = interactions[id];
                    if (!v) {
                      // Dangling reference — variable was deleted. Offer cleanup.
                      return (
                        <tr key={id} className={i !== 0 ? `border-t ${t.subBorder}` : ""}>
                          <td className="px-3 py-2 text-xs">
                            <span className={`${t.danger} italic`}>
                              (variable deleted)
                            </span>
                          </td>
                          <td className="px-2 py-1">
                            <span className={`text-xs ${t.faint} italic`}>
                              {binding?.effect || ""}
                            </span>
                          </td>
                          <td className="w-10 px-1">
                            <ConfirmDelete
                              onConfirm={() => removeInteraction(id)}
                              t={t}
                              icon={X}
                              size={12}
                            />
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr
                        key={id}
                        className={i !== 0 ? `border-t ${t.subBorder}` : ""}
                      >
                        <td className="px-3 py-2 w-1/3 align-top">
                          <div className={`text-sm font-mono ${t.accent}`}>
                            {v.name || "unnamed"}
                          </div>
                          <div className={`text-[10px] uppercase tracking-wider ${t.faint}`}>
                            {v.passiveName} · {v.kind}
                          </div>
                        </td>
                        <td className="px-2 py-1">
                          <Field
                            value={binding.effect}
                            onChange={(x) => setInteraction(id, { effect: x })}
                            placeholder="+8 on hit / −2 on use / reads current value"
                            t={t}
                            className="text-sm"
                          />
                          <Field
                            value={binding.note}
                            onChange={(x) => setInteraction(id, { note: x })}
                            placeholder="Notes / conditions"
                            t={t}
                            className={`text-xs ${t.sub}`}
                          />
                        </td>
                        <td className="w-10 px-1 align-top">
                          <ConfirmDelete
                            onConfirm={() => removeInteraction(id)}
                            t={t}
                            icon={X}
                            size={12}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {unboundVars.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className={`text-[11px] ${t.faint} self-center mr-1`}>
                Bind:
              </span>
              {unboundVars.map((v) => (
                <button
                  key={v.id}
                  onClick={() =>
                    setInteraction(v.id, { effect: "", note: "" })
                  }
                  className={`text-[11px] px-2 py-1 rounded-full border ${t.chipIdle} inline-flex items-center gap-1`}
                  title={`${v.passiveName} · ${v.kind}`}
                >
                  <Plus size={10} /> {v.name || "unnamed"}
                  <span className={`${t.faint}`}>· {v.passiveName}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Toggle>
  );
};

/* ===========================================================================
 * References — cross-link this variant/move/passive to others on the same
 * character. Handy for describing combo routes, awakening-only follow-ups,
 * or passive interactions without duplicating the underlying data.
 * ======================================================================== */

const buildReferenceCatalog = (character, excludeVariantId) => {
  const out = [];
  DEFAULT_SLOTS.filter((s) => character.enabledSlots.includes(s.key)).forEach(
    (slot) => {
      const move = character.moves[slot.key];
      if (!move) return;
      out.push({
        id: `move:${slot.key}`,
        kind: "move",
        label: `${slot.label}: ${move.name || "Untitled"}`,
        targetId: slot.key,
      });
      move.variants.forEach((v) => {
        if (v.id === excludeVariantId) return;
        out.push({
          id: `variant:${v.id}`,
          kind: "variant",
          label: `${move.name || slot.label} · ${v.tag} (${v.type}${v.subtype ? "/" + v.subtype : ""})`,
          targetId: v.id,
          parentMoveKey: slot.key,
        });
      });
    }
  );
  (character.passives || []).forEach((p) => {
    out.push({
      id: `passive:${p.id}`,
      kind: "passive",
      label: `Passive: ${p.name || "Unnamed"}`,
      targetId: p.id,
    });
  });
  return out;
};

const REFERENCE_KIND_META = {
  variant: { label: "Variant", Icon: Layers },
  move: { label: "Move", Icon: Swords },
  passive: { label: "Passive", Icon: Star },
};

const ReferencesSection = ({
  owner,
  references,
  updateReferences,
  character,
  t,
  title = "References",
  excludeVariantId,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const catalog = buildReferenceCatalog(character, excludeVariantId);
  const existingIds = new Set(references.map((r) => r.id));
  const available = catalog.filter((c) => !existingIds.has(c.id));

  const addRef = (entry) => {
    updateReferences([
      ...references,
      {
        id: entry.id,
        kind: entry.kind,
        targetId: entry.targetId,
        parentMoveKey: entry.parentMoveKey,
        label: entry.label,
        note: "",
      },
    ]);
    setPickerOpen(false);
  };

  const patchRef = (id, patch) => {
    updateReferences(
      references.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  const removeRef = (id) =>
    updateReferences(references.filter((r) => r.id !== id));

  return (
    <Toggle
      title={title}
      icon={GitBranch}
      t={t}
      meta={`${references.length} ref${references.length === 1 ? "" : "s"}`}
      action={
        <div className="relative">
          <IconBtn
            t={t}
            onClick={(e) => {
              e?.stopPropagation?.();
              setPickerOpen((v) => !v);
            }}
            title="Add reference"
          >
            <Plus size={12} /> Mention
          </IconBtn>
          {pickerOpen && (
            <div
              className={`absolute right-0 top-full mt-1 z-30 min-w-[260px] max-h-64 overflow-y-auto rounded-lg border ${t.border} ${t.surface} shadow-lg py-1`}
              onClick={(e) => e.stopPropagation()}
            >
              {available.length === 0 ? (
                <div className={`px-3 py-2 text-[11px] ${t.faint}`}>
                  Nothing left to reference — already linked to everything.
                </div>
              ) : (
                available.map((entry) => {
                  const Meta = REFERENCE_KIND_META[entry.kind];
                  return (
                    <button
                      key={entry.id}
                      onClick={() => addRef(entry)}
                      className={`w-full text-left px-3 py-1.5 text-xs ${t.hover} flex items-center gap-2`}
                    >
                      <Meta.Icon size={11} className={t.accent} />
                      <span className="flex-1 truncate">{entry.label}</span>
                      <span className={`text-[10px] ${t.faint} uppercase`}>
                        {Meta.label}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      }
    >
      {references.length === 0 ? (
        <div className={`text-[11px] ${t.faint} italic`}>
          Use Mention to cross-reference other variants, moves, or passives on
          this character. References are plain pointers — describe each link in
          the note field.
        </div>
      ) : (
        <div className={`rounded-lg border ${t.border} overflow-hidden`}>
          <table className="w-full text-sm">
            <tbody>
              {references.map((r, i) => {
                const Meta = REFERENCE_KIND_META[r.kind] || REFERENCE_KIND_META.variant;
                // Re-derive a fresh label in case the target was renamed
                const fresh = catalog.find((c) => c.id === r.id);
                const label = fresh?.label || r.label || "(orphaned reference)";
                return (
                  <tr key={r.id} className={i !== 0 ? `border-t ${t.subBorder}` : ""}>
                    <td className="px-3 py-2 w-1/3 align-top">
                      <div className={`text-xs font-medium flex items-center gap-1.5 ${fresh ? "" : t.danger}`}>
                        <Meta.Icon size={11} className={fresh ? t.accent : ""} />
                        <span className="truncate">{label}</span>
                      </div>
                      <div className={`text-[10px] uppercase tracking-wider ${t.faint} mt-0.5`}>
                        {Meta.label}
                        {!fresh ? " · orphaned" : ""}
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <Field
                        value={r.note}
                        onChange={(v) => patchRef(r.id, { note: v })}
                        placeholder="How does this relate to the current element?"
                        t={t}
                        className={`text-xs ${t.sub}`}
                      />
                    </td>
                    <td className="w-10 px-1 align-top">
                      <ConfirmDelete
                        onConfirm={() => removeRef(r.id)}
                        t={t}
                        icon={X}
                        size={12}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Toggle>
  );
};

/* ===========================================================================
 * Sub-Moveset (Awakening only) — a nested moveset authored entirely inside
 * an Awakening variant. Each submove is a shallow {name, description,
 * variants[]} object; each variant is a full Variant so it gets spec sheet,
 * markers, media, etc.
 * ======================================================================== */

const SubVariantEditor = ({ subvariant, updateSubvariant, removeSubvariant, character, t }) => {
  const def = MOVE_TYPES[subvariant.type];
  return (
    <div className={`rounded-lg border ${t.border} ${t.soft} p-3 space-y-3`}>
      <div className="flex items-center gap-2">
        <Layers size={12} className={t.accent} />
        <select
          value={subvariant.tag}
          onChange={(e) => updateSubvariant({ ...subvariant, tag: e.target.value })}
          className={`text-xs bg-transparent outline-none rounded px-1.5 py-0.5 border ${t.border} ${t.inputBg}`}
        >
          {[...new Set([...VARIANT_TAGS, subvariant.tag])].map((tg) => (
            <option key={tg} value={tg}>
              {tg}
            </option>
          ))}
        </select>
        <select
          value={subvariant.type}
          onChange={(e) => {
            const newType = e.target.value;
            updateSubvariant({
              ...subvariant,
              type: newType,
              subtype: MOVE_TYPES[newType].subtypes[0],
              classification: {},
            });
          }}
          className={`text-xs bg-transparent outline-none rounded px-1.5 py-0.5 border ${t.border} ${t.inputBg}`}
        >
          {MOVE_TYPE_KEYS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select
          value={subvariant.subtype || def.subtypes[0]}
          onChange={(e) => updateSubvariant({ ...subvariant, subtype: e.target.value })}
          className={`text-xs bg-transparent outline-none rounded px-1.5 py-0.5 border ${t.border} ${t.inputBg}`}
        >
          {def.subtypes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="ml-auto">
          <ConfirmDelete onConfirm={removeSubvariant} t={t} title="Remove sub-variant" />
        </div>
      </div>
 
      {subvariant.tag === "Enemy conditioned (if enemy is wall slamed, downslamed, uptlitled or spinning)" && (
        <div className="px-1.5 space-y-2">
          <div className="flex items-center gap-2">
            <Target size={11} className={t.faint} />
            <span className={`text-[10px] uppercase tracking-wider ${t.faint}`}>
              Conditions
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(subvariant.conditions || []).map((cond) => (
              <div
                key={cond}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${t.accentBg} ${t.accent} ${t.border}`}
              >
                {cond}
                <button
                  onClick={() =>
                    updateSubvariant({
                      ...subvariant,
                      conditions: (subvariant.conditions || []).filter((c) => c !== cond),
                    })
                  }
                >
                  <X size={8} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {ENEMY_CONDITIONS.filter(
              (c) => !(subvariant.conditions || []).includes(c)
            ).map((cond) => (
              <button
                key={cond}
                onClick={() =>
                  updateSubvariant({
                    ...subvariant,
                    conditions: [...(subvariant.conditions || []), cond],
                  })
                }
                className={`text-[10px] px-2 py-0.5 rounded-full border ${t.chipIdle} hover:border-current`}
              >
                + {cond}
              </button>
            ))}
          </div>
        </div>
      )}

      <SpecSheet variant={subvariant} updateVariant={updateSubvariant} t={t} />
    </div>
  );
};

const SubMoveCard = ({ submove, updateSubmove, removeSubmove, character, t }) => {
  const setVariants = (variants) => updateSubmove({ ...submove, variants });
  const updateSubvariant = (updated) =>
    setVariants(submove.variants.map((v) => (v.id === updated.id ? updated : v)));

  return (
    <div className={`rounded-xl border ${t.border} ${t.surface} p-3 space-y-3`}>
      <div className="flex items-center gap-2">
        <Flame size={14} className={t.accent} />
        <input
          value={submove.name}
          onChange={(e) => updateSubmove({ ...submove, name: e.target.value })}
          placeholder="Sub-move name"
          className={`flex-1 bg-transparent outline-none text-base font-semibold tracking-tight rounded px-1 ${t.hover}`}
        />
        <ConfirmDelete onConfirm={removeSubmove} t={t} title="Remove sub-move" />
      </div>
      <Area
        value={submove.description}
        onChange={(v) => updateSubmove({ ...submove, description: v })}
        placeholder="What this sub-move does while awakened."
        rows={2}
        t={t}
        className={`text-xs ${t.sub}`}
      />

      <div className="space-y-2">
        {submove.variants.map((sv) => (
          <SubVariantEditor
            key={sv.id}
            subvariant={sv}
            updateSubvariant={updateSubvariant}
            removeSubvariant={() => {
              if (submove.variants.length <= 1) return;
              setVariants(submove.variants.filter((v) => v.id !== sv.id));
            }}
            character={character}
            t={t}
          />
        ))}
        <button
          onClick={() => setVariants([...submove.variants, makeVariant("Ground", "Attack", "Special")])}
          className={`w-full text-[11px] px-2 py-1.5 rounded border border-dashed ${t.border} ${t.hover} ${t.sub} inline-flex items-center justify-center gap-1`}
        >
          <Plus size={11} /> Add sub-variant
        </button>
      </div>
    </div>
  );
};

const SubMovesetSection = ({ variant, updateVariant, character, t }) => {
  const submoves = variant.submoves || [];
  const setSubmoves = (next) => updateVariant({ ...variant, submoves: next });

  return (
    <Toggle
      title="Awakening Sub-Moveset"
      icon={Flame}
      t={t}
      meta={`${submoves.length} sub-move${submoves.length === 1 ? "" : "s"}`}
      action={
        <IconBtn
          t={t}
          onClick={() =>
            setSubmoves([
              ...submoves,
              {
                id: newId(),
                name: "New sub-move",
                description: "",
                variants: [makeVariant("Ground", "Attack", "Special")],
              },
            ])
          }
          title="Add sub-move"
        >
          <Plus size={12} /> Sub-move
        </IconBtn>
      }
    >
      {submoves.length === 0 ? (
        <div
          className={`rounded-lg border border-dashed ${t.border} ${t.soft} py-6 text-center ${t.faint} text-xs`}
        >
          Awakenings can unlock a nested moveset. Add sub-moves here to
          document the alternate kit available during this transformation.
        </div>
      ) : (
        <div className="space-y-3">
          {submoves.map((sm) => (
            <SubMoveCard
              key={sm.id}
              submove={sm}
              updateSubmove={(updated) =>
                setSubmoves(submoves.map((x) => (x.id === updated.id ? updated : x)))
              }
              removeSubmove={() =>
                setSubmoves(submoves.filter((x) => x.id !== sm.id))
              }
              character={character}
              t={t}
            />
          ))}
        </div>
      )}
    </Toggle>
  );
};

/* ===========================================================================
 * Sidebar — Roster + Move Tree
 * ======================================================================== */

const RosterSection = ({
  characters,
  activeCharacterId,
  selectCharacter,
  addCharacter,
  removeCharacter,
  minimizedCharacters,
  toggleMinimize,
  t,
}) => (
  <div className={`px-3 py-3 border-b ${t.border}`}>
    <div className="flex items-center justify-between px-1 mb-2">
      <div className={`text-[11px] uppercase tracking-wider ${t.faint}`}>
        Roster · {characters.length}
      </div>
      <button
        onClick={addCharacter}
        title="New character"
        className={`p-1 rounded ${t.hover}`}
      >
        <Plus size={13} />
      </button>
    </div>

    <div className="space-y-1.5">
      {characters.map((c) => {
        const isActive = c.id === activeCharacterId;
        const isMin = minimizedCharacters.has(c.id);
        return (
          <div
            key={c.id}
            className={`group rounded-md border ${t.border} ${
              isActive ? `${t.accentBg} ${t.accentRing}` : t.surface
            }`}
          >
            {/* Always-visible header row: chevron + anime title + delete */}
            <div className="flex items-center gap-1 px-1.5 py-1">
              <button
                onClick={() => toggleMinimize(c.id)}
                className={`p-0.5 rounded ${t.hover}`}
                title={isMin ? "Expand" : "Collapse to title only"}
              >
                {isMin ? (
                  <ChevronRight size={12} className={t.faint} />
                ) : (
                  <ChevronDown size={12} className={t.faint} />
                )}
              </button>
              <button
                onClick={() => selectCharacter(c.id)}
                className="flex-1 text-left min-w-0"
                title={`${c.name} · ${c.anime}`}
              >
                <span
                  className={`inline-block text-[10px] px-1.5 py-0.5 rounded border ${t.animeTag} truncate max-w-full`}
                >
                  {c.anime || "Untitled Anime"}
                </span>
              </button>
              <ConfirmDelete
                onConfirm={() => removeCharacter(c.id)}
                t={t}
                title="Delete character"
              />
            </div>

            {/* Body — hidden when minimized */}
            {!isMin && (
              <button
                onClick={() => selectCharacter(c.id)}
                className="w-full text-left px-2.5 pb-2"
              >
                <div
                  className={`text-sm font-medium truncate ${
                    isActive ? t.accent : ""
                  }`}
                >
                  {c.name || "Unnamed"}
                </div>
                <div className={`text-[11px] ${t.faint}`}>
                  {c.enabledSlots.length} slot{c.enabledSlots.length === 1 ? "" : "s"}
                </div>
              </button>
            )}
          </div>
        );
      })}
    </div>

    <button
      onClick={addCharacter}
      className={`mt-3 w-full text-sm rounded-md border border-dashed ${t.border} ${t.hover} px-3 py-2 flex items-center justify-center gap-1 ${t.sub}`}
    >
      <Plus size={14} /> Add character to roster
    </button>
  </div>
);

const AddVariantInline = ({ move, onAdd, t }) => {
  const [open, setOpen] = useState(false);
  const usedTags = move.variants.map((v) => v.tag);
  const free = VARIANT_TAGS.filter((tag) => !usedTags.includes(tag));

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full text-left text-[11px] px-2 py-1 rounded ${t.hover} ${t.sub} flex items-center gap-1`}
      >
        <Plus size={10} /> Add variant
      </button>
      {open && (
        <div
          className={`absolute z-20 mt-1 left-0 min-w-[200px] rounded-lg border ${t.border} ${t.surface} shadow-lg py-1 max-h-64 overflow-y-auto`}
        >
          <div className={`px-2 py-1 text-[10px] uppercase tracking-wider ${t.faint}`}>
            Variant tag
          </div>
          {free.length === 0 && (
            <div className={`px-2 py-1 text-[11px] ${t.faint}`}>
              All standard tags used. Pick one anyway:
            </div>
          )}
          {(free.length === 0 ? VARIANT_TAGS : free).map((tag) => (
            <button
              key={tag}
              onClick={() => {
                const base = move.variants[0];
                onAdd(
                  tag,
                  base?.type || "Attack",
                  base?.subtype || null
                );
                setOpen(false);
              }}
              className={`w-full text-left px-2 py-1 text-xs ${t.hover}`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const MoveTree = ({
  character,
  updateCharacter,
  activeMoveKey,
  setActiveMoveKey,
  activeVariantId,
  setActiveVariantId,
  expandedMoves,
  toggleExpanded,
  t,
}) => {
  const slots = DEFAULT_SLOTS.filter((s) =>
    character.enabledSlots.includes(s.key)
  );
  const removableMissing = DEFAULT_SLOTS.filter(
    (s) => s.removable && !character.enabledSlots.includes(s.key)
  );

  const slotLabel = (slot) => {
    if (slot.isFinisher) {
      return character.moves[slot.key]?.finisherKind || "Awakening";
    }
    return slot.label;
  };

  const removeUtility = (key) => {
    updateCharacter({
      ...character,
      enabledSlots: character.enabledSlots.filter((k) => k !== key),
    });
    if (activeMoveKey === key) {
      setActiveMoveKey("move1");
      setActiveVariantId(character.moves.move1.variants[0]?.id);
    }
  };

  return (
    <div className="px-3 py-3">
      <div className={`px-1 mb-2 text-[11px] uppercase tracking-wider ${t.faint}`}>
        Moves · {character.name || "—"}
      </div>
      <div className="space-y-0.5">
        {slots.map((slot) => {
          const move = character.moves[slot.key];
          const isExpanded = expandedMoves.has(slot.key);
          const isActiveMove = activeMoveKey === slot.key;
          const SlotIcon = slot.isFinisher
            ? move.finisherKind === "Ultimate"
              ? Star
              : Sparkles
            : iconForVariant(move.variants[0]);

          return (
            <div key={slot.key}>
              <div
                className={`group flex items-center gap-1 rounded-md px-1 py-1 transition-colors ${
                  isActiveMove ? t.accentBg : t.hover
                }`}
              >
                <button
                  onClick={() => toggleExpanded(slot.key)}
                  className={`p-0.5 rounded ${t.hover}`}
                  title={isExpanded ? "Collapse variants" : "Expand variants"}
                >
                  {isExpanded ? (
                    <ChevronDown size={13} className={t.sub} />
                  ) : (
                    <ChevronRight size={13} className={t.sub} />
                  )}
                </button>
                <button
                  onClick={() => {
                    setActiveMoveKey(slot.key);
                    if (!expandedMoves.has(slot.key))
                      toggleExpanded(slot.key);
                    if (move.variants[0])
                      setActiveVariantId(move.variants[0].id);
                  }}
                  className="flex-1 flex items-center gap-2 text-left min-w-0"
                >
                  <SlotIcon
                    size={13}
                    className={isActiveMove ? t.accent : t.sub}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-[11px] uppercase tracking-wider ${t.faint} leading-none`}
                    >
                      {slotLabel(slot)}
                    </div>
                    <div
                      className={`text-sm truncate ${
                        isActiveMove ? `${t.accent} font-medium` : ""
                      }`}
                    >
                      {move.name || "Untitled"}
                    </div>
                  </div>
                  <span className={`text-[10px] ${t.faint} tabular-nums`}>
                    {move.variants.length}
                  </span>
                </button>
                {slot.removable && (
                  <ConfirmDelete
                    onConfirm={() => removeUtility(slot.key)}
                    t={t}
                    icon={X}
                    size={11}
                    title={`Remove ${slot.label}`}
                  />
                )}
              </div>

              {isExpanded && (
                <div className={`ml-6 pl-2 border-l ${t.subBorder} my-1`}>
                  {move.variants.map((v) => {
                    const isActiveVariant =
                      activeMoveKey === slot.key &&
                      activeVariantId === v.id;
                    const VIcon = iconForVariant(v);
                    return (
                      <div
                        key={v.id}
                        className={`group flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer transition-colors ${
                          isActiveVariant ? t.accentBg : t.hover
                        }`}
                        onClick={() => {
                          setActiveMoveKey(slot.key);
                          setActiveVariantId(v.id);
                        }}
                      >
                        <Layers
                          size={11}
                          className={isActiveVariant ? t.accent : t.faint}
                        />
                        <div className="flex-1 min-w-0">
                          <div
                            className={`text-xs truncate ${
                              isActiveVariant ? t.accent : ""
                            }`}
                          >
                            {v.tag}
                          </div>
                          <div className={`text-[10px] ${t.faint} flex items-center gap-1`}>
                            <VIcon size={9} />
                            {v.subtype ? `${v.type} · ${v.subtype}` : v.type}
                          </div>
                        </div>
                        {move.variants.length > 1 && (
                          <ConfirmDelete
                            onConfirm={() => {
                              const remaining = move.variants.filter(
                                (x) => x.id !== v.id
                              );
                              updateCharacter({
                                ...character,
                                moves: {
                                  ...character.moves,
                                  [slot.key]: { ...move, variants: remaining },
                                },
                              });
                              if (
                                activeMoveKey === slot.key &&
                                activeVariantId === v.id
                              ) {
                                setActiveVariantId(remaining[0].id);
                              }
                            }}
                            t={t}
                            icon={X}
                            size={10}
                            title="Remove variant"
                          />
                        )}
                      </div>
                    );
                  })}
                  <AddVariantInline
                    move={move}
                    onAdd={(tag, type, subtype) => {
                      const nv = makeVariant(tag, type, subtype);
                      updateCharacter({
                        ...character,
                        moves: {
                          ...character.moves,
                          [slot.key]: {
                            ...move,
                            variants: [...move.variants, nv],
                          },
                        },
                      });
                      setActiveMoveKey(slot.key);
                      setActiveVariantId(nv.id);
                    }}
                    t={t}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {removableMissing.length > 0 && (
        <div className="mt-3 px-1 space-y-1">
          {removableMissing.map((slot) => (
            <button
              key={slot.key}
              onClick={() =>
                updateCharacter({
                  ...character,
                  enabledSlots: [...character.enabledSlots, slot.key],
                })
              }
              className={`w-full text-left text-xs px-2 py-1.5 rounded border border-dashed ${t.border} ${t.hover} ${t.sub} flex items-center gap-1`}
            >
              <Plus size={11} /> Add {slot.label} slot
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ===========================================================================
 * Character Profile Header
 * ======================================================================== */

const CopyLuauButton = ({ character, t, className = "" }) => {
  const [state, setState] = useState("idle"); // idle | copied | error
  const timeoutRef = useRef(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    []
  );

  const copy = async () => {
    const code = characterToLuau(character);
    try {
      if (navigator.clipboard && window.isSecureContext !== false) {
        await navigator.clipboard.writeText(code);
      } else {
        // Fallback: hidden textarea + execCommand (works in sandboxed iframes
        // where the async Clipboard API is often blocked).
        const ta = document.createElement("textarea");
        ta.value = code;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setState("copied");
    } catch {
      setState("error");
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setState("idle"), 2000);
  };

  return (
    <button
      onClick={copy}
      title="Copy Roblox Studio module script to clipboard"
      className={`text-xs px-3 py-1.5 rounded-md border ${t.border} ${t.hover} inline-flex items-center gap-1.5 font-medium ${className}`}
    >
      <ChevronsUpDown size={12} className={t.accent} />
      {state === "copied"
        ? "Copied Luau module!"
        : state === "error"
        ? "Copy failed"
        : "Copy as Luau module"}
    </button>
  );
};

const CharacterHeader = ({ character, updateCharacter, goToRoster, t }) => (
  <header className={`border-b ${t.border} pb-7 mb-8`}>
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-3">
      {goToRoster && (
        <button
          onClick={goToRoster}
          className={`text-[11px] px-2 py-1 rounded ${t.hover} ${t.sub} inline-flex items-center gap-1 font-medium`}
          title="Back to roster"
        >
          <ChevronRight size={12} className="rotate-180" /> Roster
        </button>
      )}
      <span className={`text-[11px] ${t.faint}`}>/</span>
      <div
        className={`flex items-center gap-1.5 flex-1 min-w-0 rounded px-2 py-1 ${t.hover}`}
      >
        <Tv size={12} className={t.faint} />
        <input
          value={character.anime}
          onChange={(e) =>
            updateCharacter({ ...character, anime: e.target.value })
          }
          placeholder="Anime / source name"
          className={`bg-transparent outline-none text-[13px] ${t.sub} flex-1 min-w-0`}
        />
      </div>
      <CopyLuauButton character={character} t={t} />
    </div>

    <input
      value={character.name}
      onChange={(e) => updateCharacter({ ...character, name: e.target.value })}
      placeholder="Character name"
      className={`w-full bg-transparent outline-none text-4xl font-semibold tracking-tight leading-tight rounded px-2 -mx-2 py-1 ${t.hover}`}
    />

    <div className="mt-6 space-y-3">
      <Toggle title="Core Gimmick" icon={Sparkles} t={t}>
        <Area
          value={character.gimmick}
          onChange={(v) => updateCharacter({ ...character, gimmick: v })}
          placeholder="Meter systems, stances, unique resources, transformations…"
          rows={4}
          t={t}
          className={`text-sm ${t.sub}`}
        />
      </Toggle>
      <PassivesPanel character={character} updateCharacter={updateCharacter} t={t} />
    </div>
  </header>
);

/* ===========================================================================
 * Passives — a character-level list of persistent mechanics. Each passive
 * can declare typed variables that move variants then bind to via the
 * Variable Interactions block in the Spec Sheet.
 * ======================================================================== */

const PASSIVE_VAR_KINDS = ["number", "boolean", "text", "enum"];

const PassiveVariableEditor = ({ passive, variable, updatePassive, t }) => {
  const patch = (partial) => {
    updatePassive({
      ...passive,
      variables: passive.variables.map((v) =>
        v.id === variable.id ? { ...v, ...partial } : v
      ),
    });
  };
  const remove = () => {
    updatePassive({
      ...passive,
      variables: passive.variables.filter((v) => v.id !== variable.id),
    });
  };
  return (
    <tr className={`border-t ${t.subBorder}`}>
      <td className="px-2 py-1 w-40">
        <Field
          value={variable.name}
          onChange={(v) => patch({ name: v })}
          placeholder="HeatStacks"
          t={t}
          className="font-mono text-sm"
        />
      </td>
      <td className="px-2 py-1 w-24">
        <Picker
          value={variable.kind}
          onChange={(v) => patch({ kind: v })}
          options={PASSIVE_VAR_KINDS}
          t={t}
          className="text-xs"
        />
      </td>
      <td className="px-2 py-1 w-24">
        <Field
          value={variable.initial}
          onChange={(v) => patch({ initial: v })}
          placeholder="0"
          t={t}
          className="font-mono text-xs tabular-nums"
        />
      </td>
      <td className="px-2 py-1">
        <Field
          value={variable.description}
          onChange={(v) => patch({ description: v })}
          placeholder="What this tracks / its range"
          t={t}
          className={`text-xs ${t.sub}`}
        />
      </td>
      <td className="px-1">
        <ConfirmDelete onConfirm={remove} t={t} icon={X} size={12} />
      </td>
    </tr>
  );
};

const PassiveCard = ({ passive, updatePassive, removePassive, character, t }) => {
  return (
    <div className={`rounded-lg border ${t.border} ${t.surface}`}>
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${t.subBorder}`}>
        <Star size={14} className={t.accent} />
        <input
          value={passive.name}
          onChange={(e) => updatePassive({ ...passive, name: e.target.value })}
          placeholder="Passive name"
          className={`flex-1 bg-transparent outline-none text-sm font-medium rounded px-1 ${t.hover}`}
        />
        <ConfirmDelete onConfirm={removePassive} t={t} title="Delete passive" />
      </div>
      <div className="p-3 space-y-2">
        <Area
          value={passive.description}
          onChange={(v) => updatePassive({ ...passive, description: v })}
          placeholder="What this passive does, when it triggers, its mechanics…"
          rows={2}
          t={t}
          className={`text-xs ${t.sub}`}
        />

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className={`text-[11px] uppercase tracking-wider ${t.faint}`}>
              Variables · {passive.variables.length}
            </div>
            <button
              onClick={() =>
                updatePassive({
                  ...passive,
                  variables: [...passive.variables, makePassiveVariable()],
                })
              }
              className={`text-[11px] px-2 py-0.5 rounded ${t.hover} ${t.sub} inline-flex items-center gap-1`}
            >
              <Plus size={10} /> Variable
            </button>
          </div>
          {passive.variables.length === 0 ? (
            <div className={`text-[11px] ${t.faint} italic px-1`}>
              No variables yet. Variables can be referenced from any variant's
              Spec Sheet as Variable Interactions.
            </div>
          ) : (
            <div className={`rounded border ${t.border} overflow-hidden`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={`${t.surfaceAlt} ${t.sub}`}>
                    <th className="text-left px-2 py-1 text-[10px] uppercase tracking-wider">
                      Name
                    </th>
                    <th className="text-left px-2 py-1 text-[10px] uppercase tracking-wider">
                      Kind
                    </th>
                    <th className="text-left px-2 py-1 text-[10px] uppercase tracking-wider">
                      Initial
                    </th>
                    <th className="text-left px-2 py-1 text-[10px] uppercase tracking-wider">
                      Description
                    </th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {passive.variables.map((v) => (
                    <PassiveVariableEditor
                      key={v.id}
                      passive={passive}
                      variable={v}
                      updatePassive={updatePassive}
                      t={t}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {character && (
          <ReferencesSection
            owner={passive}
            references={passive.references || []}
            updateReferences={(refs) =>
              updatePassive({ ...passive, references: refs })
            }
            character={character}
            t={t}
            title="Mentions"
          />
        )}
      </div>
    </div>
  );
};

const PassivesPanel = ({ character, updateCharacter, t }) => {
  const passives = character.passives || [];
  const updatePassive = (updated) =>
    updateCharacter({
      ...character,
      passives: passives.map((p) => (p.id === updated.id ? updated : p)),
    });
  const addPassive = () =>
    updateCharacter({
      ...character,
      passives: [...passives, makePassive({ name: "New Passive" })],
    });
  const removePassive = (id) =>
    updateCharacter({
      ...character,
      passives: passives.filter((p) => p.id !== id),
    });

  return (
    <Toggle
      title="Passives"
      icon={Star}
      t={t}
      meta={`${passives.length} passive${passives.length === 1 ? "" : "s"}`}
      action={
        <IconBtn t={t} onClick={addPassive} title="Add passive">
          <Plus size={12} /> Add
        </IconBtn>
      }
    >
      {passives.length === 0 ? (
        <div
          className={`rounded-lg border border-dashed ${t.border} ${t.soft} py-6 text-center ${t.faint} text-xs`}
        >
          No passives yet. Use passives for meters, stances, auras, stacks —
          anything always-on or ambient. Declare variables to reference from
          move variants.
        </div>
      ) : (
        <div className="space-y-3">
          {passives.map((p) => (
            <PassiveCard
              key={p.id}
              passive={p}
              updatePassive={updatePassive}
              removePassive={() => removePassive(p.id)}
              character={character}
              t={t}
            />
          ))}
        </div>
      )}
    </Toggle>
  );
};

/* ===========================================================================
 * Roster Screen — the landing view. Groups characters by anime and shows
 * a card grid per anime so the whole roster is visible at once before
 * drilling into a single character's editor.
 * ======================================================================== */

const AnimeRosterCard = ({
  character,
  onOpen,
  onRemove,
  updateCharacter,
  t,
}) => {
  const moveCount = character.enabledSlots.reduce(
    (acc, k) => acc + (character.moves[k]?.variants.length || 0),
    0
  );

  const primaryMove = character.moves[character.enabledSlots[0]];
  const awakening = character.moves.awakening;

  const passiveCount = (character.passives || []).length;

  return (
    <div
      className={`rounded-xl border ${t.border} ${t.surface} p-4 flex flex-col gap-3 transition-all hover:shadow-md hover:-translate-y-0.5 group cursor-default relative`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-md flex items-center justify-center ${t.accentBg} ${t.accent} shrink-0 transition-transform group-hover:scale-105`}
        >
          <Sparkles size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <input
            value={character.name}
            onChange={(e) =>
              updateCharacter({ ...character, name: e.target.value })
            }
            placeholder="Character name"
            className={`w-full bg-transparent outline-none text-lg font-semibold tracking-tight leading-tight ${t.hover} rounded px-1 -mx-1`}
          />
          <div className={`text-[11px] ${t.faint} mt-1 flex items-center gap-1.5 flex-wrap`}>
            <span className="tabular-nums">{character.enabledSlots.length} slots</span>
            <span className="opacity-50">·</span>
            <span className="tabular-nums">{moveCount} variants</span>
            {passiveCount > 0 && (
              <>
                <span className="opacity-50">·</span>
                <span className="tabular-nums">
                  {passiveCount} passive{passiveCount === 1 ? "" : "s"}
                </span>
              </>
            )}
            {awakening?.finisherKind && (
              <>
                <span className="opacity-50">·</span>
                <span className={t.accent}>{awakening.finisherKind}</span>
              </>
            )}
          </div>
        </div>
        <ConfirmDelete
          onConfirm={onRemove}
          t={t}
          title={`Delete ${character.name || "character"}`}
        />
      </div>

      {character.gimmick && (
        <div className={`text-xs ${t.sub} line-clamp-3 leading-relaxed`}>
          {character.gimmick}
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {character.enabledSlots.map((k) => {
          const m = character.moves[k];
          const slot = DEFAULT_SLOTS.find((s) => s.key === k);
          const label = m.name || slot?.label || k;
          const VIcon = m.variants[0] ? iconForVariant(m.variants[0]) : Sparkles;
          return (
            <span
              key={k}
              className={`text-[10px] px-1.5 py-0.5 rounded border ${t.border} ${t.soft} ${t.sub} truncate max-w-[160px] inline-flex items-center gap-1`}
              title={`${slot?.label || k}: ${label}`}
            >
              <VIcon size={9} className={`${t.faint} shrink-0`} />
              {label}
            </span>
          );
        })}
      </div>

      <div
        className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-auto pt-2 border-t ${t.subBorder}`}
      >
        <button
          onClick={onOpen}
          className={`text-xs px-3 py-2 sm:py-1.5 rounded-md border ${t.border} ${t.hover} inline-flex items-center justify-center gap-1 ${t.accent} font-medium w-full sm:w-auto`}
        >
          Open moveset <ChevronRight size={12} />
        </button>
        <CopyLuauButton character={character} t={t} className="w-full sm:w-auto py-2 sm:py-1.5 justify-center" />
      </div>
    </div>
  );
};

const RosterScreen = ({
  characters,
  selectCharacter,
  addCharacter,
  removeCharacter,
  updateCharacter,
  t,
}) => {
  const [query, setQuery] = useState("");

  // Group characters by anime name. Preserve original order within a group.
  // Filter is applied per-group so empty groups disappear when searching.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (c) => {
      if (!q) return true;
      const haystack = [
        c.name || "",
        c.anime || "",
        c.gimmick || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    };
    const m = new Map();
    characters.forEach((c) => {
      if (!matches(c)) return;
      const key = (c.anime || "Untitled Anime").trim() || "Untitled Anime";
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(c);
    });
    return Array.from(m.entries());
  }, [characters, query]);

  const totalShown = groups.reduce((acc, [, g]) => acc + g.length, 0);

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-10 py-6 md:py-10">
      <header className={`border-b ${t.border} pb-6 mb-8`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <div className={`text-[11px] uppercase tracking-[0.18em] ${t.faint} font-medium`}>
              Anime Moveset Wiki
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mt-1.5">
              Your Roster
            </h1>
            <div className={`text-sm ${t.sub} mt-1.5`}>
              {characters.length} character{characters.length === 1 ? "" : "s"}{" "}
              across {
                new Set(
                  characters.map((c) => (c.anime || "Untitled").trim() || "Untitled")
                ).size
              }{" "}
              source
              {new Set(
                characters.map((c) => (c.anime || "Untitled").trim() || "Untitled")
              ).size === 1
                ? ""
                : "s"}
              . Click any card to dive into its moveset.
            </div>
          </div>
          <button
            onClick={addCharacter}
            className={`text-sm px-3 py-2 rounded-md border ${t.border} ${t.hover} inline-flex items-center gap-1.5 ${t.accent} shrink-0`}
          >
            <Plus size={14} /> New character
          </button>
        </div>

        {characters.length > 0 && (
          <div className="mt-5 flex items-center gap-2">
            <div
              className={`flex items-center gap-2 flex-1 rounded-md border ${t.border} ${t.surface} px-3 py-1.5 max-w-md`}
            >
              <Search size={13} className={t.faint} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search characters, anime, gimmicks…"
                className="flex-1 bg-transparent outline-none text-sm"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className={`${t.faint} ${t.hover} rounded p-0.5`}
                  title="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            {query && (
              <span className={`text-[11px] ${t.faint}`}>
                {totalShown} match{totalShown === 1 ? "" : "es"}
              </span>
            )}
          </div>
        )}
      </header>

      {characters.length === 0 ? (
        <div
          className={`rounded-xl border border-dashed ${t.border} ${t.soft} py-16 flex flex-col items-center justify-center gap-3 ${t.faint}`}
        >
          <User2 size={28} />
          <div className="text-sm">
            No characters yet. Add one to start building a moveset.
          </div>
          <button
            onClick={addCharacter}
            className={`mt-2 text-sm px-4 py-2 rounded-md border ${t.border} ${t.hover} inline-flex items-center gap-1`}
          >
            <Plus size={14} /> Add character
          </button>
        </div>
      ) : groups.length === 0 ? (
        <div
          className={`rounded-xl border border-dashed ${t.border} ${t.soft} py-12 flex flex-col items-center justify-center gap-2 ${t.faint}`}
        >
          <Search size={22} />
          <div className="text-sm">
            No characters match{" "}
            <span className={t.sub}>"{query}"</span>.
          </div>
          <button
            onClick={() => setQuery("")}
            className={`mt-1 text-xs px-3 py-1.5 rounded-md border ${t.border} ${t.hover}`}
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          {groups.map(([anime, group]) => (
            <section key={anime}>
              <div
                className={`flex items-baseline justify-between mb-4 pb-2 border-b ${t.subBorder}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Tv size={13} className={t.accent} />
                  <h2 className="text-[13px] font-semibold tracking-tight uppercase">
                    {anime}
                  </h2>
                  <span
                    className={`text-[10px] uppercase tracking-wider ${t.faint} ml-1`}
                  >
                    {group.length} character{group.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.map((c) => (
                  <AnimeRosterCard
                    key={c.id}
                    character={c}
                    onOpen={() => selectCharacter(c.id)}
                    onRemove={() => removeCharacter(c.id)}
                    updateCharacter={updateCharacter}
                    t={t}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

/* ===========================================================================
 * Accent Picker — preset swatches + native <input type="color"> for custom.
 * ======================================================================== */

const AccentPicker = ({ accent, setAccent, t }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Pick accent color"
        className={`p-1.5 rounded ${t.hover} flex items-center gap-1.5`}
      >
        <span
          className="w-4 h-4 rounded-full border border-black/10"
          style={{ backgroundColor: accent }}
        />
      </button>
      {open && (
        <div
          className={`absolute bottom-full right-0 mb-2 w-[220px] rounded-lg border ${t.border} ${t.surface} shadow-lg p-3 z-30`}
        >
          <div className={`text-[10px] uppercase tracking-wider ${t.faint} mb-2`}>
            Accent color
          </div>
          <div className="grid grid-cols-8 gap-1.5">
            {ACCENT_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => setAccent(c)}
                className="w-5 h-5 rounded-full border border-black/10 relative"
                style={{ backgroundColor: c }}
                title={c}
              >
                {accent.toLowerCase() === c.toLowerCase() && (
                  <span className="absolute inset-0 rounded-full ring-2 ring-white/80" />
                )}
              </button>
            ))}
          </div>
          <div className={`flex items-center gap-2 mt-3 pt-3 border-t ${t.subBorder}`}>
            <label className={`text-[11px] ${t.sub} flex-1`}>Custom</label>
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0"
            />
            <input
              value={accent}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setAccent(v);
              }}
              placeholder="#ef4444"
              className={`w-20 font-mono text-[11px] px-2 py-1 rounded border ${t.border} ${t.inputBg} outline-none`}
            />
          </div>
          <button
            onClick={() => setAccent(DEFAULT_ACCENT)}
            className={`mt-2 w-full text-[11px] px-2 py-1 rounded ${t.hover} ${t.sub}`}
          >
            Reset to default
          </button>
        </div>
      )}
    </div>
  );
};

/* ===========================================================================
 * Variant Editor
 * ======================================================================== */

const VariantEditor = ({
  character,
  moveKey,
  variant,
  updateCharacter,
  t,
}) => {
  const move = character.moves[moveKey];
  const slot = DEFAULT_SLOTS.find((s) => s.key === moveKey);

  const updateMove = (m) =>
    updateCharacter({
      ...character,
      moves: { ...character.moves, [moveKey]: m },
    });

  const updateVariant = (updated) =>
    updateMove({
      ...move,
      variants: move.variants.map((v) => (v.id === updated.id ? updated : v)),
    });

  const SlotIcon = slot.isFinisher
    ? move.finisherKind === "Ultimate"
      ? Star
      : Sparkles
    : iconForVariant(variant);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`w-8 h-8 rounded-md flex items-center justify-center ${t.accentBg} ${t.accent}`}
        >
          <SlotIcon size={16} />
        </div>
        <div className={`text-[11px] uppercase tracking-wider ${t.faint}`}>
          {slot.isFinisher
            ? `${move.finisherKind || "Awakening"} · ${variant.tag}`
            : `${slot.label} · ${variant.tag}`}
        </div>

        {slot.isFinisher && (
          <div className="ml-auto flex items-center gap-1">
            {["Awakening", "Ultimate"].map((kind) => (
              <button
                key={kind}
                onClick={() =>
                  updateMove({ ...move, finisherKind: kind })
                }
                className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                  move.finisherKind === kind ? t.chipActive : t.chipIdle
                }`}
              >
                {kind}
              </button>
            ))}
          </div>
        )}
      </div>

      <input
        value={move.name}
        onChange={(e) => updateMove({ ...move, name: e.target.value })}
        placeholder="Move name"
        className={`w-full bg-transparent outline-none text-3xl font-semibold tracking-tight rounded px-2 py-1 ${t.hover}`}
      />

      {/* Media gallery moved above the description — so references sit
       * at the top of the editor where you read the move from. */}
      <div className="mt-4">
        <MediaGallery variant={variant} updateVariant={updateVariant} t={t} />
      </div>

      <Area
        value={move.description}
        onChange={(v) => updateMove({ ...move, description: v })}
        placeholder="Short description of what this move does and when you'd reach for it."
        rows={2}
        t={t}
        className={`mt-4 text-sm ${t.sub}`}
      />

      <div className="mt-4 flex items-center gap-2 px-2">
        <Layers size={13} className={t.faint} />
        <span className={`text-[11px] uppercase tracking-wider ${t.faint}`}>
          Variant tag
        </span>
        <select
          value={variant.tag}
          onChange={(e) => updateVariant({ ...variant, tag: e.target.value })}
          className={`text-sm bg-transparent outline-none rounded px-2 py-1 border ${t.border} ${t.inputBg}`}
        >
          {[...new Set([...VARIANT_TAGS, variant.tag])].map((tg) => (
            <option key={tg} value={tg}>
              {tg}
            </option>
          ))}
        </select>
      </div>

      {variant.tag === "Enemy conditioned (if enemy is wall slamed, downslamed, uptlitled or spinning)" && (
        <div className="mt-4 px-2">
          <div className="flex items-center gap-2 mb-2">
            <Target size={13} className={t.faint} />
            <span className={`text-[11px] uppercase tracking-wider ${t.faint}`}>
              Enemy Conditions
            </span>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {(variant.conditions || []).map((cond) => (
              <div
                key={cond}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border ${t.accentBg} ${t.accent} ${t.border}`}
              >
                {cond}
                <button
                  onClick={() =>
                    updateVariant({
                      ...variant,
                      conditions: variant.conditions.filter((c) => c !== cond),
                    })
                  }
                  className="hover:opacity-70 transition-opacity"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            {(variant.conditions || []).length === 0 && (
              <span className={`text-xs ${t.faint} italic`}>No conditions added yet.</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {ENEMY_CONDITIONS.filter(
              (c) => !(variant.conditions || []).includes(c)
            ).map((cond) => (
              <button
                key={cond}
                onClick={() =>
                  updateVariant({
                    ...variant,
                    conditions: [...(variant.conditions || []), cond],
                  })
                }
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${t.chipIdle} hover:border-current`}
              >
                + {cond}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 mb-4">
        <TypePicker variant={variant} updateVariant={updateVariant} t={t} />
      </div>

      <div className="space-y-3">
        <SectionGroup label="Definition" t={t} />
        <ClassificationSection variant={variant} updateVariant={updateVariant} t={t} />
        <SpecSheet variant={variant} updateVariant={updateVariant} t={t} />
        <VariableInteractionsSection
          variant={variant}
          updateVariant={updateVariant}
          character={character}
          t={t}
        />
        <ReferencesSection
          owner={variant}
          references={variant.references || []}
          updateReferences={(refs) =>
            updateVariant({ ...variant, references: refs })
          }
          character={character}
          t={t}
          excludeVariantId={variant.id}
        />

        {variant.type === "Special" && variant.subtype === "Awakening" && (
          <>
            <SectionGroup label="Sub-Moveset" t={t} />
            <SubMovesetSection
              variant={variant}
              updateVariant={updateVariant}
              character={character}
              t={t}
            />
          </>
        )}

        <SectionGroup label="Animation" t={t} />
        <KeyframeMarkers variant={variant} updateVariant={updateVariant} t={t} />

        <SectionGroup label="Notes" t={t} />
        <FlavorBlock variant={variant} updateVariant={updateVariant} t={t} />
        <ComboSynergy variant={variant} updateVariant={updateVariant} t={t} />
        <ScalingLogic variant={variant} updateVariant={updateVariant} t={t} />
      </div>
    </div>
  );
};

/* ===========================================================================
 * App
 * ======================================================================== */

export default function App() {
  const [dark, setDark] = useState(true);
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const t = useMemo(() => makeTheme(dark), [dark]);

  const [characters, setCharacters] = useState(seed);
  const [view, setView] = useState("roster"); // "roster" | "character"
  const [activeCharacterId, setActiveCharacterId] = useState(
    () => characters[0]?.id
  );
  const [activeMoveKey, setActiveMoveKey] = useState("move1");
  const [activeVariantId, setActiveVariantId] = useState(
    () => characters[0]?.moves.move1.variants[0]?.id
  );
  const [expandedMoves, setExpandedMoves] = useState(() => new Set(["move1"]));
  const [minimizedCharacters, setMinimizedCharacters] = useState(() => new Set());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [user, setUser] = useState(null);
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        setIsSyncing(true);
        const docRef = doc(db, "users", u.uid);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.characters && data.characters.length > 0) {
            setCharacters(data.characters);
          }
          if (data.accent) setAccent(data.accent);
          if (data.dark !== undefined) setDark(data.dark);
        } else {
          await setDoc(docRef, { characters, accent, dark });
        }
        setIsSyncing(false);
      }
      setIsAuthLoaded(true);
    });
    return unsub;
  }, []);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (user && !isSyncing) {
      const docRef = doc(db, "users", user.uid);
      setDoc(docRef, { characters, accent, dark }, { merge: true });
    }
  }, [characters, accent, dark, user, isSyncing]);

  useEffect(() => {
    const bgColor = dark ? "#0a0a0a" : "#ffffff";
    document.documentElement.style.backgroundColor = bgColor;
    document.body.style.backgroundColor = bgColor;
  }, [dark]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const character = characters.find((c) => c.id === activeCharacterId);
  const move =
    character?.moves[activeMoveKey] ?? character?.moves[character?.enabledSlots[0]];
  const variant =
    move?.variants.find((v) => v.id === activeVariantId) ?? move?.variants[0];

  const toggleExpanded = (key) =>
    setExpandedMoves((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleMinimize = (id) =>
    setMinimizedCharacters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const updateCharacter = (updated) => {
    setCharacters((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
  };

  const selectCharacter = (id) => {
    const c = characters.find((x) => x.id === id);
    if (!c) return;
    setActiveCharacterId(id);
    const firstSlot = c.enabledSlots[0];
    setActiveMoveKey(firstSlot);
    setActiveVariantId(c.moves[firstSlot].variants[0]?.id);
    setExpandedMoves(new Set([firstSlot]));
    setView("character");
  };

  const goToRoster = () => setView("roster");

  const addCharacter = () => {
    const c = makeCharacter();
    setCharacters((prev) => [...prev, c]);
    setActiveCharacterId(c.id);
    setActiveMoveKey("move1");
    setActiveVariantId(c.moves.move1.variants[0]?.id);
    setExpandedMoves(new Set(["move1"]));
    setView("character");
  };

  const removeCharacter = (id) => {
    setCharacters((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (id === activeCharacterId) {
        if (next[0]) {
          setActiveCharacterId(next[0].id);
          const firstSlot = next[0].enabledSlots[0];
          setActiveMoveKey(firstSlot);
          setActiveVariantId(next[0].moves[firstSlot].variants[0]?.id);
          setExpandedMoves(new Set([firstSlot]));
        } else {
          setActiveCharacterId(null);
          setView("roster");
        }
      }
      return next;
    });
    setMinimizedCharacters((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  };

  return (
    <div
      className={`min-h-screen font-sans ${t.page}`}
      style={{ "--accent": accent }}
    >
      {/* Inject the accent CSS classes into the document once. */}
      <style>{ACCENT_CSS}</style>

      {/* Mobile Top Bar */}
      <div className={`md:hidden flex items-center justify-between p-3 border-b ${t.border} ${t.surface} sticky top-0 z-40`}>
        <div className="flex items-center gap-2 font-semibold">
          <div className={`w-7 h-7 rounded flex items-center justify-center ${t.accentBg} ${t.accent}`}>
            <Sparkles size={14} />
          </div>
          <span className="text-sm">Moveset Maker</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(true)} className={`p-1.5 rounded ${t.hover}`}>
          <Menu size={20} />
        </button>
      </div>

      <div className="flex flex-col md:flex-row">
        {/* Sidebar Overlay for Mobile */}
        {isMobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black/60 z-50 md:hidden backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
        
        {/* Sidebar */}
        <aside
          className={`
            fixed inset-y-0 left-0 z-50 w-[85%] max-w-[320px] shrink-0 border-r ${t.sidebar} h-screen flex flex-col
            transform transition-transform duration-300 ease-in-out bg-inherit
            ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
            md:relative md:translate-x-0 md:w-[300px] md:sticky md:top-0 md:z-auto
          `}
        >
          <div className={`px-4 py-4 border-b ${t.border} flex items-center justify-between`}>
            <button
              onClick={() => {
                goToRoster();
                setIsMobileMenuOpen(false);
              }}
              className="flex items-center gap-2 min-w-0 flex-1 text-left"
              title="Back to roster"
            >
              <div
                className={`w-8 h-8 rounded-md flex items-center justify-center ${t.accentBg} ${t.accent} shrink-0`}
              >
                <Sparkles size={16} />
              </div>
              <div className="min-w-0">
                <div className={`text-[11px] uppercase tracking-wider ${t.faint}`}>
                  Anime Moveset Wiki
                </div>
                <div className="font-semibold truncate text-sm">
                  Roblox · {characters.length} character{characters.length === 1 ? "" : "s"}
                </div>
              </div>
            </button>
            <button 
              className={`md:hidden p-1.5 rounded ${t.hover} ml-2`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <X size={18} className={t.faint} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <RosterSection
              characters={characters}
              activeCharacterId={view === "character" ? activeCharacterId : null}
              selectCharacter={(id) => {
                selectCharacter(id);
                setIsMobileMenuOpen(false);
              }}
              addCharacter={() => {
                addCharacter();
                setIsMobileMenuOpen(false);
              }}
              removeCharacter={removeCharacter}
              minimizedCharacters={minimizedCharacters}
              toggleMinimize={toggleMinimize}
              t={t}
            />
            {view === "character" && character && (
              <MoveTree
                character={character}
                updateCharacter={updateCharacter}
                activeMoveKey={activeMoveKey}
                setActiveMoveKey={setActiveMoveKey}
                activeVariantId={activeVariantId}
                setActiveVariantId={setActiveVariantId}
                expandedMoves={expandedMoves}
                toggleExpanded={toggleExpanded}
                t={t}
              />
            )}
          </div>

          <div className={`border-t ${t.border} p-3 flex flex-col gap-2`}>
            {user ? (
              <div className={`flex items-center justify-between text-xs ${t.faint}`}>
                <span className="truncate">Cloud Save: On (${user.email || 'Logged in'})</span>
                <button onClick={handleLogout} className={`underline ${t.hover} rounded px-1`}>Logout</button>
              </div>
            ) : (
              <button
                onClick={handleLogin}
                className={`w-full text-xs py-1.5 rounded-md border ${t.border} ${t.hover} ${t.text} font-medium flex items-center justify-center gap-2`}
              >
                Sign in for Cloud Save
              </button>
            )}
            <div className="flex items-center justify-between gap-1">
            <button
              onClick={goToRoster}
              className={`text-[11px] ${t.faint} ${t.hover} rounded px-1.5 py-1 truncate`}
              title="Back to roster"
            >
              {view === "roster" ? "Roster view" : "← Roster"}
            </button>
            <div className="flex items-center gap-1">
              <AccentPicker accent={accent} setAccent={setAccent} t={t} />
              <button
                onClick={() => setDark((v) => !v)}
                title="Toggle theme"
                className={`p-1.5 rounded ${t.hover}`}
              >
                {dark ? <Sun size={14} /> : <Moon size={14} />}
              </button>
            </div>
          </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          {view === "roster" ? (
            <RosterScreen
              characters={characters}
              selectCharacter={selectCharacter}
              addCharacter={addCharacter}
              removeCharacter={removeCharacter}
              updateCharacter={updateCharacter}
              t={t}
            />
          ) : (
            <div className="max-w-4xl mx-auto px-4 md:px-10 py-6 md:py-12">
            {character ? (
              <>
                <CharacterHeader
                  goToRoster={goToRoster}
                  character={character}
                  updateCharacter={updateCharacter}
                  t={t}
                />
                {variant ? (
                  <VariantEditor
                    character={character}
                    moveKey={activeMoveKey}
                    variant={variant}
                    updateCharacter={updateCharacter}
                    t={t}
                  />
                ) : (
                  <div className={`text-sm ${t.sub}`}>
                    Select a variant from the sidebar to begin editing.
                  </div>
                )}
                <footer
                  className={`mt-16 pt-6 border-t ${t.border} text-xs ${t.faint} flex items-center justify-between`}
                >
                  <span>
                    {character.name} · {character.anime}
                  </span>
                  <span>
                    {character.enabledSlots.reduce(
                      (acc, k) => acc + character.moves[k].variants.length,
                      0
                    )}{" "}
                    variants across {character.enabledSlots.length} slots
                  </span>
                </footer>
              </>
            ) : (
              <div className={`text-sm ${t.sub} flex flex-col items-center justify-center h-[60vh] gap-3`}>
                <div>No characters in roster.</div>
                <button
                  onClick={addCharacter}
                  className={`text-sm px-4 py-2 rounded-md border ${t.border} ${t.hover} inline-flex items-center gap-1`}
                >
                  <Plus size={14} /> Add character
                </button>
              </div>
            )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}