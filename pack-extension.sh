#!/bin/bash
# Создаёт crm-extension-vX.Y.Z.zip для распространения (родительская папка = chrome-extentions)
# Версия: 1.0.X — при каждой упаковке увеличивается последнее число в manifest и в имени архива.
# Changelog: новая запись добавляется из crm/CHANGELOG_PENDING.txt (по одной строке = пункт).
#            Если файла нет, в changelog попадёт "Исправления и обновления."
set -e
SCRIPT_DIR="$(dirname "$0")"
cd "$SCRIPT_DIR/.."
MANIFEST="crm/manifest.json"
V=$(grep '"version"' "$MANIFEST" | sed 's/.*"version": *"\([^"]*\)".*/\1/')
V="${V:-1.0.0}"
IFS=. read -r a b c <<< "$V"
c=$((c + 1))
VNEW="$a.$b.$c"
tmp=$(mktemp)
sed "s/\"version\": \"$V\"/\"version\": \"$VNEW\"/" "$MANIFEST" > "$tmp" && mv "$tmp" "$MANIFEST"

# Добавить запись в changelog и сгенерировать js/changelog-data.js
if command -v node >/dev/null 2>&1; then
  node crm/scripts/update-changelog.js
else
  echo "Node не найден — changelog не обновлён. Установи Node и перезапусти скрипт."
fi

OUT="crm-extension-v${VNEW}.zip"
zip -r "$OUT" crm \
  -x "crm/.DS_Store" \
  -x "crm/api-for-chrome-extension/*" \
  -x "crm/.git/*" \
  -x "crm/REFACTORING*" \
  -x "crm/DESIGN_SPEC*" \
  -x "crm/API_SPEC*" \
  -x "crm/STORAGE_INFO*" \
  -x "crm/VTIGER_SPEC*" \
  -x "crm/sidepanel-old.js" \
  -x "crm/CHANGELOG_PENDING.txt"
echo "Готово: $(pwd)/$OUT (версия $VNEW)"
