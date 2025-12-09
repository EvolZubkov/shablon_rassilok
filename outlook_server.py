"""
HTTP API сервер для создания писем в Outlook
Запуск: python outlook_server.py
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import base64
from outlook_sender import create_outlook_draft, convert_font_to_base64

app = Flask(__name__, static_folder='.')
CORS(app)  # Разрешаем запросы из браузера

# Базовый путь проекта
BASE_PATH = os.path.dirname(os.path.abspath(__file__))


# === РАЗДАЧА СТАТИЧЕСКИХ ФАЙЛОВ ===

@app.route('/')
def index():
    """Главная страница"""
    return send_from_directory('.', 'index.html')


@app.route('/<path:filename>')
def serve_static(filename):
    """Раздача всех статических файлов (HTML, CSS, JS, изображений)"""
    try:
        return send_from_directory('.', filename)
    except Exception as e:
        return jsonify({'error': f'File not found: {filename}'}), 404


# === API ENDPOINTS ===

@app.route('/create-outlook-draft', methods=['POST'])
def create_draft():
    """
    Endpoint для создания черновика в Outlook
    
    Принимает JSON:
    {
        "html": "HTML-содержимое письма",
        "subject": "Тема письма (опционально)"
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'html' not in data:
            return jsonify({
                'success': False,
                'error': 'Не передан HTML контент'
            }), 400
        
        html_content = data['html']
        subject = data.get('subject', 'Новое письмо')
        
        # Путь к шрифту
        font_path = os.path.join(BASE_PATH, 'fonts', 'font.woff')
        
        # Создаём письмо
        success = create_outlook_draft(
            html_content=html_content,
            subject=subject,
            base_path=BASE_PATH,
            font_path=font_path
        )
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Письмо успешно создано в Outlook'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Не удалось создать письмо'
            }), 500
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/health', methods=['GET'])
def health():
    """Проверка работоспособности сервера"""
    return jsonify({'status': 'ok', 'message': 'Server is running'})

# === TEMPLATES API ===

import json
import os
from datetime import datetime
from werkzeug.utils import secure_filename

TEMPLATES_DIR = os.path.join(BASE_PATH, 'templates')

# Создаём папку если не существует
if not os.path.exists(TEMPLATES_DIR):
    os.makedirs(TEMPLATES_DIR)

@app.route('/api/templates/list', methods=['GET'])
def get_templates_list():
    """
    Получить список всех шаблонов
    Возвращает: [{"name": "Вебинар", "filename": "template_вебинар.json", "created": "..."}]
    """
    try:
        templates = []
        
        for filename in os.listdir(TEMPLATES_DIR):
            if filename.endswith('.json'):
                filepath = os.path.join(TEMPLATES_DIR, filename)
                
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        templates.append({
                            'name': data.get('name', filename),
                            'filename': filename,
                            'created': data.get('created', ''),
                        })
                except Exception as e:
                    print(f"Ошибка чтения {filename}: {e}")
                    continue
        
        # Сортировка по имени
        templates.sort(key=lambda x: x['name'].lower())
        
        return jsonify({
            'success': True,
            'templates': templates
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/templates/load', methods=['GET'])
def load_template():
    """
    Загрузить шаблон по имени файла
    Query: ?filename=template_вебинар.json
    """
    try:
        filename = request.args.get('filename')
        
        if not filename:
            return jsonify({
                'success': False,
                'error': 'Не указан filename'
            }), 400
        
        filepath = os.path.join(TEMPLATES_DIR, filename)
        
        if not os.path.exists(filepath):
            return jsonify({
                'success': False,
                'error': 'Шаблон не найден'
            }), 404
        
        with open(filepath, 'r', encoding='utf-8') as f:
            template_data = json.load(f)
        
        return jsonify({
            'success': True,
            'template': template_data
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/templates/save', methods=['POST'])
def save_template():
    """
    Сохранить новый шаблон
    Body: {
        "name": "Вебинар",
        "blocks": [...]
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'name' not in data or 'blocks' not in data:
            return jsonify({
                'success': False,
                'error': 'Не переданы name или blocks'
            }), 400
        
        template_name = data['name']
        blocks = data['blocks']
        
        # Генерируем безопасное имя файла
        safe_name = template_name.replace(' ', '_').replace('/', '_')
        filename = f"template_{safe_name}.json"
        filepath = os.path.join(TEMPLATES_DIR, filename)
        
        # Структура шаблона
        template_data = {
            'id': f"tpl_{int(datetime.now().timestamp())}",
            'name': template_name,
            'created': datetime.now().isoformat(),
            'blocks': blocks
        }
        
        # Сохраняем
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(template_data, f, ensure_ascii=False, indent=2)
        
        return jsonify({
            'success': True,
            'message': f'Шаблон "{template_name}" сохранён',
            'filename': filename
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/templates/delete', methods=['DELETE'])
def delete_template():
    """
    Удалить шаблон
    Query: ?filename=template_вебинар.json
    """
    try:
        filename = request.args.get('filename')
        
        if not filename:
            return jsonify({
                'success': False,
                'error': 'Не указан filename'
            }), 400
        
        filepath = os.path.join(TEMPLATES_DIR, filename)
        
        if not os.path.exists(filepath):
            return jsonify({
                'success': False,
                'error': 'Шаблон не найден'
            }), 404
        
        os.remove(filepath)
        
        return jsonify({
            'success': True,
            'message': 'Шаблон удалён'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/templates/rename', methods=['PUT'])
def rename_template():
    """
    Переименовать шаблон
    Body: {
        "filename": "template_старое.json",
        "newName": "Новое название"
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'filename' not in data or 'newName' not in data:
            return jsonify({
                'success': False,
                'error': 'Не переданы filename или newName'
            }), 400
        
        old_filename = data['filename']
        new_name = data['newName']
        
        old_filepath = os.path.join(TEMPLATES_DIR, old_filename)
        
        if not os.path.exists(old_filepath):
            return jsonify({
                'success': False,
                'error': 'Шаблон не найден'
            }), 404
        
        # Читаем старый файл
        with open(old_filepath, 'r', encoding='utf-8') as f:
            template_data = json.load(f)
        
        # Обновляем имя
        template_data['name'] = new_name
        
        # Новое имя файла
        safe_name = new_name.replace(' ', '_').replace('/', '_')
        new_filename = f"template_{safe_name}.json"
        new_filepath = os.path.join(TEMPLATES_DIR, new_filename)
        
        # Сохраняем с новым именем
        with open(new_filepath, 'w', encoding='utf-8') as f:
            json.dump(template_data, f, ensure_ascii=False, indent=2)
        
        # Удаляем старый файл
        if old_filepath != new_filepath:
            os.remove(old_filepath)
        
        return jsonify({
            'success': True,
            'message': 'Шаблон переименован',
            'newFilename': new_filename
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 Сервер конструктора писем запущен!")
    print("=" * 60)
    print("📧 Откройте в браузере: http://localhost:5000")
    print("🔍 Проверка здоровья: http://localhost:5000/health")
    print("🛑 Для остановки: Ctrl+C")
    print("=" * 60)
    print()
    
    # Запускаем сервер
    app.run(
        host='127.0.0.1',
        port=5000,
        debug=True,  # Включаем debug для вывода ошибок
        threaded=True
    )