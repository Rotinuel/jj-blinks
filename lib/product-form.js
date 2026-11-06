// Parsing helpers for the admin product form (plain-text option editors).
import { slugify } from './utilities.js';

const MAX_OPTIONS = 3;

/** "Colour: Gold, Wine" per line → [{ name, values }] */
export function parseOptions(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const [name, vals] = line.split(':');
    if (!name?.trim() || !vals) continue;
    const values = [...new Set(vals.split(',').map((v) => v.trim()).filter(Boolean))].slice(0, 30);
    if (values.length) out.push({ name: name.trim().slice(0, 40), values: values.map((v) => v.slice(0, 40)) });
  }
  return out.slice(0, MAX_OPTIONS);
}

/** "Label | text | required | 60"  or  "Label | select: A, B | optional" per line. */
export function parseCustomizations(text) {
  const out = [];
  const keys = new Set();
  for (const line of String(text || '').split('\n')) {
    const parts = line.split('|').map((p) => p.trim());
    if (!parts[0]) continue;
    const label = parts[0].slice(0, 60);
    let key = slugify(label).replace(/-/g, '_').slice(0, 40) || `option_${out.length + 1}`;
    while (keys.has(key)) key += '_x';
    keys.add(key);
    const typePart = parts[1] || 'text';
    const isSelect = /^select\s*:/i.test(typePart);
    const opt = { key, label, type: isSelect ? 'select' : 'text', required: /^required$/i.test(parts[2] || '') };
    if (isSelect) opt.choices = typePart.replace(/^select\s*:/i, '').split(',').map((c) => c.trim()).filter(Boolean).slice(0, 30);
    else opt.max_length = Math.min(500, Math.max(1, Number.parseInt(parts[3], 10) || 120));
    if (isSelect && !opt.choices.length) continue;
    out.push(opt);
  }
  return out.slice(0, 10);
}

/** Inverse of the parsers, for pre-filling the form. */
export function optionsToText(options) {
  return (options || []).map((o) => `${o.name}: ${o.values.join(', ')}`).join('\n');
}

export function customizationsToText(list) {
  return (list || [])
    .map((c) => [c.label, c.type === 'select' ? `select: ${(c.choices || []).join(', ')}` : 'text', c.required ? 'required' : 'optional', c.type === 'select' ? '' : c.max_length].filter((x) => x !== '' && x !== undefined).join(' | '))
    .join('\n');
}
