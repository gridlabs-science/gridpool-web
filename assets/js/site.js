function setCopyButtonState(button, label) {
  const original = button.dataset.copyLabel || button.textContent || "Copy";
  button.dataset.copyLabel = original;
  button.dataset.copyState = "copied";
  button.textContent = label;

  window.setTimeout(() => {
    button.dataset.copyState = "";
    button.textContent = original;
  }, 1800);
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy]");
  if (!button) {
    return;
  }

  try {
    await copyText(button.dataset.copy);
    setCopyButtonState(button, "Copied");
  } catch {
    setCopyButtonState(button, "Copy failed");
  }
});
