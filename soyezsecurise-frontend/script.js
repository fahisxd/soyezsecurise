const root = document.documentElement;
const themeButton = document.querySelector(".theme-toggle");
const themeMeta = document.querySelector('meta[name="theme-color"]');
let savedTheme = null;
try { savedTheme = localStorage.getItem("ss-theme"); } catch { /* Use the system theme when storage is unavailable. */ }
const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

function applyTheme(theme) {
  root.dataset.theme = theme;

  if (themeButton) {
    const nextTheme = theme === "dark" ? "light" : "dark";
    themeButton.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
  }

  if (themeMeta) {
    themeMeta.setAttribute("content", theme === "dark" ? "#151a16" : "#ecefe7");
  }
}

applyTheme(savedTheme || (systemPrefersDark ? "dark" : "light"));

themeButton?.addEventListener("click", () => {
  const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  try { localStorage.setItem("ss-theme", nextTheme); } catch { /* Theme changes still work for this visit. */ }
});

document.querySelectorAll("[data-year]").forEach((year) => {
  year.textContent = String(new Date().getFullYear());
});

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const value = button.dataset.copy;
    const state = button.querySelector("[data-copy-state]");
    const feedback = button.closest(".social-block")?.querySelector(".copy-feedback");

    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const input = document.createElement("textarea");
      input.value = value;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }

    if (state) state.textContent = "copied";
    if (feedback) feedback.textContent = `${value} copied to clipboard.`;
    window.setTimeout(() => {
      if (state) state.textContent = "copy";
      if (feedback) feedback.textContent = "";
    }, 2200);
  });
});

// Native details keeps secondary navigation available without JavaScript.
const navigationMenus = document.querySelectorAll('.nav-more');
function closeNavigationMenus() {
  navigationMenus.forEach(menu => { menu.open = false; });
}
document.addEventListener('pointerdown', event => {
  navigationMenus.forEach(menu => {
    if (!menu.contains(event.target)) menu.open = false;
  });
});
navigationMenus.forEach(menu => {
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
  menu.addEventListener('click', event => {
    if (event.target.closest('a')) closeNavigationMenus();
  });
});
