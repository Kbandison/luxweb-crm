import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv-import';

describe('parseCsv', () => {
  it('splits plain rows and drops CR from CRLF line endings', () => {
    expect(parseCsv('Name,Phone\r\nJane,555\r\n')).toEqual([
      ['Name', 'Phone'],
      ['Jane', '555'],
    ]);
  });

  it('keeps commas, newlines and escaped quotes inside a quoted field', () => {
    expect(parseCsv('a,"b, ""c""\nd",e')).toEqual([['a', 'b, "c"\nd', 'e']]);
  });

  it('treats a quote mid-field as literal instead of opening a quoted field', () => {
    expect(parseCsv('Name,Notes\nJane,wants a 5" logo\nBob,ok\n')).toEqual([
      ['Name', 'Notes'],
      ['Jane', 'wants a 5" logo'],
      ['Bob', 'ok'],
    ]);
  });

  it('keeps an empty quoted field empty', () => {
    expect(parseCsv('"",x')).toEqual([['', 'x']]);
  });

  it('ignores a leading BOM so a quoted first header still parses', () => {
    expect(parseCsv('﻿"Contact, Name",Phone\nJane,555')).toEqual([
      ['Contact, Name', 'Phone'],
      ['Jane', '555'],
    ]);
  });

  it('keeps a final row with no trailing newline', () => {
    expect(parseCsv('a,b\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});
