#!/bin/bash
# Создаёт zip-архивы расширения для Chrome/Edge и Firefox.
# Версия: 1.0.X — при каждой упаковке увеличивается последнее число в manifest и в имени архива.
# Changelog: новая запись добавляется из crm/CHANGELOG_PENDING.txt (по одной строке = пункт).
#            Если файла нет, в changelog попадёт "Исправления и обновления."
set -e
SCRIPT_DIR="$(dirname "$0")"
cd "$SCRIPT_DIR/.."
MANIFEST="crm/manifest.json"
FIREFOX_MANIFEST="crm/manifests/firefox.json"

# --- Увеличиваем версию ---
V=$(grep '"version"' "$MANIFEST" | sed 's/.*"version": *"\([^"]*\)".*/\1/')
V="${V:-1.0.0}"
IFS=. read -r a b c <<< "$V"
c=$((c + 1))
VNEW="$a.$b.$c"

# Обновляем версию в обоих манифестах
tmp=$(mktemp)
sed "s/\"version\": \"$V\"/\"version\": \"$VNEW\"/" "$MANIFEST" > "$tmp" && mv "$tmp" "$MANIFEST"
tmp=$(mktemp)
sed "s/\"version\": \"$V\"/\"version\": \"$VNEW\"/" "$FIREFOX_MANIFEST" > "$tmp" && mv "$tmp" "$FIREFOX_MANIFEST"

# Добавить запись в changelog и сгенерировать js/changelog-data.js
if command -v node >/dev/null 2>&1; then
  node crm/scripts/update-changelog.js
else
  echo "Node не найден — changelog не обновлён. Установи Node и перезапусти скрипт."
fi

# --- Общие исключения ---
EXCLUDES=(
  "crm/.DS_Store"
  "crm/api-for-chrome-extension/*"
  "crm/.git/*"
  "crm/REFACTORING*"
  "crm/DESIGN_SPEC*"
  "crm/API_SPEC*"
  "crm/STORAGE_INFO*"
  "crm/VTIGER_SPEC*"
  "crm/sidepanel-old.js"
  "crm/CHANGELOG_PENDING.txt"
  "crm/manifests/*"
)

EXCLUDE_ARGS=()
for pat in "${EXCLUDES[@]}"; do
  EXCLUDE_ARGS+=(-x "$pat")
done

# --- Сборка Chrome/Edge/Yandex ---
OUT_CHROME="crm-extension-v${VNEW}-chrome-edge-yandex.zip"
zip -r "$OUT_CHROME" crm "${EXCLUDE_ARGS[@]}"
echo "Chrome/Edge/Yandex: $(pwd)/$OUT_CHROME"

# --- Сборка Firefox ---
OUT_FIREFOX="crm-extension-v${VNEW}-firefox.zip"
# Копируем Firefox-манифест поверх основного, собираем, возвращаем обратно
cp "$MANIFEST" "$MANIFEST.bak"
cp "$FIREFOX_MANIFEST" "$MANIFEST"
zip -r "$OUT_FIREFOX" crm "${EXCLUDE_ARGS[@]}"
mv "$MANIFEST.bak" "$MANIFEST"
echo "Firefox:            $(pwd)/$OUT_FIREFOX"

echo ""
echo "Готово! Версия $VNEW"
echo "  Chrome/Edge/Yandex → $OUT_CHROME"
echo "  Firefox            → $OUT_FIREFOX"
