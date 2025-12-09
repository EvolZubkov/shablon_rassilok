// outlookIntegration.js - Создание письма в Outlook

async function createOutlookDraft() {
    try {
        const btnCreate = document.getElementById('btn-create-outlook');
        const originalText = btnCreate.innerHTML;
        
        // Показываем индикатор загрузки
        btnCreate.disabled = true;
        btnCreate.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 6v6l4 2"></path>
            </svg>
            Создаю письмо...
        `;

        // Генерируем HTML
        console.log('Генерация HTML...');
        const html = await generateEmailHTML();

        // Отправляем на Python API сервер
        console.log('Отправка на сервер...');
        const response = await fetch(API_CONFIG.OUTLOOK_SERVER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                html: html,
                subject: API_CONFIG.DEFAULT_SUBJECT
            })
        });

        const result = await response.json();

        // Восстанавливаем кнопку
        btnCreate.disabled = false;
        btnCreate.innerHTML = originalText;

        if (result.success) {
            console.log('✓ Письмо создано успешно');
            alert('✅ Письмо открыто в Outlook!\n\nТеперь добавьте получателей и отправьте.');
        } else {
            console.error('Ошибка:', result.error);
            alert('❌ Ошибка создания письма:\n' + result.error);
        }

    } catch (error) {
        console.error('Критическая ошибка:', error);

        // Восстанавливаем кнопку
        const btnCreate = document.getElementById('btn-create-outlook');
        btnCreate.disabled = false;
        btnCreate.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
            </svg>
            Создать письмо в Outlook
        `;

        if (error.message.includes('Failed to fetch')) {
            alert('❌ Ошибка подключения к серверу!\n\nУбедитесь, что запущен Python-сервер:\npython outlook_server.py');
        } else {
            alert('❌ Ошибка:\n' + error.message);
        }
    }
}

// Добавляем стиль для анимации загрузки
const style = document.createElement('style');
style.textContent = `
@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
`;
document.head.appendChild(style);