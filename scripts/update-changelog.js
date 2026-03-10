#!/usr/bin/env node
/**
 * Добавляет запись для новой версии в changelog-data.json и генерирует js/changelog-data.js.
 * Вызывается из pack-extension.sh после обновления версии в manifest.json.
 *
 * Читает crm/CHANGELOG_PENDING.txt (опционально) — по одной строке = один пункт списка.
 * Если файла нет, добавляет запись с пунктом "Исправления и обновления."
 */

const fs = require('fs');
const path = require('path');

const CRM = path.join(__dirname, '..');
const MANIFEST = path.join(CRM, 'manifest.json');
const CHANGELOG_JSON = path.join(CRM, 'changelog-data.json');
const PENDING = path.join(CRM, 'CHANGELOG_PENDING.txt');
const CHANGELOG_JS = path.join(CRM, 'js', 'changelog-data.js');

function getVersion() {
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  return m.version || '1.0.0';
}

function getPendingItems() {
  if (!fs.existsSync(PENDING)) return ['Исправления и обновления.'];
  const text = fs.readFileSync(PENDING, 'utf8');
  const lines = text.split(/\n/).map((s) => s.trim()).filter(Boolean);
  return lines.length ? lines : ['Исправления и обновления.'];
}

function today() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function jsonToJsEntry(entry) {
  const items = (entry.items || []).map((s) => `      '${String(s).replace(/'/g, "\\'")}'`);
  const itemsStr = items.length ? `[\n${items.join(',\n')},\n    ]` : '[]';
  const title = entry.title ? `\n    title: '${String(entry.title).replace(/'/g, "\\'")}',` : '';
  const date = entry.date ? `\n    date: '${entry.date}',` : '';
  return `  {\n    version: '${entry.version}',${date}${title}\n    items: ${itemsStr}\n  }`;
}

function main() {
  const version = getVersion();
  let data = [];
  if (fs.existsSync(CHANGELOG_JSON)) {
    data = JSON.parse(fs.readFileSync(CHANGELOG_JSON, 'utf8'));
  }
  if (data[0] && data[0].version === version) {
    console.log('Changelog: запись для версии', version, 'уже есть, пропуск.');
  } else {
    const items = getPendingItems();
    const newEntry = { version, date: today(), items };
    data.unshift(newEntry);
    fs.writeFileSync(CHANGELOG_JSON, JSON.stringify(data, null, 2) + '\n', 'utf8');
    if (fs.existsSync(PENDING)) {
      fs.unlinkSync(PENDING);
      console.log('Changelog: добавлена версия', version, '(пункты из CHANGELOG_PENDING.txt)');
    } else {
      console.log('Changelog: добавлена версия', version);
    }
  }

  const jsEntries = data.map((e) => jsonToJsEntry(e)).join(',\n');
  const jsContent = `// Генерируется из changelog-data.json при запуске pack-extension.sh
// Редактируй changelog-data.json и/или CHANGELOG_PENDING.txt, затем запусти pack-extension.sh

export const CHANGELOG = [
${jsEntries}
];
`;
  fs.writeFileSync(CHANGELOG_JS, jsContent, 'utf8');
}

main();
