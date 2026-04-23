#!/usr/bin/env node
/**
 * Validates device-database.json for schema conformance.
 * Usage: node scripts/validate-device-db.js
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, '../shared/device-database.json');

const data = JSON.parse(readFileSync(dbPath, 'utf-8'));
const errors = [];

if (!data.version) errors.push('Missing "version" field');
if (!data.lastUpdated) errors.push('Missing "lastUpdated" field');
if (!Array.isArray(data.devices) || data.devices.length === 0) errors.push('Missing or empty "devices" array');

const ids = new Set();
const categories = ['phone', 'tablet', 'desktop'];

for (let i = 0; i < (data.devices || []).length; i++) {
  const d = data.devices[i];
  const prefix = `Device[${i}] (${d.id || 'no id'})`;
  if (!d.id) errors.push(`${prefix}: missing "id"`);
  if (ids.has(d.id)) errors.push(`${prefix}: duplicate id "${d.id}"`);
  ids.add(d.id);
  if (!d.manufacturer) errors.push(`${prefix}: missing "manufacturer"`);
  if (!d.model) errors.push(`${prefix}: missing "model"`);
  if (!d.cssWidth || d.cssWidth <= 0) errors.push(`${prefix}: invalid cssWidth`);
  if (!d.cssHeight || d.cssHeight <= 0) errors.push(`${prefix}: invalid cssHeight`);
  if (!d.dpr || d.dpr < 1) errors.push(`${prefix}: invalid dpr (must be >= 1)`);
  if (!categories.includes(d.category)) errors.push(`${prefix}: invalid category "${d.category}"`);
}

// Check auto-audit baseline references exist
for (const id of (data.autoAuditBaseline || [])) {
  if (!ids.has(id)) errors.push(`autoAuditBaseline references unknown device: "${id}"`);
}

if (errors.length > 0) {
  console.error(`❌ Validation failed with ${errors.length} error(s):`);
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
} else {
  console.log(`✅ Valid: ${data.devices.length} devices, version ${data.version}, updated ${data.lastUpdated}`);
}
