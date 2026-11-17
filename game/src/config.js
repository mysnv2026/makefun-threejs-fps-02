// SANDLINE — shared tuning: palette, weapons, economy, rounds.
// One job: the numbers every other module reads. Nothing here touches the DOM,
// the scene or the network; change a value here and the whole game follows.
export const PALETTE = {
  canvas: 0x14161a, // page background
  sky: 0x2b333c, // dusk sky / fog
  ground: 0x8a7a5c, // packed sand
  groundDark: 0x6b5d45,
  wall: 0xb09a72, // sun-bleached plaster
  wallDark: 0x7d6c4e,
  crate: 0x9c6b3f, // rusted timber
  crateDark: 0x6e4a2a,
  metal: 0x4a525c, // painted steel
  metalDark: 0x2e343c,
  accentAmber: 0xf0a830, // Amber team
  accentCobalt: 0x35b6c9, // Cobalt team
  ink: 0xe9e6df,
  muted: 0x98a0a8,
  danger: 0xe5484d,
  containerA: 0x7a4a2e,
  containerB: 0x3f5a52,
};

// Teams. Amber attacks (plants the charge), Cobalt defends the two sites.
export const TEAMS = {
  AMBER: 'amber',
  COBALT: 'cobalt',
};

export const TEAM_COLOR = {
  [TEAMS.AMBER]: PALETTE.accentAmber,
  [TEAMS.COBALT]: PALETTE.accentCobalt,
};

// Weapons. damage is per body hit; headshots multiply by headMult.
// spread is radians of cone half-angle at rest; moveSpread is added at full speed.
export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', key: '1', price: 0, auto: false,
    damage: 26, headMult: 3.0, rpm: 320, mag: 15, reserve: 45,
    spread: 0.006, moveSpread: 0.02, recoil: 0.011, reloadMs: 1400,
    range: 60, tracer: 0xffe9a8, sound: 'pistol',
  },
  vk9: {
    id: 'vk9', name: 'VK-9 Ripper', key: '2', price: 1500, auto: true,
    damage: 24, headMult: 3.2, rpm: 720, mag: 28, reserve: 84,
    spread: 0.011, moveSpread: 0.026, recoil: 0.009, reloadMs: 1900,
    range: 55, tracer: 0xffd34d, sound: 'smg',
  },
  ar77: {
    id: 'ar77', name: 'AR-77 Longshot', key: '3', price: 2700, auto: true,
    damage: 33, headMult: 3.5, rpm: 600, mag: 25, reserve: 75,
    spread: 0.004, moveSpread: 0.018, recoil: 0.014, reloadMs: 2200,
    range: 90, tracer: 0xfff2b0, sound: 'rifle',
  },
  lr90: {
    id: 'lr90', name: 'LR-90 Marksman', key: '4', price: 4750, auto: false,
    damage: 88, headMult: 3.0, rpm: 55, mag: 5, reserve: 15,
    spread: 0.001, moveSpread: 0.012, recoil: 0.05, reloadMs: 3200,
    range: 120, tracer: 0xffffff, sound: 'marksman',
  },
  spark: {
    id: 'spark', name: 'Spark Grenade', key: '5', price: 300, auto: false,
    damage: 0, headMult: 1, rpm: 60, mag: 1, reserve: 0,
    spread: 0, moveSpread: 0, recoil: 0, reloadMs: 0,
    range: 0, tracer: 0, sound: 'throw',
  },
};

export const WEAPON_ORDER = ['p9', 'vk9', 'ar77', 'lr90'];
export const ARMOR_PRICE = 650;
export const ARMOR_VALUE = 50;

// Economy: CS-style, tuned short so a lost round still buys next round.
export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  winBonus: 3250,
  lossBonus: 1900,
  lossBonusStreak: 2400,
  plantBonus: 300,
  maxMoney: 16000,
};

// Rounds: first to 5, at most 9 rounds (5-4 is the last possible score).
export const ROUND = {
  buySeconds: 15,
  roundSeconds: 100,
  postSeconds: 6,
  plantSeconds: 4,
  defuseSeconds: 5,
  detonateSeconds: 35,
  winRounds: 5,
  maxRounds: 9,
};

// Movement and gunfeel.
export const MOVE = {
  walkSpeed: 5.2,
  crouchSpeed: 2.6,
  accel: 42,
  friction: 9,
  jumpSpeed: 6.4,
  gravity: 18,
  eyeHeight: 1.62,
  crouchEye: 1.12,
  radius: 0.38,
};

export const PLAYER_HP = 100;
