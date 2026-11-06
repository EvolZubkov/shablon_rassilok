// shared/panelLayout.js — подключает изменяемую ширину к боковым панелям редактора.
// Пользовательский редактор: левая панель (рассылка, библиотека). Админ: левая и правая.

(function () {
    const MIN_CANVAS = 640;   // письмо шириной 600px должно помещаться на холсте целиком

    function widthOf(el) {
        return el ? el.getBoundingClientRect().width : 0;
    }

    function init() {
        const shell = document.querySelector('.editor-shell');
        const sidebar = shell && shell.querySelector('.editor-sidebar');
        if (sidebar) {
            PanelResizer.attach({
                container: shell, panel: sidebar, side: 'left', cssVar: '--sidebar-w',
                storageKey: 'pochtelie.panel.sidebar.user', defaultWidth: 280, min: 240, max: 720,
                minCenter: MIN_CANVAS, label: 'Ширина левой панели'
            });
            return;
        }

        const app = document.querySelector('.app-container');
        const library = app && app.querySelector('.blocks-library');
        const settings = app && app.querySelector('.settings-panel');
        if (library) {
            PanelResizer.attach({
                container: app, panel: library, side: 'left', cssVar: '--sidebar-w',
                storageKey: 'pochtelie.panel.sidebar.admin', defaultWidth: 320, min: 280, max: 720,
                minCenter: MIN_CANVAS, otherWidth: () => widthOf(settings), label: 'Ширина левой панели'
            });
        }
        if (settings) {
            PanelResizer.attach({
                container: app, panel: settings, side: 'right', cssVar: '--settings-w',
                storageKey: 'pochtelie.panel.settings.admin', defaultWidth: 340, min: 280, max: 560,
                minCenter: MIN_CANVAS, otherWidth: () => widthOf(library), label: 'Ширина панели настроек'
            });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
