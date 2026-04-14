// outlookIntegration.js
// Перенаправляет кнопки "Письмо" и "Встреча" на ExchangeModals.
// ExchangeModals подключается ниже по странице и инициализируется сам.

document.addEventListener('DOMContentLoaded', () => {
    const btnEmail   = document.getElementById('btn-create-outlook');
    const btnMeeting = document.getElementById('btn-create-meeting');

    if (btnEmail) {
        btnEmail.addEventListener('click', () => {
            if (typeof ExchangeModals !== 'undefined') {
                ExchangeModals.openEmail();
            } else {
                Toast.error('ExchangeModals не загружен');
            }
        });
    }

    if (btnMeeting) {
        btnMeeting.addEventListener('click', () => {
            if (typeof ExchangeModals !== 'undefined') {
                ExchangeModals.openMeeting();
            } else {
                Toast.error('ExchangeModals не загружен');
            }
        });
    }
});