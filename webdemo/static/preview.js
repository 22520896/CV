const sample = document.getElementById("sample");
const upload = document.getElementById("upload");
const preview = document.getElementById("preview");
let uploadedURL;

function showPreview() {
  if (uploadedURL) URL.revokeObjectURL(uploadedURL);
  uploadedURL = upload.files.length ? URL.createObjectURL(upload.files[0]) : null;
  const src = uploadedURL || sample.selectedOptions[0].dataset.image;
  preview.hidden = !src;
  if (src) preview.src = src;
}

sample.addEventListener("change", () => {
  upload.value = "";
  showPreview();
});
upload.addEventListener("change", showPreview);
showPreview();
