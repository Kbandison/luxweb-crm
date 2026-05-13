import { describe, expect, it } from 'vitest';
import {
  getExtension,
  isAllowedExtension,
  isAllowedMime,
  isAllowedUpload,
} from './files';

describe('getExtension', () => {
  it('returns extension lowercased', () => {
    expect(getExtension('report.PDF')).toBe('pdf');
    expect(getExtension('image.jpeg')).toBe('jpeg');
    expect(getExtension('My File.PNG')).toBe('png');
  });

  it('handles multi-dot files', () => {
    expect(getExtension('archive.tar.gz')).toBe('gz');
  });

  it('returns empty when no extension', () => {
    expect(getExtension('README')).toBe('');
    expect(getExtension('.dotfile')).toBe('dotfile');
    expect(getExtension('trailing.')).toBe('');
  });
});

describe('isAllowedExtension', () => {
  it('allows common image and doc extensions', () => {
    expect(isAllowedExtension('a.jpg')).toBe(true);
    expect(isAllowedExtension('a.png')).toBe(true);
    expect(isAllowedExtension('a.pdf')).toBe(true);
    expect(isAllowedExtension('a.docx')).toBe(true);
  });

  it('rejects HTML / SVG / JS / shell', () => {
    expect(isAllowedExtension('a.html')).toBe(false);
    expect(isAllowedExtension('a.svg')).toBe(false);
    expect(isAllowedExtension('a.js')).toBe(false);
    expect(isAllowedExtension('a.sh')).toBe(false);
    expect(isAllowedExtension('a.exe')).toBe(false);
  });

  it('rejects extensionless', () => {
    expect(isAllowedExtension('README')).toBe(false);
  });
});

describe('isAllowedMime', () => {
  it('allows when undefined/null/empty', () => {
    // Extension check is the safety net when content_type is missing.
    expect(isAllowedMime(null)).toBe(true);
    expect(isAllowedMime(undefined)).toBe(true);
  });

  it('allows safe content types', () => {
    expect(isAllowedMime('image/jpeg')).toBe(true);
    expect(isAllowedMime('application/pdf')).toBe(true);
    expect(isAllowedMime('video/mp4')).toBe(true);
  });

  it('rejects executable / script content types', () => {
    expect(isAllowedMime('text/html')).toBe(false);
    expect(isAllowedMime('image/svg+xml')).toBe(false);
    expect(isAllowedMime('application/javascript')).toBe(false);
  });
});

describe('isAllowedUpload', () => {
  it('passes safe files', () => {
    expect(isAllowedUpload('report.pdf', 'application/pdf').ok).toBe(true);
    expect(isAllowedUpload('photo.jpg', 'image/jpeg').ok).toBe(true);
  });

  it('rejects script-vector files even when MIME lies', () => {
    expect(isAllowedUpload('xss.svg', 'image/png').ok).toBe(false);
    expect(isAllowedUpload('xss.html', 'text/plain').ok).toBe(false);
  });

  it('rejects bad MIME on good extension', () => {
    expect(isAllowedUpload('report.pdf', 'text/html').ok).toBe(false);
  });

  it('rejects extensionless', () => {
    expect(isAllowedUpload('README', null).ok).toBe(false);
  });
});
