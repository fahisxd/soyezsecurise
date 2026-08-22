(function () {
	"use strict";

	var root = document.documentElement;
	var storageKey = "ss-theme";
	var mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
	var savedTheme = null;

	try {
		savedTheme = window.localStorage.getItem(storageKey);
	} catch (error) {
		savedTheme = null;
	}

	function applyTheme(theme) {
		var activeTheme = theme === "dark" ? "dark" : "light";
		var nextTheme = activeTheme === "dark" ? "light" : "dark";

		root.dataset.theme = activeTheme;

		document.querySelectorAll(".theme-toggle").forEach(function (button) {
			button.setAttribute("aria-label", "Switch to " + nextTheme + " theme");
			button.setAttribute("aria-pressed", activeTheme === "dark" ? "true" : "false");
		});

		var themeMeta = document.querySelector('meta[name="theme-color"]');
		if (themeMeta) {
			themeMeta.setAttribute("content", activeTheme === "dark" ? "#151a16" : "#ecefe7");
		}
	}

	function bindThemeControls() {
		applyTheme(root.dataset.theme);

		document.querySelectorAll(".theme-toggle").forEach(function (button) {
			button.addEventListener("click", function (event) {
				event.stopPropagation();
				var nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
				applyTheme(nextTheme);

				try {
					window.localStorage.setItem(storageKey, nextTheme);
				} catch (error) {
					// The selected theme still applies for this page when storage is unavailable.
				}
			});
		});
	}

	applyTheme(savedTheme || (mediaQuery.matches ? "dark" : "light"));

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", bindThemeControls);
	} else {
		bindThemeControls();
	}

	var syncWithSystem = function (event) {
		try {
			if (window.localStorage.getItem(storageKey)) {
				return;
			}
		} catch (error) {
			// Continue using the current system preference.
		}

		applyTheme(event.matches ? "dark" : "light");
	};

	if (typeof mediaQuery.addEventListener === "function") {
		mediaQuery.addEventListener("change", syncWithSystem);
	} else if (typeof mediaQuery.addListener === "function") {
		mediaQuery.addListener(syncWithSystem);
	}
}());
