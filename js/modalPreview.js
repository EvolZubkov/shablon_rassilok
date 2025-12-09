// modalPreview.js - Управление модальным окном превью

function setupPreviewButton() {
    const btnPreview = document.getElementById('btn-preview');
    btnPreview.addEventListener('click', showPreview);

    const modal = document.getElementById('preview-modal');
    const modalClose = modal.querySelector('.modal-close');
    const modalOverlay = modal.querySelector('.modal-overlay');

    modalClose.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    modalOverlay.addEventListener('click', () => {
        modal.style.display = 'none';
    });
}

function showPreview() {
    const html = generateEmailHTML();
    const modal = document.getElementById('preview-modal');
    const previewContainer = document.getElementById('preview-container');
    const htmlOutput = document.getElementById('html-output');

    previewContainer.innerHTML = html;
    htmlOutput.value = html;
    modal.style.display = 'flex';
}