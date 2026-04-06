// templatesAPI.js - API для работы с шаблонами

const TemplatesAPI = {
    // ИСПОЛЬЗУЕМ ОТНОСИТЕЛЬНЫЙ ПУТЬ - работает на любом порту!
    baseURL: '/api/templates',  // ← БЕЗ http://localhost:XXXX

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
                return {shared: [], personal: []};
            }
        } catch (error) {
            console.error('Ошибка запроса списка шаблонов:', error);
            return {shared: [], personal: []};
        }
    },

    /**
     * Load a template by stable id.
     */
    async load(id, type = 'personal') {
        try {
            const response = await fetch(`${this.baseURL}/load?id=${encodeURIComponent(id)}&type=${type}`);
            if (response.status === 404) {
                return { notFound: true };
            }
            const data = await response.json();
            if (data.success) {
                return data.template;
            }
            console.error('Ошибка загрузки шаблона:', data.error);
            Toast.error('Ошибка загрузки шаблона: ' + data.error);
            return null;
        } catch (error) {
            console.error('Ошибка запроса шаблона:', error);
            Toast.error('Ошибка подключения к серверу');
            return null;
        }
    },

    /**
     * Сохранить новый шаблон
     */
    async save(name, blocks, type = 'personal', category = '', preview = null, isPreset = false) {
        try {
            const response = await fetch(`${this.baseURL}/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: name,
                    blocks: blocks,
                    type: type,
                    category: category,
                    preview: preview,
                    isPreset: isPreset
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                console.log('✅ Шаблон сохранён:', data.id);
                return data.id || null;
            } else {
                console.error('Ошибка сохранения шаблона:', data.error);
                Toast.error('Ошибка сохранения: ' + data.error);
                return null;
            }
        } catch (error) {
            console.error('Ошибка запроса сохранения:', error);
            Toast.error('Ошибка подключения к серверу');
            return null;
        }
    },

    /**
     * Update blocks (and optionally preview) of an existing template, by id.
     */
    async update(id, type = 'personal', blocks, preview = null) {
        try {
            const response = await fetch(`${this.baseURL}/update`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, type, blocks, preview }),
            });
            const data = await response.json();
            if (data.success) {
                console.log('✅ Шаблон обновлён:', id);
                return true;
            }
            console.error('Ошибка обновления шаблона:', data.error);
            Toast.error('Ошибка обновления: ' + data.error);
            return false;
        } catch (error) {
            console.error('Ошибка запроса обновления:', error);
            Toast.error('Ошибка подключения к серверу');
            return false;
        }
    },

    /**
     * Delete a template by id.
     */
    async delete(id, type = 'personal') {
        try {
            const response = await fetch(
                `${this.baseURL}/delete?id=${encodeURIComponent(id)}&type=${type}`,
                { method: 'DELETE' }
            );
            const data = await response.json();
            if (data.success) {
                console.log('✅ Шаблон удалён:', id);
                return true;
            }
            console.error('Ошибка удаления шаблона:', data.error);
            Toast.error('Ошибка удаления: ' + data.error);
            return false;
        } catch (error) {
            console.error('Ошибка запроса удаления:', error);
            Toast.error('Ошибка подключения к серверу');
            return false;
        }
    },

    /**
     * Rename a template by id (in-place, file path unchanged).
     * Returns true on success, false on failure.
     */
    async rename(id, newName, type = 'personal') {
        try {
            const response = await fetch(`${this.baseURL}/rename`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, newName, type }),
            });
            const data = await response.json();
            if (data.success) {
                console.log('✅ Шаблон переименован:', id, '→', newName);
                return true;
            }
            console.error('Ошибка переименования шаблона:', data.error);
            Toast.error('Ошибка переименования: ' + data.error);
            return false;
        } catch (error) {
            console.error('Ошибка запроса переименования:', error);
            Toast.error('Ошибка подключения к серверу');
            return false;
        }
    },
    /**
     * Получить список категорий
     */
    async getCategories() {
        try {
            const response = await fetch(`${this.baseURL}/categories`);
            const data = await response.json();
            
            if (data.success) {
                return data.categories || [];
            } else {
                console.error('Ошибка загрузки категорий:', data.error);
                return [];
            }
        } catch (error) {
            console.error('Ошибка запроса категорий:', error);
            return [];
        }
    },

    /**
     * Сохранить новую категорию
     */
    async saveCategory(categoryName) {
        try {
            const response = await fetch(`${this.baseURL}/categories`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: categoryName })
            });
            
            const data = await response.json();
            return data.success;
        } catch (error) {
            console.error('Ошибка сохранения категории:', error);
            return false;
        }
    }
};