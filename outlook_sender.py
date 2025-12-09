"""
Модуль для создания черновиков писем в Outlook
"""

import os
import re
import base64
import mimetypes
import pythoncom
import win32com.client as win32
import tempfile
import uuid


def convert_font_to_base64(font_path):
    """Конвертирует файл шрифта в base64"""
    try:
        with open(font_path, 'rb') as font_file:
            font_data = font_file.read()
            return base64.b64encode(font_data).decode('utf-8')
    except Exception as e:
        print(f"⚠️  Предупреждение: не удалось загрузить шрифт {font_path}: {e}")
        return ""


def process_local_images_in_html(html_content, base_path=None):
    """
    Находит все <img src="путь_к_файлу"> в HTML и заменяет локальные файлы на base64
    """
    if base_path is None:
        base_path = os.getcwd()

    img_pattern = re.compile(
        r'<img\s+([^>]*\s+)?src=["\'](?!(?:https?://|data:))([^"\']+)["\']([^>]*)>',
        re.IGNORECASE
    )

    def replace_image(match):
        try:
            before_attrs = match.group(1) or ''
            file_path = match.group(2)
            after_attrs = match.group(3) or ''

            if not os.path.isabs(file_path):
                file_path = os.path.normpath(os.path.join(base_path, file_path))

            if not os.path.exists(file_path):
                print(f"⚠️  Изображение не найдено: {file_path}")
                return match.group(0)

            with open(file_path, 'rb') as img_file:
                img_data = img_file.read()
                img_base64 = base64.b64encode(img_data).decode('utf-8')

            mime_type, _ = mimetypes.guess_type(file_path)
            if mime_type is None:
                ext = os.path.splitext(file_path)[1].lower()
                mime_types = {
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.bmp': 'image/bmp',
                    '.svg': 'image/svg+xml',
                }
                mime_type = mime_types.get(ext, 'image/png')

            data_uri = f"data:{mime_type};base64,{img_base64}"
            print(f"✓ Изображение конвертировано: {os.path.basename(file_path)}")

            return f'<img {before_attrs}src="{data_uri}"{after_attrs}>'

        except Exception as e:
            print(f"⚠️  Ошибка обработки изображения: {e}")
            return match.group(0)

    try:
        result = img_pattern.sub(replace_image, html_content)
        return result
    except Exception as e:
        print(f"⚠️  Ошибка обработки HTML: {e}")
        return html_content


def embed_font_in_html(html_content, font_base64, font_format='woff'):
    """Встраивает base64-шрифт в HTML"""
    if not font_base64:
        print("⚠️  Шрифт не будет встроен")
        return html_content
    
    font_mime = {
        'woff': 'font/woff',
        'woff2': 'font/woff2',
        'ttf': 'font/ttf',
        'otf': 'font/otf'
    }.get(font_format.lower(), 'font/woff')
    
    font_face = f"""
@font-face {{
  font-family: 'RostelecomBasis';
  src: url(data:{font_mime};charset=utf-8;base64,{font_base64}) format('{font_format}');
  font-weight: normal;
  font-style: normal;
}}
"""
    
    if '<style>' in html_content:
        html_content = html_content.replace('<style>', f'<style>\n{font_face}', 1)
    elif '</head>' in html_content:
        html_content = html_content.replace('</head>', f'<style>\n{font_face}\n</style>\n</head>', 1)
    else:
        html_content = f'<style>\n{font_face}\n</style>\n' + html_content
    
    print("✓ Шрифт встроен в HTML")
    return html_content


