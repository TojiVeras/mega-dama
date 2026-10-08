import { describe, expect, it } from 'vitest';
import { eddieWanted, isIronMaiden } from './maiden.js';

describe('isIronMaiden', () => {
  it('reconhece pelo título ou pelo canal', () => {
    expect(isIronMaiden({ title: 'Iron Maiden - The Trooper (Official Video)', author: 'x' })).toBe(true);
    expect(isIronMaiden({ title: 'The Trooper', author: 'Iron Maiden' })).toBe(true);
    expect(isIronMaiden({ title: 'IRON MAIDEN — Aces High', author: '' })).toBe(true);
    expect(isIronMaiden({ title: 'Live (Iron-Maiden tribute)' })).toBe(true);
  });

  it('ignora outras músicas e vídeo vazio', () => {
    expect(isIronMaiden({ title: 'Metallica - One', author: 'Metallica' })).toBe(false);
    expect(isIronMaiden({ title: '', author: '' })).toBe(false);
    expect(isIronMaiden(null)).toBe(false);
  });
});

describe('eddieWanted', () => {
  const maiden = { title: 'Fear of the Dark', author: 'Iron Maiden' };
  const other = { title: 'Back in Black', author: 'AC/DC' };

  it('aparece só tocando Iron Maiden', () => {
    expect(eddieWanted(1, maiden)).toBe(true);
    expect(eddieWanted(3, maiden)).toBe(true);
    expect(eddieWanted(1, other)).toBe(false);
  });

  it('pausado mantém; acabou ou parado tira', () => {
    expect(eddieWanted(2, maiden)).toBe(null);
    expect(eddieWanted(0, maiden)).toBe(false);
    expect(eddieWanted(-1, maiden)).toBe(false);
    expect(eddieWanted(5, maiden)).toBe(false);
  });
});
