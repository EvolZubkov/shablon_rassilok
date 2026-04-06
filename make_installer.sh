#!/usr/bin/env bash
# make_installer.sh — runs inside the Docker build container.
# Produces a self-extracting EmailBuilder.sh installer for ALT Linux.
#
# The generated script:
#   - fresh install  : extracts binary, icon, config, creates desktop shortcut
#   - update         : replaces binary and icon, keeps config/lic unchanged
#   - same version   : skips install block, launches immediately
#
# Usage (called from build_linux_alt.bat):
#   bash make_installer.sh <dist_dir>

set -e

DIST="$1"
if [ -z "$DIST" ]; then
  echo "Usage: $0 <dist_dir>"
  exit 1
fi

BINARY="$DIST/EmailBuilder"
ICON="$DIST/icon.png"
CFG="$DIST/config.ini"
OUTPUT="$DIST/EmailBuilder.sh"

if [ ! -f "$BINARY" ]; then
  echo "Error: $BINARY not found"
  exit 1
fi

# Read version from _version.py located next to this script
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
VERSION=$(grep -oP '(?<=__version__ = ")[^"]+' "$PROJECT_ROOT/_version.py" 2>/dev/null || true)
if [ -z "$VERSION" ]; then
  # Fallback: match single-quoted form
  VERSION=$(grep "__version__" "$PROJECT_ROOT/_version.py" | sed "s/.*['\"]\\([^'\"]*\\)['\"].*/\\1/" 2>/dev/null || true)
fi
VERSION="${VERSION:-0.0.0}"
echo "Версия инсталлятора: $VERSION"

HAS_ICON=0
[ -f "$ICON" ] && HAS_ICON=1

HAS_CFG=0
[ -f "$CFG" ] && HAS_CFG=1

# ── Write script header (variable expansion active — $VERSION is baked in) ────
cat > "$OUTPUT" << SCRIPT_HEAD
#!/usr/bin/env bash
# Email Builder — self-extracting installer / updater / launcher
# Run: bash EmailBuilder.sh
# No root or sudo required.
set -e

INSTALLER_VERSION="$VERSION"

INSTALL_DIR="\$HOME/EmailBuilder"
BIN="\$INSTALL_DIR/EmailBuilder"
ICON_PATH="\$INSTALL_DIR/icon.png"

# Locate directory of this script regardless of how it was invoked
SCRIPT_DIR="\$(cd "\$(dirname "\$0")" && pwd)"

# Resolve desktop directory (ALT Linux uses Russian name)
DESKTOP_DIR="\$HOME/Desktop"
for _D in "\$HOME/Рабочий стол" "\$HOME/Desktop" "\$HOME/Рабочий_стол"; do
  if [ -d "\$_D" ]; then DESKTOP_DIR="\$_D"; break; fi
done
mkdir -p "\$DESKTOP_DIR"
DESKTOP_FILE="\$DESKTOP_DIR/EmailBuilder.desktop"

SCRIPT_HEAD

# ── Write functions and logic (no expansion — $ is literal) ───────────────────
cat >> "$OUTPUT" << 'SCRIPT_BODY'

# Extract a named section from this script file (base64-encoded, single line)
_extract() {
  local marker="$1" dest="$2"
  local start
  start=$(grep -n "^SECTION:${marker}$" "$0" | cut -d: -f1)
  [ -z "$start" ] && return 1
  tail -n +$(( start + 1 )) "$0" | head -n 1 | base64 -d > "$dest"
}

# Returns 0 (true) if semver $1 is strictly greater than $2
_version_gt() {
  local IFS=.
  local a=($1) b=($2)
  local i av bv
  for i in 0 1 2; do
    av="${a[$i]:-0}"; bv="${b[$i]:-0}"
    [ "$av" -gt "$bv" ] && return 0
    [ "$av" -lt "$bv" ] && return 1
  done
  return 1  # equal
}

# (Re)create the desktop .desktop file
_make_shortcut() {
  {
    echo "[Desktop Entry]"
    echo "Version=1.0"
    echo "Type=Application"
    echo "Name=Email Builder"
    echo "Comment=HTML email and meeting builder"
    echo "Exec=$BIN"
    [ -f "$ICON_PATH" ] && echo "Icon=$ICON_PATH"
    echo "Terminal=false"
    echo "Categories=Office;"
  } > "$DESKTOP_FILE"
  chmod +x "$DESKTOP_FILE"
  command -v gio >/dev/null 2>&1 \
    && gio set "$DESKTOP_FILE" metadata::trusted true 2>/dev/null || true
}

# ── Determine action ──────────────────────────────────────────────────────────
INSTALLED_VERSION=""
[ -f "$INSTALL_DIR/version.txt" ] \
  && INSTALLED_VERSION=$(cat "$INSTALL_DIR/version.txt" 2>/dev/null || true)