def embed_data_images_as_cid(mail, html_content):
    """
    КЛЮЧЕВАЯ ФУНКЦИЯ!
    Находит все <img src="data:image/...">, сохраняет во временные файлы,
    добавляет как вложения в письмо и заменяет на cid:
    """
    # Улучшенное регулярное выражение для поиска data:image
    img_pattern = re.compile(
        r'<img\s+([^>]*?)src=["\'](data:image/[^"\']+)["\']([^>]*)>',
        re.IGNORECASE | re.DOTALL
    )

    temp_files = []
    cid_counter = 0

    def replace_with_cid(match):
        nonlocal cid_counter
        try:
            before_attrs = match.group(1) or ''
            data_uri = match.group(2)
            after_attrs = match.group(3) or ''

            # Парсим data URI
            data_match = re.match(r'data:(image/[^;]+);base64,(.+)', data_uri, re.DOTALL)
            if not data_match:
                print(f"⚠️  Неверный формат data URI")
                return match.group(0)

            mime_type, b64data = data_match.groups()

            # Определяем расширение
            ext_map = {
                'image/png': '.png',
                'image/jpeg': '.jpg',
                'image/jpg': '.jpg',
                'image/gif': '.gif',
                'image/bmp': '.bmp'
            }
            ext = ext_map.get(mime_type.lower(), '.png')

            # Декодируем base64
            img_bytes = base64.b64decode(b64data)

            # Создаём уникальный CID
            cid_counter += 1
            cid = f"image{cid_counter}_{uuid.uuid4().hex[:8]}"

            # Сохраняем во временный файл
            tmp_dir = tempfile.gettempdir()
            file_path = os.path.join(tmp_dir, f"outlook_img_{cid}{ext}")

            with open(file_path, 'wb') as f:
                f.write(img_bytes)

            # Добавляем как вложение
            attachment = mail.Attachments.Add(file_path)
            
            # КРИТИЧНО: Устанавливаем Content-ID через PropertyAccessor
            pa = attachment.PropertyAccessor
            # PR_ATTACH_CONTENT_ID = http://schemas.microsoft.com/mapi/proptag/0x3712001F
            pa.SetProperty("http://schemas.microsoft.com/mapi/proptag/0x3712001F", cid)

            temp_files.append(file_path)

            print(f"✓ Картинка встроена как CID: {cid}")

            # Заменяем src на cid:
            return f'<img {before_attrs}src="cid:{cid}"{after_attrs}>'

        except Exception as e:
            print(f"⚠️  Ошибка встраивания картинки: {e}")
            return match.group(0)

    new_html = img_pattern.sub(replace_with_cid, html_content)
    
    return new_html, temp_files


def create_outlook_draft(html_content, subject="", base_path=None, font_path=None):
    """
    Создает черновик письма в Outlook с HTML-содержимым
    """
    temp_files = []
    
    try:
        print("\n" + "=" * 60)
        print("📧 Создание письма в Outlook...")
        print("=" * 60)
        
        pythoncom.CoInitialize()
        
        print("🔗 Подключение к Outlook...")
        outlook = win32.Dispatch("Outlook.Application")
        
        print("🖼️  Обработка изображений...")
        
        # 1) Локальные файлы → data:image/...;base64,...
        html_with_images = process_local_images_in_html(html_content, base_path)
        
        # 2) Встраиваем шрифт
        if font_path and os.path.exists(font_path):
            print(f"🔤 Встраивание шрифта: {os.path.basename(font_path)}")
            font_base64 = convert_font_to_base64(font_path)
            font_ext = os.path.splitext(font_path)[1].lower().replace('.', '')
            html_with_font = embed_font_in_html(html_with_images, font_base64, font_ext)
        else:
            print("⚠️  Шрифт не найден")
            html_with_font = html_with_images

        print("✉️  Создание черновика письма...")
        mail = outlook.CreateItem(0)

        # 3) КРИТИЧНО: data:image → CID вложения
        print("🔗 Встраивание картинок как CID вложений...")
        html_final, temp_files = embed_data_images_as_cid(mail, html_with_font)

        # 4) Устанавливаем тему и HTML
        mail.Subject = subject if subject else "Новое письмо"
        mail.HTMLBody = html_final

        # ВАЖНО: Показываем письмо
        mail.Display()
        
        print("=" * 60)
        print("✅ Письмо успешно создано и открыто в Outlook!")
        print(f"✅ Встроено изображений: {len(temp_files)}")
        print("=" * 60 + "\n")
        
        return True
        
    except Exception as e:
        print("=" * 60)
        print(f"❌ ОШИБКА при создании письма: {e}")
        import traceback
        traceback.print_exc()
        print("=" * 60 + "\n")
        return False
    
    finally:
        # Удаляем временные файлы через некоторое время
        # (не сразу, т.к. Outlook может их ещё читать)
        pass