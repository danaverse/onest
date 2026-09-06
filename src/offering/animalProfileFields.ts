/**
 * Onest Animal Profile and Paw-Print tribute field packing.
 *
 * Wire (UTF-8), Unit Separator U+001F between fields:
 *   species \x1f name \x1f note \x1f breed \x1f birthDate \x1f passingDate
 *     \x1f location \x1f memorialPlace \x1f relationshipType \x1f relatedTxid
 *     \x1f kind \x1f dateCalendar
 *
 * Designed specifically for animal profiles and paw-print tributes.
 * species: 'dog' | 'cat' | 'bird' | 'other' | ...
 * kind: '' (animal memorial / profile) | 'tribute' | 'event'
 */

export const PROFILE_SEP = '\u001f';
export const ALTAR_SEP = PROFILE_SEP; // Backward compatibility alias

export const OP_RETURN_SCRIPT_MAX_BYTES = 223;
export const MEMORIAL_NOTE_MAX_BYTES = 150;
export const MEMORIAL_NOTE_MAX_BYTES_WITH_PARENT = 120;
export const MEMORIAL_NOTE_MAX_CHARS = 100;

export type AnimalSpecies = '' | 'dog' | 'cat' | 'bird' | 'horse' | 'rabbit' | 'other';
export type AnimalRelationshipType = '' | 'parent' | 'sibling' | 'companion' | 'child';
export type ProfileKind = '' | 'memorial' | 'living' | 'event';
export type ProfileDateCalendar = '' | 'solar' | 'lunar';

export interface AnimalRelationshipLink {
  type: Exclude<AnimalRelationshipType, ''>;
  relatedTxid: string;
}

export interface AnimalProfileFields {
  /** Animal species / honorific code: 'dog' | 'cat' | ... */
  species: AnimalSpecies;
  /** Pet / animal name */
  name: string;
  /** Free tribute words / memory */
  note: string;
  /** Breed / rescue background */
  breed: string;
  /** Birth date / adoption date (YYYY, YYYY-MM, or YYYY-MM-DD) */
  birthDate: string;
  /** Passing date (YYYY, YYYY-MM, or YYYY-MM-DD) - empty for living pets */
  passingDate: string;
  /** Home city / location */
  location: string;
  /** Resting place / favorite place */
  memorialPlace: string;
  /** Relationship to another animal profile */
  relationshipType: AnimalRelationshipType;
  relatedTxid: string;
  relationships: AnimalRelationshipLink[];
  /** Profile kind */
  kind: ProfileKind;
  dateCalendar: ProfileDateCalendar;
}

// Aliases for compatibility
export type AltarFields = AnimalProfileFields;
export type AltarRelationshipLink = AnimalRelationshipLink;

export function emptyAnimalProfileFields(): AnimalProfileFields {
  return {
    species: '',
    name: '',
    note: '',
    breed: '',
    birthDate: '',
    passingDate: '',
    location: '',
    memorialPlace: '',
    relationshipType: '',
    relatedTxid: '',
    relationships: [],
    kind: '',
    dateCalendar: '',
  };
}

export const emptyAltarFields = emptyAnimalProfileFields;

export function scrub(raw: string): string {
  return raw.replaceAll(PROFILE_SEP, ' ').replace(/\s+/g, ' ').trim();
}

export function utf8ByteLength(raw: string): number {
  return new TextEncoder().encode(raw).length;
}

export function truncateUtf8Bytes(raw: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  const enc = new TextEncoder();
  if (enc.encode(raw).length <= maxBytes) return raw;
  let out = '';
  for (const ch of raw) {
    const next = out + ch;
    if (enc.encode(next).length > maxBytes) break;
    out = next;
  }
  return out;
}

export function memorialNoteMaxBytes(hasParentBurnTxid?: boolean): number {
  return hasParentBurnTxid
    ? MEMORIAL_NOTE_MAX_BYTES_WITH_PARENT
    : MEMORIAL_NOTE_MAX_BYTES;
}

export function normalizeSpecies(raw: string | null | undefined): AnimalSpecies {
  const t = (raw || '').trim().toLowerCase();
  if (t === 'dog' || t === 'cat' || t === 'bird' || t === 'horse' || t === 'rabbit' || t === 'other') {
    return t;
  }
  return '';
}

export function normalizeRelationshipType(raw: string | null | undefined): AnimalRelationshipType {
  const t = (raw || '').trim().toLowerCase();
  if (t === 'parent' || t === 'p') return 'parent';
  if (t === 'sibling' || t === 's') return 'sibling';
  if (t === 'companion' || t === 'c') return 'companion';
  if (t === 'child') return 'child';
  return '';
}

export function wireRelationshipType(t: AnimalRelationshipType): string {
  if (t === 'parent') return 'p';
  if (t === 'sibling') return 's';
  if (t === 'companion') return 'c';
  return '';
}

export function normalizeRelatedTxid(raw: string | null | undefined): string {
  const t = (raw || '').trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(t) ? t : '';
}

export const normalizeAltarRelatedTxid = normalizeRelatedTxid;

