'use strict';

const imageViewer = document.getElementById('image-viewer');
const viewerPhoto = document.getElementById('image-viewer-photo');
const viewerTitle = document.getElementById('image-viewer-title');

function makeZoomControl(src, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'zoom-control';
  button.dataset.zoomSrc = src;
  button.dataset.zoomLabel = label;
  button.setAttribute('aria-label', 'Phóng to ảnh ' + label);
  button.title = 'Phóng to ảnh';
  button.textContent = '⤢';
  return button;
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-zoom-src]');
  if (!button?.dataset.zoomSrc) return;
  const title = button.dataset.zoomLabel || 'Ảnh phóng to';
  viewerTitle.textContent = title;
  viewerPhoto.alt = title;
  viewerPhoto.src = button.dataset.zoomSrc;
  imageViewer.showModal();
});

imageViewer.addEventListener('click', (event) => {
  if (event.target === imageViewer) imageViewer.close();
});

imageViewer.addEventListener('close', () => viewerPhoto.removeAttribute('src'));
