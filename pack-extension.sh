#!/bin/bash
# Создаёт zip-архивы расширения для Chrome/Edge/Yandex, Chrome Web Store и Firefox.
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
  "crm/*/.DS_Store"
  "crm/api-for-chrome-extension/*"
  "crm/.git/*"
  "crm/.gitignore"
  "crm/docs/*"
  "crm/scripts/*"
  "crm/manifests/*"
  "crm/REFACTORING*"
  "crm/DESIGN_SPEC*"
  "crm/API_SPEC*"
  "crm/STORAGE_INFO*"
  "crm/VTIGER_SPEC*"
  "crm/sidepanel-old.js"
  "crm/CHANGELOG_PENDING.txt"
  "crm/CHANGELOG_PENDING.example.txt"
  "crm/README.md"
  "crm/УСТАНОВКА.txt"
  "crm/pack-extension.sh"
  "crm/manifest.json.bak"
)

EXCLUDE_ARGS=()
for pat in "${EXCLUDES[@]}"; do
  EXCLUDE_ARGS+=(-x "$pat")
done

# --- Сборка Chrome/Edge/Yandex ---
OUT_CHROME="crm-extension-v${VNEW}-chrome-edge-yandex.zip"
zip -r "$OUT_CHROME" crm "${EXCLUDE_ARGS[@]}"
echo "Chrome/Edge/Yandex: $(pwd)/$OUT_CHROME"

# --- Сборка для Chrome Web Store (manifest.json в корне архива) ---
# CWS требует manifest.json в корне zip, поэтому разворачиваем chrome-архив
# и переупаковываем содержимое папки crm/ без внешней обёртки.
OUT_STORE="crm-extension-v${VNEW}-store.zip"
OUT_STORE_ABS="$(pwd)/$OUT_STORE"
rm -f "$OUT_STORE_ABS"
TMP_STORE="$(mktemp -d)"
unzip -q "$OUT_CHROME" -d "$TMP_STORE"
( cd "$TMP_STORE/crm" && zip -rqX "$OUT_STORE_ABS" . )
rm -rf "$TMP_STORE"
echo "Chrome Web Store:   $(pwd)/$OUT_STORE"

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
echo "  Chrome/Edge/Yandex → $OUT_CHROME (для «Загрузить распакованное»)"
echo "  Chrome Web Store    → $OUT_STORE (manifest в корне — для магазина)"
echo "  Firefox            → $OUT_FIREFOX"
