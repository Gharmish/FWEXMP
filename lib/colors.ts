/**
 * Gharmish color system — single source of truth.
 *
 * Base hex values are taken verbatim from BRIEF.md section 3. Ramps are
 * 7-stop HSL-lightness derivations (50,100,200,400,600,800,900) generated
 * to match the stops the brief requires for fills and tints.
 *
 * These same values are mirrored as Tailwind v4 `@theme` tokens in
 * app/globals.css. If you change a value, change it in both places — or
 * better, regenerate. Never introduce off-palette hex anywhere else.
 */

export type ColorToken =
  | 'sarat-black'
  | 'saffron-gold'
  | 'sarawat-blue'
  | 'soudah-sunset'
  | 'juniper-green'
  | 'al-qatt-red'
  | 'fog-white'
  | 'honey-amber'
  | 'habala-mist'
  | 'tihama-coral'
  | 'wadi-mint'
  | 'rijal-clay';

export type RampStop = 50 | 100 | 200 | 400 | 600 | 800 | 900;

export interface ColorEntry {
  /** Brand base hex from BRIEF.md section 3. */
  readonly base: string;
  /** Role description from BRIEF.md. */
  readonly role: string;
  /** 7-stop HSL ramp. */
  readonly ramp: Readonly<Record<RampStop, string>>;
}

export const COLORS: Readonly<Record<ColorToken, ColorEntry>> = {
  'sarat-black': {
    base: '#0A0A0A',
    role: 'Text, dark sections, Originals tier',
    ramp: {
      50: '#F5F5F5',
      100: '#E8E8E8',
      200: '#D4D4D4',
      400: '#A3A3A3',
      600: '#686868',
      800: '#4A4A4A',
      900: '#363636',
    },
  },
  'saffron-gold': {
    base: '#F5B800',
    role: 'Primary CTAs, premium accent, emphasis',
    ramp: {
      50: '#FAF8EF',
      100: '#F8F0D8',
      200: '#F7E5B0',
      400: '#FACF4C',
      600: '#E6AC00',
      800: '#906D04',
      900: '#664E05',
    },
  },
  'sarawat-blue': {
    base: '#2E5BFF',
    role: 'Family category, informational links',
    ramp: {
      50: '#EFF2FA',
      100: '#D8DFF8',
      200: '#B0BFF7',
      400: '#4C72FA',
      600: '#0031E6',
      800: '#042290',
      900: '#051A66',
    },
  },
  'soudah-sunset': {
    base: '#E85D27',
    role: 'Adventure category, warmth',
    ramp: {
      50: '#F9F3F0',
      100: '#F5E2DB',
      200: '#F0C7B7',
      400: '#EA845D',
      600: '#CF4A16',
      800: '#833111',
      900: '#5C240F',
    },
  },
  'juniper-green': {
    base: '#1F7A5C',
    role: 'Nature category, success states',
    ramp: {
      50: '#F1F8F6',
      100: '#DEF2EB',
      200: '#BFE9DB',
      400: '#6FD7B5',
      600: '#2EB78A',
      800: '#207458',
      900: '#19523F',
    },
  },
  'al-qatt-red': {
    base: '#C8312A',
    role: 'Heritage category, destructive/error states',
    ramp: {
      50: '#F8F1F1',
      100: '#F3DEDE',
      200: '#EBBEBC',
      400: '#DC6F6A',
      600: '#BE2E28',
      800: '#78201C',
      900: '#551916',
    },
  },
  'fog-white': {
    base: '#F5F2EC',
    role: 'Primary background, surfaces in dark mode text',
    ramp: {
      50: '#F7F5F3',
      100: '#EDEAE3',
      200: '#DFD7C9',
      400: '#BEAC88',
      600: '#967F4F',
      800: '#605134',
      900: '#453B27',
    },
  },
  'honey-amber': {
    base: '#F4B898',
    role: 'Soft accent, secondary surfaces',
    ramp: {
      50: '#F9F3F0',
      100: '#F5E4DB',
      200: '#F0CBB7',
      400: '#EA8E5D',
      600: '#CF5716',
      800: '#833911',
      900: '#5C2A0F',
    },
  },
  'habala-mist': {
    base: '#BFD4E8',
    role: 'Soft accent, info surfaces',
    ramp: {
      50: '#F2F5F7',
      100: '#E0E8F0',
      200: '#C3D4E4',
      400: '#7AA4CC',
      600: '#3D74A9',
      800: '#294B6B',
      900: '#1F364C',
    },
  },
  'tihama-coral': {
    base: '#FFB089',
    role: 'Soft accent',
    ramp: {
      50: '#FAF3EF',
      100: '#F8E3D8',
      200: '#F7C8B0',
      400: '#FA864C',
      600: '#E64C00',
      800: '#903204',
      900: '#662505',
    },
  },
  'wadi-mint': {
    base: '#9FD9C0',
    role: 'Wellness category',
    ramp: {
      50: '#F2F7F5',
      100: '#E1EFE9',
      200: '#C4E3D6',
      400: '#7DC9A8',
      600: '#41A47A',
      800: '#2C684E',
      900: '#214A38',
    },
  },
  'rijal-clay': {
    base: '#8B2E20',
    role: 'Deep accent, sold-out / past states',
    ramp: {
      50: '#F8F2F1',
      100: '#F2E1DE',
      200: '#EAC3BD',
      400: '#DA7B6D',
      600: '#BB3E2B',
      800: '#76291E',
      900: '#541F17',
    },
  },
} as const;

/** Immutable category → color token map (BRIEF.md section 3). */
export const CATEGORY_COLOR = {
  nature: 'juniper-green',
  heritage: 'al-qatt-red',
  food: 'saffron-gold',
  wellness: 'wadi-mint',
  adventure: 'soudah-sunset',
  family: 'sarawat-blue',
} as const satisfies Record<string, ColorToken>;

export type Category = keyof typeof CATEGORY_COLOR;
