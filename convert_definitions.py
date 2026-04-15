"""
Конвертер definitions.js → config.json
Читает JavaScript файл и создаёт JSON конфиг
"""

import json
import re
import os

def parse_js_array(js_content, array_name):
    """Извлекает массив из JS кода"""
    # Ищем const ARRAY_NAME = [...]
    pattern = rf'const\s+{array_name}\s*=\s*\[(.*?)\];'
    match = re.search(pattern, js_content, re.DOTALL)
    
    if not match:
        return []
    
    array_content = match.group(1)
    
    # Парсим объекты { id: '...', src: '...', label: '...' }
    items = []
    object_pattern = r'\{([^}]+)\}'
    
    for obj_match in re.finditer(object_pattern, array_content):
        obj_str = obj_match.group(1)
        
        item = {}
        
        # id
        id_match = re.search(r"id:\s*['\"]([^'\"]+)['\"]", obj_str)
        if id_match:
            item['id'] = id_match.group(1)
        
        # src
        src_match = re.search(r"src:\s*['\"]([^'\"]+)['\"]", obj_str)
        if src_match:
            item['src'] = src_match.group(1)
        
        # label
        label_match = re.search(r"label:\s*['\"]([^'\"]+)['\"]", obj_str)
        if label_match:
            item['label'] = label_match.group(1)
        
        if item:
            items.append(item)
    
    return items

def convert_definitions_to_json(js_file_path, json_file_path):
    """Конвертирует definitions.js в config.json"""
    
    print(f"📖 Чтение {js_file_path}...")
    
    # Читаем JS файл
    with open(js_file_path, 'r', encoding='utf-8') as f:
        js_content = f.read()
    
    print("🔄 Парсинг массивов...")
    
    # Извлекаем массивы
    config = {
        "version": "1.0",
        "banners": parse_js_array(js_content, 'BANNERS'),
        "icons": {
            "important": parse_js_array(js_content, 'IMPORTANT_ICONS')
        },
        "expertBadges": parse_js_array(js_content, 'EXPERT_BADGE_ICONS'),
        "bullets": parse_js_array(js_content, 'BULLET_TYPES'),
        "buttonIcons": parse_js_array(js_content, 'BUTTON_ICONS')
    }
    
    print(f"✅ Найдено:")
    print(f"   - Баннеров: {len(config['banners'])}")
    print(f"   - Иконок важно: {len(config['icons']['important'])}")
    print(f"   - Значков экспертов: {len(config['expertBadges'])}")
    print(f"   - Буллетов: {len(config['bullets'])}")
    print(f"   - Иконок кнопок: {len(config['buttonIcons'])}")
    
    # Сохраняем JSON
    print(f"\n💾 Сохранение {json_file_path}...")
    with open(json_file_path, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    
    print("✅ Конвертация завершена!")
    print(f"\n📄 Файл создан: {json_file_path}")
    print(f"📊 Размер: {os.path.getsize(json_file_path)} байт")

if __name__ == '__main__':
    # Пути к файлам
    js_file = 'static/js/definitions.js'
    json_file = 'config.json'
    
    # Проверяем существование
    if not os.path.exists(js_file):
        print(f"❌ Файл не найден: {js_file}")
        print("Укажите правильный путь к definitions.js")
        exit(1)
    
    # Конвертируем
    convert_definitions_to_json(js_file, json_file)
    
    print("\n" + "="*60)
    print("🎯 Что дальше:")
    print("="*60)
    print("1. Скопируй config.json на сервер:")
    print("   \\\\server\\email-builder\\config.json")
    print()
    print("2. Когда добавляешь новый баннер:")
    print("   - Открой config.json в Блокноте")
    print("   - Добавь в раздел 'banners':")
    print('     {')
    print('       "id": "b21",')
    print('       "src": "banners/banner-21.png",')
    print('       "label": "Новый баннер"')
    print('     }')
    print("   - Сохрани файл")
    print("   - Увеличь version.txt: 1.0 → 1.1")
    print("="*60)