if [ ! -f "$BIN" ]; then

  # ── Fresh install ─────────────────────────────────────────────────────────
  echo "Установка Email Builder $INSTALLER_VERSION..."
  mkdir -p "$INSTALL_DIR"

  echo "  Распаковка бинарного файла..."
  if ! _extract BINARY "$BIN.new"; then
    echo "[ERROR] Не удалось извлечь бинарный файл"
    exit 1
  fi
  chmod +x "$BIN.new"
  mv "$BIN.new" "$BIN"

  _extract ICON "$ICON_PATH" 2>/dev/null || true

  if [ ! -f "$INSTALL_DIR/config.ini" ]; then
    _extract CONFIG "$INSTALL_DIR/config.ini" 2>/dev/null || true
  fi

  if [ -f "$SCRIPT_DIR/.lic" ] && [ ! -f "$INSTALL_DIR/.lic" ]; then
    echo "  Копирование .lic..."
    cp "$SCRIPT_DIR/.lic" "$INSTALL_DIR/.lic"
  fi

  echo "$INSTALLER_VERSION" > "$INSTALL_DIR/version.txt"

  _make_shortcut
  echo "  Ярлык создан: $DESKTOP_FILE"
  echo "Установка завершена."

elif _version_gt "$INSTALLER_VERSION" "${INSTALLED_VERSION:-0.0.0}"; then

  # ── Update ────────────────────────────────────────────────────────────────
  echo "Обновление Email Builder ${INSTALLED_VERSION:-?} → $INSTALLER_VERSION..."

  echo "  Обновление бинарного файла..."
  if ! _extract BINARY "$BIN.new"; then
    echo "[ERROR] Не удалось извлечь бинарный файл"
    exit 1
  fi
  chmod +x "$BIN.new"
  mv "$BIN.new" "$BIN"   # atomic on same filesystem

  _extract ICON "$ICON_PATH" 2>/dev/null || true

  # config.ini — не перезаписываем: пользователь мог изменить настройки
  # .lic — копируем только если ещё не установлен
  if [ -f "$SCRIPT_DIR/.lic" ] && [ ! -f "$INSTALL_DIR/.lic" ]; then
    echo "  Копирование .lic..."
    cp "$SCRIPT_DIR/.lic" "$INSTALL_DIR/.lic"
  fi

  echo "$INSTALLER_VERSION" > "$INSTALL_DIR/version.txt"

  _make_shortcut
  echo "Обновление завершено."

else

  # ── Already up to date ────────────────────────────────────────────────────
  echo "Email Builder $INSTALLED_VERSION уже установлен и актуален."

fi

# ── Launch ────────────────────────────────────────────────────────────────────
exec "$BIN"

# ── Data sections (do not edit below this line) ───────────────────────────────
SCRIPT_BODY

# ── Append binary and optional payloads as labelled base64 sections ───────────
echo "Кодирование бинарника..."
echo "SECTION:BINARY" >> "$OUTPUT"
base64 -w 0 "$BINARY" >> "$OUTPUT"
echo "" >> "$OUTPUT"

if [ "$HAS_ICON" = "1" ]; then
  echo "Кодирование иконки..."
  echo "SECTION:ICON" >> "$OUTPUT"
  base64 -w 0 "$ICON" >> "$OUTPUT"
  echo "" >> "$OUTPUT"
fi

if [ "$HAS_CFG" = "1" ]; then
  echo "Кодирование config.ini..."
  echo "SECTION:CONFIG" >> "$OUTPUT"
  base64 -w 0 "$CFG" >> "$OUTPUT"
  echo "" >> "$OUTPUT"
fi

chmod +x "$OUTPUT"

# Remove intermediate artifacts bundled into the installer
rm -f "$BINARY"
[ -f "$ICON" ] && rm -f "$ICON"

# ── Generate INSTALL.md alongside the installer ───────────────────────────────
README="$DIST/INSTALL.md"
cat > "$README" << README_EOF
# Email Builder $VERSION — Установка (ALT Linux)

## Содержимое дистрибутива

| Файл | Описание |
|---|---|
| \`EmailBuilder.sh\` | Самоустанавливающийся скрипт (бинарник встроен) |
| \`config.ini\` | Конфигурация приложения |
| \`.lic\` | Токен администратора (только для администраторов) |

Положите все нужные файлы в одну папку перед запуском.

## Установка

\`\`\`bash
bash EmailBuilder.sh
\`\`\`

Приложение устанавливается в \`~/EmailBuilder/\`.
На рабочем столе создаётся ярлык Email Builder.

## Обновление

Запустите новый установщик той же командой:

\`\`\`bash
bash EmailBuilder.sh
\`\`\`

Скрипт автоматически определит установленную версию.
При наличии более новой версии обновит только бинарный файл.
Настройки (\`config.ini\`) сохраняются без изменений.

## Настройка config.ini

Откройте \`config.ini\` и укажите путь к сетевой папке:

\`\`\`ini
[app]
network_path_smb        = //server/share/email-builder
network_path_linux_hint = email-builder
port = 7788
\`\`\`

При первом запуске приложение загрузит ресурсы из сетевой папки в
локальный кеш. Последующие запуски не требуют постоянного доступа к сети.

## Режим администратора

Положите файл \`.lic\` рядом с \`EmailBuilder.sh\` перед установкой,
или скопируйте его в \`~/EmailBuilder/.lic\` вручную после.

## Диагностика

| Симптом | Действие |
|---|---|
| Приложение не запускается | Проверить \`config.ini\`, убедиться в правильности путей |
| Ресурсы не загружаются | Проверить доступность сетевой папки |
| Режим администратора недоступен | Убедиться что \`.lic\` находится в \`~/EmailBuilder/\` |
README_EOF

echo "README created:   $README"
echo "Installer created: $OUTPUT  (version $VERSION)"
