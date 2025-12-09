// templatesAPI.js - API для работы с шаблонами

const TemplatesAPI = {
    baseURL: 'http://localhost:5000/api/templates',

    /**
     * Получить список всех шаблонов
     */
    async getList() {
        try {
            const response = await fetch(`${this.baseURL}/list`);
            const data = await response.json();
            
            if (data.success) {
                return data.templates;
            } else {
                console.error('Ошибка загрузки списка шаблонов:', data.error);
                return [];
            }
        } catch (error) {
            console.error('Ошибка запроса списка шаблонов:', error);
            return [];
        }
    },

    /**
     * Загрузить шаблон по имени файла
     */
    async load(filename) {
        try {
            const response = await fetch(`${this.baseURL}/load?filename=${encodeURIComponent(filename)}`);
            const data = await response.json();
            
            if (data.success) {
                return data.template;
            } else {
                console.error('Ошибка загрузки шаблона:', data.error);
                alert('❌ Ошибка загрузки шаблона: ' + data.error);
                return null;
            }
        } catch (error) {
            console.error('Ошибка запроса шаблона:', error);
            alert('❌ Ошибка подключения к серверу');
            return null;
        }
    },

    /**
     * Сохранить новый шаблон
     */
    async save(name, blocks) {
        try {
            const response = await fetch(`${this.baseURL}/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: name,
                    blocks: blocks
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                console.log('✅ Шаблон сохранён:', data.filename);
                return true;
            } else {
                console.error('Ошибка сохранения шаблона:', data.error);
                alert('❌ Ошибка сохранения: ' + data.error);
                return false;
            }
        } catch (error) {
            console.error('Ошибка запроса сохранения:', error);
            alert('❌ Ошибка подключения к серверу');
            return false;
        }
    },

    /**
     * Удалить шаблон
     */
    async delete(filename) {
        try {
            const response = await fetch(`${this.baseURL}/delete?filename=${encodeURIComponent(filename)}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                console.log('✅ Шаблон удалён');
                return true;
            } else {
                console.error('Ошибка удаления шаблона:', data.error);
                alert('❌ Ошибка удаления: ' + data.error);
                return false;
            }
        } catch (error) {
            console.error('Ошибка запроса удаления:', error);
            alert('❌ Ошибка подключения к серверу');
            return false;
        }
    },

    /**
     * Переименовать шаблон
     */
    async rename(filename, newName) {
        try {
            const response = await fetch(`${this.baseURL}/rename`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    filename: filename,
                    newName: newName
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                console.log('✅ Шаблон переименован:', data.newFilename);
                return data.newFilename;
            } else {
                console.error('Ошибка переименования шаблона:', data.error);
                alert('❌ Ошибка переименования: ' + data.error);
                return null;
            }
        } catch (error) {
            console.error('Ошибка запроса переименования:', error);
            alert('❌ Ошибка подключения к серверу');
            return null;
        }
    }
};