(() => {
  "use strict";
  const NEURIS_SERVER_URL = "http://127.0.0.1:8000";

  const root = document.documentElement;
  const themeButton = document.querySelector(".theme-toggle");
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  const applyTheme = (theme) => {
    root.dataset.theme = theme;
    const nextTheme = theme === "dark" ? "light" : "dark";
    themeButton?.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
    themeMeta?.setAttribute("content", theme === "dark" ? "#151a16" : "#ecefe7");
  };

  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem("ss-theme");
  } catch {
    // The system theme is still available when storage is blocked.
  }

  const systemPrefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  applyTheme(savedTheme || (systemPrefersDark ? "dark" : "light"));

  themeButton?.addEventListener("click", () => {
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    try {
      localStorage.setItem("ss-theme", nextTheme);
    } catch {
      // Theme switching still works for the current page when storage is blocked.
    }
  });

  const CLASSES = ["SAFE", "XSS", "SQLI", "PATH_TRAVERSAL", "COMMAND_INJECTION"];
  const CLASS_LABELS = {
    SAFE: "SAFE",
    XSS: "XSS",
    SQLI: "SQL INJECTION",
    PATH_TRAVERSAL: "PATH TRAVERSAL",
    COMMAND_INJECTION: "COMMAND INJECTION",
  };
  const form = document.querySelector("#scan-form");
  const input = document.querySelector("#payload-input");
  const button = document.querySelector("#scan-button");
  const resultPanel = document.querySelector(".result-panel");
  const resultStatus = document.querySelector("#result-status");
  const resultMessage = document.querySelector("#result-message");
  const reportLink = document.querySelector("#report-link");
  const verdict = document.querySelector("#verdict");
  const confidence = document.querySelector("#confidence");
  const timer = document.querySelector("#request-timer");
  const characterCount = document.querySelector("#character-count");
  const emptyState = document.querySelector("#empty-state");
  const outputArea = document.querySelector("#output-area");

  const serverBase = (NEURIS_SERVER_URL.trim() || (location.protocol.startsWith("http") ? location.origin : "")).replace(
    /\/$/,
    ""
  );

  const formatProbability = (value) => {
    if (!Number.isFinite(value)) return "0.000000";
    if (value > 0 && value < 0.000001) return value.toExponential(2);
    return value.toFixed(6);
  };

  const setStatus = (label, state = "") => {
    resultStatus.textContent = label;
    resultStatus.className = `result-status ${state}`.trim();
  };

  const resetBars = () => {
    document.querySelectorAll(".probability").forEach((row) => {
      row.classList.remove("is-winner");
      row.querySelector("output").textContent = "0.000000";
      row.querySelector(".bar i").style.width = "0%";
    });
  };

  const showError = (message) => {
    emptyState.hidden = true;
    resultPanel.hidden = false;
    delete resultPanel.dataset.verdict;
    resultPanel.setAttribute("aria-busy", "false");
    verdict.textContent = "ERROR";
    confidence.innerHTML = "00.00<span>%</span>";
    setStatus("REQUEST FAILED", "error");
    resultMessage.textContent = message;
    resultMessage.classList.add("error");
    reportLink.hidden = true;
    resetBars();
  };

  const showResult = (data, submittedPayload) => {
    const result = data?.result;
    const predictedClass = String(result?.response || "").toUpperCase();
    const score = Number(result?.confidence);
    const probabilities = result?.probabilities;

    if (!CLASSES.includes(predictedClass) || !Number.isFinite(score) || !probabilities) {
      throw new Error("The API returned an unexpected response shape.");
    }

    emptyState.hidden = true;
    resultPanel.hidden = false;
    resultPanel.dataset.verdict = predictedClass;
    verdict.textContent = CLASS_LABELS[predictedClass];
    confidence.innerHTML = `${(score * 100).toFixed(2)}<span>%</span>`;

    CLASSES.forEach((className) => {
      const row = document.querySelector(`.probability[data-class="${className}"]`);
      const value = Number(probabilities[className]) || 0;
      row.classList.toggle("is-winner", className === predictedClass);
      row.querySelector("output").textContent = formatProbability(value);
      row.querySelector(".bar i").style.width = `${Math.min(100, Math.max(0, value * 100))}%`;
    });

    setStatus("SCAN COMPLETE", "complete");
    resultMessage.classList.remove("error");
    resultMessage.textContent =
      predictedClass === "SAFE"
        ? "No malicious class won this prediction. This is not proof that the input is secure."
        : `The model classified this input as ${predictedClass.replaceAll("_", " ")}. Review before use.`;

    const probabilityReport = CLASSES.map((className) => {
      const value = Number(probabilities[className]) || 0;
      return `${CLASS_LABELS[className]}: ${formatProbability(value)}`;
    }).join("\n");
    const reportBody = [
      "Hello,",
      "",
      "I am reporting an incorrect Neuris prediction.",
      "",
      "Submitted input:",
      submittedPayload,
      "",
      `Predicted class: ${CLASS_LABELS[predictedClass]}`,
      `Confidence: ${(score * 100).toFixed(2)}%`,
      "",
      "Probabilities:",
      probabilityReport,
      "",
      "Expected class:",
      "[Please enter the correct class]",
      "",
      "Additional context:",
      "[Optional]",
    ].join("\n");
    const reportQuery = new URLSearchParams({
      view: "cm",
      fs: "1",
      to: "soyezsecurise@gmail.com",
      su: `Incorrect Neuris prediction: ${CLASS_LABELS[predictedClass]}`,
      body: reportBody,
    });
    reportLink.href = `https://mail.google.com/mail/?${reportQuery.toString()}`;
    reportLink.hidden = false;

    resultPanel.setAttribute("aria-busy", "false");
    outputArea.scrollTo({ top: 0, behavior: "smooth" });
  };

  input.addEventListener("input", () => {
    const bytes = new TextEncoder().encode(input.value).length;
    characterCount.textContent = `${String(bytes).padStart(4, "0")} / 4096 BYTES`;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  });

  document.querySelectorAll("[data-sample]").forEach((sampleButton) => {
    sampleButton.addEventListener("click", () => {
      input.value = sampleButton.dataset.sample;
      input.dispatchEvent(new Event("input"));
      input.focus();
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = input.value;
    if (!payload.trim()) {
      input.focus();
      return;
    }

    if (!serverBase) {
      showError("No API server is configured. Set NEURIS_SERVER_URL at the top of app.js.");
      return;
    }

    const startedAt = performance.now();
    emptyState.hidden = true;
    resultPanel.hidden = false;
    button.disabled = true;
    button.querySelector("span:first-child").textContent = "WAIT";
    resultPanel.setAttribute("aria-busy", "true");
    resultMessage.classList.remove("error");
    resultMessage.textContent = "Sending input to the Neuris inference endpoint...";
    reportLink.hidden = true;
    setStatus("INFERENCE RUNNING", "running");
    timer.textContent = "RUNNING";

    try {
      const requestUrl = `${serverBase}/neuris?string=${encodeURIComponent(payload)}`;
      const response = await fetch(requestUrl, { method: "GET", headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`API request failed with HTTP ${response.status}.`);
      showResult(await response.json(), payload);
      timer.textContent = `${Math.round(performance.now() - startedAt)} MS`;
    } catch (error) {
      const message =
        error instanceof TypeError
          ? "Could not reach the API. Check the server URL, network, and CORS configuration."
          : error.message;
      showError(message);
      timer.textContent = "FAILED";
    } finally {
      button.disabled = false;
      button.querySelector("span:first-child").textContent = "RUN";
    }
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
})();
