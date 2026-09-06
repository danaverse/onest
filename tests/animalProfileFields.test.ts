import {
  encodeAnimalProfileNote,
  parseAnimalProfileNote,
  profileBareNameFromNote,
  prepareDanaNote,
  truncateUtf8Bytes,
  PROFILE_SEP,
  type AnimalProfileFields,
} from '../src/offering/animalProfileFields.js';

describe('animalProfileFields', () => {
  it('encodes and decodes an animal profile correctly', () => {
    const original: AnimalProfileFields = {
      species: 'dog',
      name: 'Barnaby',
      note: 'Good boy who loved tennis balls',
      breed: 'Golden Retriever',
      birthDate: '2015-04-12',
      passingDate: '2025-08-30',
      location: 'Seattle, WA',
      memorialPlace: 'Sunny Meadow',
      relationshipType: '',
      relatedTxid: '',
      relationships: [],
      kind: 'memorial',
      dateCalendar: 'solar',
    };

    const encoded = encodeAnimalProfileNote(original);
    expect(encoded).toContain('dog');
    expect(encoded).toContain('Barnaby');
    expect(encoded).toContain(PROFILE_SEP);

    const parsed = parseAnimalProfileNote(encoded);
    expect(parsed.species).toBe('dog');
    expect(parsed.name).toBe('Barnaby');
    expect(parsed.note).toBe('Good boy who loved tennis balls');
    expect(parsed.breed).toBe('Golden Retriever');
    expect(parsed.birthDate).toBe('2015-04-12');
    expect(parsed.passingDate).toBe('2025-08-30');
    expect(parsed.location).toBe('Seattle, WA');
    expect(parsed.memorialPlace).toBe('Sunny Meadow');
    expect(parsed.kind).toBe('memorial');
    expect(parsed.dateCalendar).toBe('solar');
  });

  it('extracts bare name from formatted note', () => {
    const encoded = encodeAnimalProfileNote({
      species: 'cat',
      name: 'Mochi',
      note: 'Forever purring',
      breed: 'Calico',
      birthDate: '2018-01-01',
      passingDate: '',
      location: '',
      memorialPlace: '',
      relationshipType: '',
      relatedTxid: '',
      relationships: [],
      kind: 'living',
      dateCalendar: 'solar',
    });

    expect(profileBareNameFromNote(encoded)).toBe('Mochi');
  });

  it('falls back to raw text if no separator present', () => {
    const raw = 'Beloved companion dog Max';
    const parsed = parseAnimalProfileNote(raw);
    expect(parsed).toBeNull();
    expect(profileBareNameFromNote(raw)).toBe(raw);
  });

  it('truncates UTF-8 correctly without splitting characters', () => {
    const text = '🐾🐕🐱 忠诚的朋友 🐶';
    const truncated = truncateUtf8Bytes(text, 15);
    expect(Buffer.byteLength(truncated, 'utf8')).toBeLessThanOrEqual(15);
  });

  it('prepares dana note with length enforcement', () => {
    const longNote = 'a'.repeat(300);
    const preparedRoot = prepareDanaNote(longNote, false);
    expect(Buffer.byteLength(preparedRoot, 'utf8')).toBeLessThanOrEqual(150);

    const preparedChild = prepareDanaNote(longNote, true);
    expect(Buffer.byteLength(preparedChild, 'utf8')).toBeLessThanOrEqual(120);
  });
});
