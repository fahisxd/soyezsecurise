const copyButton = document.querySelector('#apex-copy');
const copyFeedback = document.querySelector('#apex-copy-feedback');
copyButton.addEventListener('click', async () => {
  const command = document.querySelector('#apex-command').textContent;
  let copied = false;
  try {
    await navigator.clipboard.writeText(command);
    copied = true;
  } catch {
    const input = document.createElement('textarea');
    input.value = command;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.append(input);
    input.select();
    try { copied = document.execCommand('copy'); } catch { copied = false; }
    input.remove();
    copyButton.focus();
  }
  copyFeedback.textContent = copied ? 'Run command copied to clipboard.' : 'Copy unavailable. Select the command above and copy it manually.';
  copyButton.textContent = copied ? 'Copied' : 'Copy command';
  window.setTimeout(() => { copyButton.textContent = 'Copy command'; }, 2200);
});
