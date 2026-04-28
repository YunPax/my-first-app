import { useState, useMemo, useRef, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
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
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";

/* ===========================================================================
 * Constants
 * ======================================================================== */

const VARIANT_TAGS = ["Ground", "Aim", "Aerial", "Crouch", "Stun", "Dash-cancel"];

const ELEMENTS = [
  "None",
  "Fire",
  "Ice",
  "Lightning",
  "Wind",
  "Earth",
  "Water",
  "Light",
  "Dark",
  "Void",
  "Spirit",
];

const STATUSES = [
  "None",
  "Burn",
  "Freeze",
  "Shock",
  "Bleed",
  "Poison",
  "Stun",
  "Slow",
  "Silence",
  "Knockdown",
  "Launch",
  "Disarm",
];

const MOVE_TYPES = {
  Attack: {
    icon: Swords,
    blurb: "Standard melee strike with a hitbox.",
    classification: [
      { key: "element", label: "Element", options: ELEMENTS },
      { key: "status", label: "Status Affliction", options: STATUSES },
      {
        key: "hitProperty",
        label: "Hit Property",
        options: ["High", "Mid", "Low", "Overhead", "Unblockable"],
      },
      {
        key: "onHit",
        label: "On-Hit Reaction",
        options: ["Hitstun", "Knockback", "Launcher", "Knockdown", "Wall Splat"],
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
    defaultMarkers: [
      { name: "WindupEnd", time: "0.20", track: "player" },
      { name: "HitboxStart", time: "0.30", track: "player" },
      { name: "HitboxEnd", time: "0.50", track: "player" },
      { name: "RecoveryEnd", time: "1.20", track: "player" },
    ],
  },
  Special: {
    icon: Sparkles,
    blurb: "A unique signature ability that doesn't fit any other type.",
    classification: [
      { key: "element", label: "Element", options: ELEMENTS },
      { key: "status", label: "Status Affliction", options: STATUSES },
      {
        key: "category",
        label: "Special Category",
        options: ["Offensive", "Defensive", "Setup", "Mobility", "Utility"],
      },
      {
        key: "interruptible",
        label: "Interruptible?",
        options: ["No", "Yes — by attack", "Yes — by parry"],
      },
    ],
    spec: [
      { key: "resourceCost", label: "Resource Cost", placeholder: "25 Spirit" },
      { key: "cooldown", label: "Cooldown (s)", placeholder: "8" },
      { key: "damage", label: "Damage (optional)", placeholder: "—" },
      { key: "effectDuration", label: "Effect Duration (s)", placeholder: "3" },
      { key: "stun", label: "Stun (optional)", kind: "stun" },
    ],
    defaultMarkers: [
      { name: "EffectStart", time: "0.30", track: "player" },
      { name: "EffectEnd", time: "1.00", track: "player" },
      { name: "RecoveryEnd", time: "1.40", track: "player" },
    ],
  },
  Projectile: {
    icon: Target,
    blurb: "Spawns a travelling projectile.",
    classification: [
      { key: "element", label: "Element", options: ELEMENTS },
      { key: "status", label: "Status Affliction", options: STATUSES },
      {
        key: "behavior",
        label: "Projectile Behavior",
        options: ["Straight", "Homing", "Arcing", "Boomerang", "Pierce"],
      },
      {
        key: "destructible",
        label: "Destructible?",
        options: ["Yes — any hit", "Only by parry", "No"],
      },
    ],
    spec: [
      { key: "damage", label: "Damage on Hit", placeholder: "20" },
      { key: "speed", label: "Projectile Speed (studs/s)", placeholder: "60" },
      { key: "lifetime", label: "Lifetime (s)", placeholder: "2" },
      { key: "cooldown", label: "Cooldown (s)", placeholder: "3" },
      { key: "endlag", label: "Endlag", kind: "endlag" },
      { key: "stun", label: "Stun", kind: "stun" },
      { key: "hitbox", label: "Hitbox", kind: "hitbox" },
    ],
    defaultMarkers: [
      { name: "WindupEnd", time: "0.30", track: "player" },
      { name: "ProjectileSpawn", time: "0.40", track: "player" },
      { name: "RecoveryEnd", time: "0.90", track: "player" },
    ],
  },
  Hitscan: {
    icon: Crosshair,
    blurb: "Instantaneous ranged strike — no travel time.",
    classification: [
      { key: "element", label: "Element", options: ELEMENTS },
      { key: "status", label: "Status Affliction", options: STATUSES },
      {
        key: "blockable",
        label: "Blockable?",
        options: ["Yes", "No", "Only with parry"],
      },
    ],
    spec: [
      { key: "damage", label: "Damage", placeholder: "15" },
      { key: "range", label: "Range (studs)", placeholder: "80" },
      { key: "cooldown", label: "Cooldown (s)", placeholder: "1" },
      { key: "endlag", label: "Endlag", kind: "endlag" },
      { key: "stun", label: "Stun", kind: "stun" },
    ],
    defaultMarkers: [
      { name: "AimReady", time: "0.20", track: "player" },
      { name: "Fire", time: "0.35", track: "player" },
      { name: "RecoveryEnd", time: "0.70", track: "player" },
    ],
  },
  Counter: {
    icon: Shield,
    blurb: "Reactive ability triggered by an incoming attack.",
    classification: [
      { key: "element", label: "Counter Element", options: ELEMENTS },
      { key: "status", label: "Status on Trigger", options: STATUSES },
      {
        key: "counters",
        label: "Counters",
        options: ["Melee only", "Projectile only", "Both", "Throws"],
      },
      {
        key: "outcome",
        label: "On Successful Counter",
        options: ["Stagger", "Reposition", "Damage burst", "Disarm"],
      },
    ],
    spec: [
      { key: "counterWindow", label: "Counter Window (s)", placeholder: "0.40" },
      { key: "reactionDamage", label: "Reaction Damage", placeholder: "30" },
      { key: "cooldown", label: "Cooldown (s)", placeholder: "12" },
      { key: "stun", label: "Stun on Trigger", kind: "stun" },
    ],
    defaultMarkers: [
      { name: "ParryWindowStart", time: "0.05", track: "player" },
      { name: "ParryWindowEnd", time: "0.45", track: "player" },
      { name: "ReactionTrigger", time: "0.50", track: "player" },
    ],
  },
  Movement: {
    icon: Wind,
    blurb: "Mobility tool — dash, dodge, teleport.",
    classification: [
      {
        key: "direction",
        label: "Direction",
        options: ["Forward", "Back", "8-way", "Towards Target"],
      },
      {
        key: "iframes",
        label: "I-frames",
        options: ["None", "Partial", "Full"],
      },
      {
        key: "cancellable",
        label: "Cancellable Into",
        options: ["Any move", "Specials only", "Nothing"],
      },
    ],
    spec: [
      { key: "distance", label: "Distance (studs)", placeholder: "20" },
      { key: "speed", label: "Speed (studs/s)", placeholder: "80" },
      { key: "iframeWindow", label: "I-frame Window (s)", placeholder: "0.30" },
      { key: "cooldown", label: "Cooldown (s)", placeholder: "4" },
      { key: "endlag", label: "Endlag", kind: "endlag" },
    ],
    defaultMarkers: [
      { name: "DashStart", time: "0.10", track: "player" },
      { name: "InvulStart", time: "0.10", track: "player" },
      { name: "InvulEnd", time: "0.40", track: "player" },
      { name: "DashEnd", time: "0.45", track: "player" },
    ],
  },
  Grab: {
    icon: Crosshair,
    blurb: "Command grab or cinematic finisher.",
    classification: [
      { key: "element", label: "Element", options: ELEMENTS },
      { key: "status", label: "Status Affliction", options: STATUSES },
      {
        key: "tech",
        label: "Tech-able?",
        options: ["No", "Yes — break window", "Only with parry"],
      },
      {
        key: "cutscene",
        label: "Cutscene Style",
        options: ["None", "Cinematic"],
      },
    ],
    spec: [
      { key: "grabRange", label: "Grab Range (studs)", placeholder: "5" },
      { key: "damage", label: "Total Damage", placeholder: "60" },
      { key: "cinematicLength", label: "Cinematic Length (s)", placeholder: "3" },
      { key: "cooldown", label: "Cooldown (s)", placeholder: "15" },
      { key: "stun", label: "Stun on Release", kind: "stun" },
      { key: "hitbox", label: "Grab Hitbox", kind: "hitbox" },
    ],
    defaultMarkers: [
      { name: "GrabHitbox", time: "0.30", track: "player" },
      { name: "CinematicStart", time: "0.40", track: "player" },
      { name: "CinematicEnd", time: "3.40", track: "player" },
      { name: "VictimGrabbed", time: "0.30", track: "enemy" },
      { name: "VictimReact", time: "0.60", track: "enemy" },
      { name: "VictimRelease", time: "3.40", track: "enemy" },
      { name: "CameraZoomIn", time: "0.40", track: "camera" },
      { name: "CameraOrbit", time: "1.20", track: "camera" },
      { name: "CameraReset", time: "3.40", track: "camera" },
    ],
  },
  Buff: {
    icon: Star,
    blurb: "Self-buff or stat modifier — no direct damage.",
    classification: [
      {
        key: "scope",
        label: "Buff Scope",
        options: ["Self", "Allies", "AoE around self"],
      },
      {
        key: "stackable",
        label: "Stackable?",
        options: ["No", "Refresh duration", "Yes — N stacks"],
      },
    ],
    spec: [
      { key: "duration", label: "Buff Duration (s)", placeholder: "10" },
      { key: "effect", label: "Effect Magnitude", placeholder: "+25% damage" },
      { key: "resourceCost", label: "Resource Cost", placeholder: "40 Spirit" },
      { key: "cooldown", label: "Cooldown (s)", placeholder: "20" },
    ],
    defaultMarkers: [
      { name: "BuffApply", time: "0.30", track: "player" },
      { name: "AnimationEnd", time: "0.80", track: "player" },
    ],
  },
  Transformation: {
    icon: Flame,
    blurb: "Form change — alters stats or unlocks new moves.",
    classification: [
      {
        key: "trigger",
        label: "Trigger Condition",
        options: ["Manual", "On low HP", "Meter full", "Story flag"],
      },
      {
        key: "effect",
        label: "Form Effect",
        options: ["New moveset", "Stat boost", "Both", "Unique gauge"],
      },
    ],
    spec: [
      { key: "duration", label: "Form Duration (s)", placeholder: "30" },
      { key: "resourceCost", label: "Resource Cost", placeholder: "100 Spirit" },
      { key: "cooldown", label: "Cooldown after end (s)", placeholder: "60" },
    ],
    defaultMarkers: [
      { name: "TransformStart", time: "0.00", track: "player" },
      { name: "TransformPeak", time: "1.50", track: "player" },
      { name: "TransformEnd", time: "2.50", track: "player" },
    ],
  },
};

const MOVE_TYPE_KEYS = Object.keys(MOVE_TYPES);

const tracksFor = (variant) => {
  if (variant.type === "Grab") {
    const hasCutscene = variant.classification?.cutscene === "Cinematic";
    return hasCutscene
      ? ["player", "enemy", "camera"]
      : ["player", "enemy"];
  }
  return ["player"];
};

const TRACK_META = {
  player: { label: "Player Animation", Icon: User2 },
  enemy: { label: "Enemy Reaction", Icon: Skull },
  camera: { label: "Camera Cutscene", Icon: Camera },
};

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

const makeVariant = (tag = "Ground", type = "Attack") => ({
  id: newId(),
  tag,
  type,
  classification: {},
  spec: {},
  markers: seedMarkersForType(type),
  media: [],
  flavor: "",
  combo: "",
  scaling: "",
});

const makeMove = (type = "Attack") => ({
  name: "",
  description: "",
  variants: [makeVariant("Ground", type)],
});

const makeFinisher = (kind = "Awakening") => ({
  ...makeMove("Special"),
  finisherKind: kind,
});

const makeCharacter = (overrides = {}) => ({
  id: newId(),
  name: "New Character",
  anime: "Untitled Anime",
  gimmick: "",
  enabledSlots: ["move1", "move2", "move3", "move4", "utility", "awakening"],
  moves: {
    move1: makeMove("Attack"),
    move2: makeMove("Attack"),
    move3: makeMove("Projectile"),
    move4: makeMove("Special"),
    utility: makeMove("Movement"),
    awakening: makeFinisher("Awakening"),
  },
  ...overrides,
});

const seed = () => {
  const yumi = makeCharacter({
    name: "Yumi Kuronagi",
    anime: "Spectral Blade Chronicles",
    gimmick:
      "Spirit Meter (0–100): builds 8 on hit, 4 on block. At 100, Yumi enters Azure Bloom — every special gains a follow-up and the Awakening unlocks. Spending 50% Spirit enables Phantom Step (i-frame dash-cancel) out of any grounded special on hit.",
  });
  yumi.moves.move1.name = "Crescent Slash";
  yumi.moves.move1.description = "A quick horizontal slash that opens combo strings.";
  const yv = yumi.moves.move1.variants[0];
  yv.classification = {
    element: "None",
    status: "None",
    hitProperty: "Mid",
    onHit: "Hitstun",
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
  yv.flavor =
    "Single flickering arc of moonlight. Camera whip-pans to a low side profile on impact. SFX: sharp steel-ring layered with a wind-cutting whoosh. VFX: cyan crescent trail dissolving into sakura petals.";
  yv.combo = "Cancels into: Move 2, Move 3, any Dash. Links into itself once.";
  yv.scaling = "First hitter: 100%. Each subsequent hit: −10%. Floors at 30%.";
  yumi.moves.move2.name = "Moonlit Thrust";
  yumi.moves.move2.description = "Forward lunge with i-frames mid-animation.";
  yumi.moves.move3.name = "Void Cutter";
  yumi.moves.move3.description = "Chargeable crescent projectile.";
  yumi.moves.move4.name = "Eclipse Rush";
  yumi.moves.move4.description = "Command grab cloaked in shadow.";
  yumi.moves.move4.variants[0] = makeVariant("Ground", "Grab");
  yumi.moves.move4.variants[0].classification = {
    element: "Dark",
    status: "Knockdown",
    tech: "No",
    cutscene: "Cinematic",
  };
  yumi.moves.utility.name = "Phantom Veil";
  yumi.moves.utility.description = "Teleport forward leaving a decoy.";
  yumi.moves.awakening.name = "Samsara · Final Moon";
  yumi.moves.awakening.description = "Cinematic finisher across three astral planes.";
  yumi.moves.awakening.finisherKind = "Ultimate";

  const asahi = makeCharacter({
    name: "Asahi Tenma",
    anime: "Bonfire Country",
    gimmick:
      "Heat Stacks (0–5): each connected projectile adds a stack. At 3, projectiles ignite. At 5, gains a one-time free Awakening cast.",
  });
  asahi.moves.move1.name = "Ember Jab";
  asahi.moves.move2.name = "Cinder Wave";
  asahi.moves.move2.variants[0] = makeVariant("Ground", "Projectile");
  asahi.moves.move3.name = "Solar Flare";
  asahi.moves.move4.name = "Kindle Counter";
  asahi.moves.move4.variants[0] = makeVariant("Ground", "Counter");
  asahi.enabledSlots = asahi.enabledSlots.filter((s) => s !== "utility");
  asahi.moves.awakening.name = "Phoenix Bloom";
  asahi.moves.awakening.finisherKind = "Awakening";

  return [yumi, asahi];
};

/* ===========================================================================
 * Luau export
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

const CLASSIFICATION_EMIT = {
  element: "Element",
  status: "Status",
  hitProperty: "HitProperty",
  onHit: "OnHit",
  behavior: "Behavior",
  destructible: "Destructible",
  blockable: "Blockable",
  tech: "Techable",
  cutscene: "Cutscene",
  direction: "Direction",
  iframes: "IFrames",
  cancellable: "CancellableInto",
  counters: "Counters",
  outcome: "Outcome",
  category: "Category",
  interruptible: "Interruptible",
  scope: "Scope",
  stackable: "Stackable",
  trigger: "Trigger",
  effect: "FormEffect",
};

const characterToLuau = (character) => {
  const slotMoves = DEFAULT_SLOTS.filter((s) =>
    character.enabledSlots.includes(s.key)
  ).map((s) => ({ slot: s, move: character.moves[s.key] }));

  const cooldowns = [];
  const damages = [];
  const endlags = [];
  const stuns = [];

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
  push();
  push(`\tMoveset = {`);

  for (const { slot, move } of slotMoves) {
    const moveKey = luaIdent(move.name || slot.label);
    const displayKey = luaKey(move.name || slot.label);

    push(`\t\t${displayKey} = {`);
    const primaryType = move.variants[0]?.type || "Attack";
    push(`\t\t\tMoveType = ${luaString(primaryType)},`);
    if (move.description) push(`\t\t\tDescription = ${luaString(move.description)},`);
    if (slot.isFinisher) push(`\t\t\tFinisherKind = ${luaString(move.finisherKind || "Awakening")},`);
    push(`\t\t\tSlot = ${luaString(slot.label)},`);
    push(`\t\t\tVariants = {`);

    for (const v of move.variants) {
      const varKey = luaIdent(v.tag);
      const full = `${moveKey}_${varKey}`;
      const sp = v.spec || {};

      push(`\t\t\t\t${varKey} = {`);

      for (const [fieldKey, emitName] of Object.entries(CLASSIFICATION_EMIT)) {
        const val = v.classification?.[fieldKey];
        if (val && val !== "None") {
          push(`\t\t\t\t\t${emitName} = ${luaString(val)},`);
        }
      }

      if (sp.damage) push(`\t\t\t\t\tDamage = Damages.${full},`);
      if (sp.reactionDamage) push(`\t\t\t\t\tReactionDamage = Damages.${full},`);
      if (hasStunData(sp.stun)) push(`\t\t\t\t\tStun = Stuns.${full},`);
      if (sp.cooldown) push(`\t\t\t\t\tCooldown = Cooldowns.${full},`);
      if (hasEndlagData(sp.endlag)) push(`\t\t\t\t\tEndlag = Endlag.${full},`);

      if (sp.knockback) push(`\t\t\t\t\tKnockback = ${luaNum(sp.knockback)},`);
      if (sp.windup) push(`\t\t\t\t\tWindup = ${luaNum(sp.windup)},`);
      if (sp.speed) push(`\t\t\t\t\tSpeed = ${luaNum(sp.speed)},`);
      if (sp.lifetime) push(`\t\t\t\t\tLifetime = ${luaNum(sp.lifetime)},`);
      if (sp.range) push(`\t\t\t\t\tRange = ${luaNum(sp.range)},`);
      if (sp.distance) push(`\t\t\t\t\tDistance = ${luaNum(sp.distance)},`);
      if (sp.iframeWindow) push(`\t\t\t\t\tIFrameWindow = ${luaNum(sp.iframeWindow)},`);
      if (sp.grabRange) push(`\t\t\t\t\tGrabRange = ${luaNum(sp.grabRange)},`);
      if (sp.cinematicLength) push(`\t\t\t\t\tCinematicLength = ${luaNum(sp.cinematicLength)},`);
      if (sp.counterWindow) push(`\t\t\t\t\tCounterWindow = ${luaNum(sp.counterWindow)},`);
      if (sp.duration) push(`\t\t\t\t\tDuration = ${luaNum(sp.duration)},`);
      if (sp.effectDuration) push(`\t\t\t\t\tEffectDuration = ${luaNum(sp.effectDuration)},`);
      if (sp.effect) push(`\t\t\t\t\tEffectMagnitude = ${luaString(sp.effect)},`);
      if (sp.resourceCost) push(`\t\t\t\t\tResourceCost = ${luaString(sp.resourceCost)},`);

      if (hasHitboxData(sp.hitbox)) {
        const h = sp.hitbox;
        push(`\t\t\t\t\tHitbox = {`);
        if (h.mode === "Radius") {
          push(`\t\t\t\t\t\tRadius = ${luaNum(h.radius)},`);
        } else {
          push(
            `\t\t\t\t\t\tSize = Vector3.new(${luaNum(h.x)}, ${luaNum(h.y)}, ${luaNum(h.z)}),`
          );
          if (h.offsetX || h.offsetY || h.offsetZ) {
            push(
              `\t\t\t\t\t\tOffset = CFrame.new(${luaNum(h.offsetX)}, ${luaNum(h.offsetY)}, ${luaNum(h.offsetZ)}),`
            );
          }
        }
        push(`\t\t\t\t\t},`);
      }

      if (v.markers && v.markers.length) {
        push(`\t\t\t\t\tMarkers = {`);
        for (const m of v.markers) {
          push(
            `\t\t\t\t\t\t{ Name = ${luaString(m.name)}, Time = ${luaNum(m.time)}, Track = ${luaString(m.track || "player")} },`
          );
        }
        push(`\t\t\t\t\t},`);
      }

      if (v.flavor) push(`\t\t\t\t\tFlavor = ${luaString(v.flavor)},`);
      if (v.combo) push(`\t\t\t\t\tCombo = ${luaString(v.combo)},`);
      if (v.scaling) push(`\t\t\t\t\tScaling = ${luaString(v.scaling)},`);

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
 * Theme
 * ======================================================================== */

const ACCENT_PRESETS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
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
    <section className={`border ${t.border} rounded-lg ${t.surface} overflow-hidden`}>
      <div className={`w-full flex items-center gap-2 px-3 py-2.5 ${t.hover}`}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 flex-1 text-left"
        >
          {open ? (
            <ChevronDown size={16} className={t.sub} />
          ) : (
            <ChevronRight size={16} className={t.sub} />
          )}
          {Icon && <Icon size={15} className={t.sub} />}
          <span className="font-medium text-sm">{title}</span>
          {meta && <span className={`ml-2 text-xs ${t.faint}`}>{meta}</span>}
        </button>
        {action}
      </div>
      {open && (
        <div className={`px-4 pb-4 pt-1 border-t ${t.subBorder}`}>{children}</div>
      )}
    </section>
  );
};

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
 * Sync Status Indicator
 * ======================================================================== */

const SyncIndicator = ({ status, t }) => {
  if (status === "loading" || status === "saving") {
    return (
      <span className={`flex items-center gap-1.5 text-[11px] ${t.faint}`}>
        <Loader2 size={11} className="animate-spin" />
        {status === "loading" ? "Loading…" : "Saving…"}
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-green-500">
        <Check size={11} />
        Saved
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-red-500">
        <AlertCircle size={11} />
        Save failed
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className={`flex items-center gap-1.5 text-[11px] ${t.faint}`}>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        Unsaved
      </span>
    );
  }
  return <span className={`text-[11px] ${t.faint}`}>All saved</span>;
};

/* ===========================================================================
 * Media
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
  const displayUrl = item.source === "file" ? convertFileSrc(item.url) : item.url;
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
        />
      );
    }
    if (item.kind === "image") {
      return (
        // eslint-disable-next-line jsx-a11y/alt-text
        <img
          src={displayUrl}
          className="w-full h-full object-contain bg-black/40"
        />
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
    const url = draft.trim();
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
    const results = await Promise.allSettled(
      Array.from(files).map(async (file) => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        const localPath = await invoke("save_media", {
          fileName: file.name,
          data: btoa(binary),
        });
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
  const TypeIcon = MOVE_TYPES[variant.type].icon;
  return (
    <div className={`rounded-xl border ${t.border} ${t.surface} p-4 ${t.accentRing}`}>
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${t.accentBg} ${t.accent}`}
        >
          <TypeIcon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-[11px] uppercase tracking-wider ${t.faint}`}>
            Move Type · sets the rest of this card's structure
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <select
              value={variant.type}
              onChange={(e) => {
                const newType = e.target.value;
                const usingDefaults = variant.markers.every((m) =>
                  MOVE_TYPES[variant.type].defaultMarkers.some(
                    (d) => d.name === m.name && d.time === m.time && d.track === m.track
                  )
                );
                updateVariant({
                  ...variant,
                  type: newType,
                  markers: usingDefaults ? seedMarkersForType(newType) : variant.markers,
                });
              }}
              className={`text-lg font-semibold bg-transparent outline-none ${t.text}`}
            >
              {MOVE_TYPE_KEYS.map((k) => (
                <option key={k} value={k} className={t.inputBg}>
                  {k}
                </option>
              ))}
            </select>
            <ChevronsUpDown size={14} className={t.faint} />
          </div>
          <div className={`text-xs ${t.sub} mt-1`}>
            {MOVE_TYPES[variant.type].blurb}
          </div>
        </div>
      </div>
    </div>
  );
};

const ClassificationSection = ({ variant, updateVariant, t }) => {
  const def = MOVE_TYPES[variant.type];
  return (
    <Toggle title="Classification" icon={Target} t={t} meta={variant.type}>
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

  return (
    <Toggle title="Spec Sheet" icon={Gauge} t={t} meta={variant.type}>
      <div className={`rounded-lg border ${t.border} overflow-hidden`}>
        <table className="w-full text-sm">
          <tbody>
            {def.spec.map((field, i) => {
              const isComposite = !!field.kind;
              return (
                <tr
                  key={field.key}
                  className={
                    i !== def.spec.length - 1 ? `border-b ${t.subBorder}` : ""
                  }
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
            })}
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
        variant.type === "Grab"
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
        {variant.type === "Grab" && (
          <>
            {" "}
            Grabs use separate tracks for the player and victim animations
            {tracks.includes("camera")
              ? " — and a camera track since Cutscene Style is set to Cinematic."
              : " — switch Cutscene Style to Cinematic to add a camera track."}
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
                onAdd(tag, move.variants[0]?.type || "Attack");
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
            : MOVE_TYPES[move.variants[0]?.type || "Attack"].icon;

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
                    const VIcon = MOVE_TYPES[v.type].icon;
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
                            {v.type}
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
                    onAdd={(tag, type) => {
                      const nv = makeVariant(tag, type);
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

const CopyLuauButton = ({ character, t }) => {
  const [state, setState] = useState("idle");
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
      className={`text-xs px-3 py-1.5 rounded-md border ${t.border} ${t.hover} inline-flex items-center gap-1.5 font-medium`}
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
  <header className={`border-b ${t.border} pb-6 mb-8`}>
    <div className="flex items-center gap-2 mb-2 px-2">
      {goToRoster && (
        <button
          onClick={goToRoster}
          className={`text-[11px] px-2 py-1 rounded ${t.hover} ${t.sub} inline-flex items-center gap-1`}
          title="Back to roster"
        >
          <ChevronRight size={12} className="rotate-180" /> Roster
        </button>
      )}
      <Tv size={13} className={t.faint} />
      <input
        value={character.anime}
        onChange={(e) => updateCharacter({ ...character, anime: e.target.value })}
        placeholder="Anime / source name"
        className={`bg-transparent outline-none text-sm rounded px-2 py-1 ${t.hover} ${t.sub} flex-1 min-w-0`}
      />
      <CopyLuauButton character={character} t={t} />
    </div>

    <input
      value={character.name}
      onChange={(e) => updateCharacter({ ...character, name: e.target.value })}
      placeholder="Character name"
      className={`w-full bg-transparent outline-none text-4xl font-semibold tracking-tight rounded px-2 py-1 ${t.hover}`}
    />

    <div className="mt-6">
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
    </div>
  </header>
);

/* ===========================================================================
 * Roster Screen
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

  return (
    <div
      className={`rounded-xl border ${t.border} ${t.surface} p-4 flex flex-col gap-3 transition-shadow hover:shadow-md group`}
    >
      <div className="flex items-start gap-2">
        <div
          className={`w-10 h-10 rounded-md flex items-center justify-center ${t.accentBg} ${t.accent} shrink-0`}
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
            className={`w-full bg-transparent outline-none text-lg font-semibold tracking-tight ${t.hover} rounded px-1 -mx-1`}
          />
          <div className={`text-[11px] ${t.faint} mt-0.5 truncate`}>
            {character.enabledSlots.length} slot
            {character.enabledSlots.length === 1 ? "" : "s"} · {moveCount}{" "}
            variant{moveCount === 1 ? "" : "s"}
            {awakening?.finisherKind
              ? ` · ${awakening.finisherKind}`
              : ""}
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
          return (
            <span
              key={k}
              className={`text-[10px] px-1.5 py-0.5 rounded border ${t.border} ${t.soft} ${t.sub} truncate max-w-[140px]`}
              title={label}
            >
              {label}
            </span>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mt-auto pt-1">
        <button
          onClick={onOpen}
          className={`text-xs px-3 py-1.5 rounded-md border ${t.border} ${t.hover} inline-flex items-center gap-1 ${t.accent}`}
        >
          Open moveset <ChevronRight size={12} />
        </button>
        <CopyLuauButton character={character} t={t} />
        {primaryMove?.name && (
          <span className={`text-[11px] ${t.faint} ml-auto truncate`}>
            ↳ {primaryMove.name}
          </span>
        )}
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
  const groups = useMemo(() => {
    const m = new Map();
    characters.forEach((c) => {
      const key = (c.anime || "Untitled Anime").trim() || "Untitled Anime";
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(c);
    });
    return Array.from(m.entries());
  }, [characters]);

  return (
    <div className="max-w-6xl mx-auto px-10 py-10">
      <header className={`border-b ${t.border} pb-5 mb-8 flex items-end justify-between gap-4`}>
        <div>
          <div className={`text-[11px] uppercase tracking-wider ${t.faint}`}>
            Anime Moveset Wiki
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">
            Your Roster
          </h1>
          <div className={`text-sm ${t.sub} mt-1`}>
            {characters.length} character{characters.length === 1 ? "" : "s"}{" "}
            across {groups.length} source{groups.length === 1 ? "" : "s"}.
            Click any card to dive into its moveset.
          </div>
        </div>
        <button
          onClick={addCharacter}
          className={`text-sm px-3 py-2 rounded-md border ${t.border} ${t.hover} inline-flex items-center gap-1 ${t.accent}`}
        >
          <Plus size={14} /> New character
        </button>
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
      ) : (
        <div className="space-y-10">
          {groups.map(([anime, group]) => (
            <section key={anime}>
              <div className={`flex items-baseline justify-between mb-3 pb-2 border-b ${t.subBorder}`}>
                <div className="flex items-center gap-2">
                  <Tv size={14} className={t.accent} />
                  <h2 className="text-base font-semibold tracking-tight">
                    {anime}
                  </h2>
                  <span className={`text-[11px] ${t.faint}`}>
                    · {group.length} character{group.length === 1 ? "" : "s"}
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
 * Accent Picker
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
    : MOVE_TYPES[variant.type].icon;

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

      <div className="mt-6 mb-4">
        <TypePicker variant={variant} updateVariant={updateVariant} t={t} />
      </div>

      <div className="space-y-3">
        <ClassificationSection variant={variant} updateVariant={updateVariant} t={t} />
        <SpecSheet variant={variant} updateVariant={updateVariant} t={t} />
        <KeyframeMarkers variant={variant} updateVariant={updateVariant} t={t} />
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

  const [characters, setCharacters] = useState([]);
  const [view, setView] = useState("roster"); // "roster" | "character"
  const [activeCharacterId, setActiveCharacterId] = useState(null);
  const [activeMoveKey, setActiveMoveKey] = useState("move1");
  const [activeVariantId, setActiveVariantId] = useState(null);
  const [expandedMoves, setExpandedMoves] = useState(() => new Set(["move1"]));
  const [minimizedCharacters, setMinimizedCharacters] = useState(() => new Set());

  // 'loading' | 'idle' | 'pending' | 'saving' | 'saved' | 'error'
  const [syncStatus, setSyncStatus] = useState("loading");

  const saveTimerRef = useRef(null);
  const isLoadedRef = useRef(false);
  const justLoaded = useRef(false);

  // Fetch roster on mount; seed the JSON file on first run
  useEffect(() => {
    (async () => {
      try {
        const raw = await invoke("load_characters");
        const data = raw ? JSON.parse(raw) : null;
        const loaded = data ?? seed();

        justLoaded.current = true;
        setCharacters(loaded);

        if (loaded.length > 0) {
          const first = loaded[0];
          setActiveCharacterId(first.id);
          const firstSlot = first.enabledSlots[0];
          setActiveMoveKey(firstSlot);
          setActiveVariantId(first.moves[firstSlot]?.variants[0]?.id ?? null);
          setExpandedMoves(new Set([firstSlot]));
        }

        isLoadedRef.current = true;
        setSyncStatus("idle");

        // Persist seed data on first run so the file exists next time
        if (data === null) {
          await invoke("save_characters", { data: JSON.stringify(loaded) });
        }
      } catch {
        setSyncStatus("error");
      }
    })();
  }, []);

  // Debounced auto-save — skips the render triggered by the initial load
  useEffect(() => {
    if (!isLoadedRef.current) return;
    if (justLoaded.current) {
      justLoaded.current = false;
      return;
    }

    setSyncStatus("pending");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      setSyncStatus("saving");
      try {
        await invoke("save_characters", { data: JSON.stringify(characters) });
        setSyncStatus("saved");
        setTimeout(() => setSyncStatus("idle"), 2000);
      } catch {
        setSyncStatus("error");
      }
    }, 800);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [characters]);

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
      <style>{ACCENT_CSS}</style>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`w-[300px] shrink-0 border-r ${t.sidebar} h-screen sticky top-0 flex flex-col`}
        >
          <div className={`px-4 py-4 border-b ${t.border}`}>
            <button
              onClick={goToRoster}
              className="flex items-center gap-2 w-full text-left"
              title="Back to roster"
            >
              <div
                className={`w-8 h-8 rounded-md flex items-center justify-center ${t.accentBg} ${t.accent}`}
              >
                <Sparkles size={16} />
              </div>
              <div className="min-w-0">
                <div className={`text-[11px] uppercase tracking-wider ${t.faint}`}>
                  Anime Moveset Wiki
                </div>
                <div className="font-semibold truncate text-sm">
                  Roblox · {characters.length} character
                  {characters.length === 1 ? "" : "s"}
                </div>
              </div>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <RosterSection
              characters={characters}
              activeCharacterId={view === "character" ? activeCharacterId : null}
              selectCharacter={selectCharacter}
              addCharacter={addCharacter}
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

          <div className={`border-t ${t.border} p-3 flex items-center justify-between gap-1`}>
            <div className="flex items-center gap-2">
              <button
                onClick={goToRoster}
                className={`text-[11px] ${t.faint} ${t.hover} rounded px-1.5 py-1 truncate`}
                title="Back to roster"
              >
                {view === "roster" ? "Roster view" : "← Roster"}
              </button>
              <SyncIndicator status={syncStatus} t={t} />
            </div>
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
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          {syncStatus === "loading" ? (
            <div className="flex items-center justify-center h-[60vh] gap-2">
              <Loader2 size={20} className={`${t.faint} animate-spin`} />
              <span className={`text-sm ${t.sub}`}>Loading characters…</span>
            </div>
          ) : view === "roster" ? (
            <RosterScreen
              characters={characters}
              selectCharacter={selectCharacter}
              addCharacter={addCharacter}
              removeCharacter={removeCharacter}
              updateCharacter={updateCharacter}
              t={t}
            />
          ) : (
            <div className="max-w-4xl mx-auto px-10 py-12">
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