export function parseAnimalProfileNote(raw: string): AnimalProfileFields | null {
  if (!raw.includes(PROFILE_SEP)) return null;
  const parts = raw.split(PROFILE_SEP);
  const fields = emptyAnimalProfileFields();
  fields.species = normalizeSpecies(parts[0]);
  fields.name = (parts[1] ?? '').trim();
  fields.note = (parts[2] ?? '').trim();
  fields.breed = (parts[3] ?? '').trim();
  fields.birthDate = (parts[4] ?? '').trim();
  fields.passingDate = (parts[5] ?? '').trim();
  fields.location = (parts[6] ?? '').trim();
  fields.memorialPlace = (parts[7] ?? '').trim();
  fields.relationshipType = normalizeRelationshipType(parts[8]);
  fields.relatedTxid = normalizeRelatedTxid(parts[9]);
  fields.kind = (parts[10] ?? '').trim() as ProfileKind;
  fields.dateCalendar = (parts[11] ?? '').trim() as ProfileDateCalendar;

  if (fields.relationshipType && fields.relatedTxid) {
    fields.relationships = [{
      type: fields.relationshipType as Exclude<AnimalRelationshipType, ''>,
      relatedTxid: fields.relatedTxid,
    }];
  }
  return fields;
}

export const parseAltarNote = parseAnimalProfileNote;

export function profileDisplayName(fields: AnimalProfileFields): string {
  const name = scrub(fields.name) || scrub(fields.note);
  return name;
}

export const memorialDisplayName = profileDisplayName;

export function profileBareNameFromNote(raw: string): string {
  const parsed = parseAnimalProfileNote(raw);
  if (parsed) return profileDisplayName(parsed);
  return scrub(raw);
}

export const altarBareNameFromNote = profileBareNameFromNote;

export function encodeAnimalProfileNote(
  fields: AnimalProfileFields,
  opts?: { maxBytes?: number },
): string {
  const maxBytes = opts?.maxBytes ?? MEMORIAL_NOTE_MAX_BYTES;
  const species = normalizeSpecies(fields.species);
  const name = scrub(fields.name);
  let note = scrub(fields.note);
  let breed = scrub(fields.breed);
  let birthDate = scrub(fields.birthDate);
  let passingDate = scrub(fields.passingDate);
  let location = scrub(fields.location);
  let memorialPlace = scrub(fields.memorialPlace);
  const relType = wireRelationshipType(normalizeRelationshipType(fields.relationshipType));
  const relTxid = normalizeRelatedTxid(fields.relatedTxid);
  const kind = scrub(fields.kind);
  const cal = scrub(fields.dateCalendar);

  const pack = () => [
    species,
    name,
    note,
    breed,
    birthDate,
    passingDate,
    location,
    memorialPlace,
    relType,
    relTxid,
    kind,
    cal,
  ].join(PROFILE_SEP);

  let packed = pack();
  if (utf8ByteLength(packed) > maxBytes && memorialPlace) {
    memorialPlace = '';
    packed = pack();
  }
  if (utf8ByteLength(packed) > maxBytes && location) {
    location = '';
    packed = pack();
  }
  if (utf8ByteLength(packed) > maxBytes && note) {
    const overhead = utf8ByteLength(pack()) - utf8ByteLength(note);
    note = truncateUtf8Bytes(note, Math.max(0, maxBytes - overhead));
    packed = pack();
  }
  return packed;
}

export const encodeAltarNote = encodeAnimalProfileNote;

export function prepareDanaNote(
  raw: string | null | undefined,
  hasParentBurnTxid: boolean,
): string {
  const t = (raw || '').trim();
  const maxBytes = memorialNoteMaxBytes(hasParentBurnTxid);
  return truncateUtf8Bytes(t, maxBytes);
}

export function isDeathDateAmendNote(raw: string | null | undefined): boolean {
  const parsed = parseAnimalProfileNote(raw || '');
  if (!parsed) return false;
  return Boolean(!parsed.name && parsed.passingDate);
}

export function isRelationshipAmendNote(raw: string | null | undefined): boolean {
  const parsed = parseAnimalProfileNote(raw || '');
  if (!parsed) return false;
  return Boolean(!parsed.name && parsed.relationshipType && parsed.relatedTxid);
}

export function profileSearchRelevance(name: string, query: string): number {
  const q = query.trim().toLowerCase();
  const n = name.trim().toLowerCase();
  if (!q || !n) return 0;
  if (n === q) return 3;
  if (n.startsWith(q)) return 2;
  if (n.includes(q)) return 1;
  return 0;
}

export const altarSearchRelevance = profileSearchRelevance;

export function mergeAnimalProfileFields(notes: Iterable<string>): AnimalProfileFields | null {
  const list = [...notes];
  let merged: AnimalProfileFields | null = null;
  for (const raw of list) {
    const parsed = parseAnimalProfileNote(raw);
    if (!parsed) continue;
    if (!merged) {
      merged = { ...parsed };
      continue;
    }
    merged = {
      ...merged,
      species: merged.species || parsed.species,
      name: merged.name || parsed.name,
      note: parsed.note || merged.note,
      breed: merged.breed || parsed.breed,
      birthDate: merged.birthDate || parsed.birthDate,
      passingDate: parsed.passingDate || merged.passingDate,
      location: merged.location || parsed.location,
      memorialPlace: merged.memorialPlace || parsed.memorialPlace,
      relationships: [...merged.relationships, ...parsed.relationships],
    };
  }
  return merged;
}

export const mergeAltarFields = mergeAnimalProfileFields;
