(() => {
  const game = document.querySelector("[data-sqli-game]");
  if (!game) return;

  const STORAGE_KEY = "ss-sqli-lab-progress";
  const FICTIONAL_SECRET = "MOSS";
  const CANDIDATES = ["M", "O", "S", "Q", "T"];
  const LEVELS = [
    {
      title: "Input",
      objective: "Send two different login attempts. Watch what changes behind the interface.",
      explanation: "Your input did more than fill a form. It became part of a backend request.",
      hints: [
        "Change one field, submit again, and compare the request trace.",
        "The password is not the interesting variable in this level."
      ]
    },
    {
      title: "The query",
      objective: "Drag the blocks into the workspace and assemble a payload that makes the fictional condition always true.",
      explanation: "The payload closed the quoted value, added a true condition, and commented out the remainder of the simulated query.",
      hints: [
        "Start by closing the quoted username value.",
        "Join the original check to a condition that is always true.",
        "The final block should make the database ignore the quote left by the application."
      ]
    },
    {
      title: "Blind",
      objective: "Ask enough yes/no questions to observe both possible behaviours.",
      explanation: "No value was printed, but true and false conditions still produced different outcomes.",
      hints: [
        "Ask questions that can be evaluated as true or false.",
        "Try one statement likely to be true and another likely to be false."
      ]
    },
    {
      title: "The clock",
      objective: "The response text is now identical. Find the difference that remains.",
      explanation: "The application became a one-bit communication channel: true or false could be inferred from timing.",
      hints: [
        "The response looks identical. Does everything about it behave identically?",
        "Stop looking only at what the application says. Look at how long it takes to say it.",
        "Compare both tests and watch the numeric response time."
      ]
    },
    {
      title: "One character at a time",
      objective: "Use timing to recover the four-character fictional value without reading it directly.",
      explanation: "A hidden value can be recovered incrementally: test a condition, observe timing, and reduce uncertainty.",
      hints: [
        "A delayed response means the candidate at the active position matched.",
        "Test candidates for the highlighted slot; a fast response rules one out.",
        "The first character behaved differently in the previous level. Start there."
      ]
    }
  ];

  const intro = game.querySelector("[data-game-intro]");
  const stage = game.querySelector("[data-game-stage]");
  const final = game.querySelector("[data-game-final]");
  const label = game.querySelector("[data-game-level-label]");
  const title = game.querySelector("[data-game-level-title]");
  const objective = game.querySelector("[data-game-objective]");
  const content = game.querySelector("[data-game-content]");
  const hints = game.querySelector("[data-game-hints]");
  const startButton = game.querySelector("[data-game-start]");
  const resetButton = game.querySelector("[data-game-reset]");
  const shareButtons = game.querySelectorAll("[data-game-share]");
  const shareStatus = game.querySelector("[data-game-share-status]");

  const freshState = () => ({
    started: false,
    level: 1,
    completed: 0,
    recovered: ["", "", "", ""],
    requests: 0
  });

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || typeof saved !== "object") return freshState();
      const recovered = Array.isArray(saved.recovered)
        ? saved.recovered.slice(0, 4).map((value) => CANDIDATES.includes(value) ? value : "")
        : ["", "", "", ""];
      while (recovered.length < 4) recovered.push("");
      return {
        started: Boolean(saved.started),
        level: Math.min(6, Math.max(1, Number(saved.level) || 1)),
        completed: Math.min(5, Math.max(0, Number(saved.completed) || 0)),
        recovered,
        requests: Math.max(0, Number(saved.requests) || 0)
      };
    } catch {
      return freshState();
    }
  }

  let state = loadState();
  let session = {};

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Progress persistence is optional; the simulation still works without it.
    }
  }

  function updateProgress() {
    game.querySelectorAll("[data-game-step]").forEach((step) => {
      const number = Number(step.dataset.gameStep);
      step.classList.toggle("is-complete", number <= state.completed);
      step.classList.toggle("is-current", number === state.level);
      if (number === state.level) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
    });
  }

  function makeConsole() {
    const panel = document.createElement("div");
    panel.className = "game-console";
    panel.innerHTML = `
      <div><span>request</span><code data-console-request>waiting</code></div>
      <div><span>response</span><strong data-console-response>—</strong></div>
      <div><span>time</span><strong data-console-time>—</strong></div>
      <p role="status" aria-live="polite" data-console-status>Ready.</p>`;
    return panel;
  }

  function updateConsole(panel, { request, response, time, message }) {
    if (request !== undefined) panel.querySelector("[data-console-request]").textContent = request;
    if (response !== undefined) panel.querySelector("[data-console-response]").textContent = response;
    if (time !== undefined) panel.querySelector("[data-console-time]").textContent = time;
    if (message !== undefined) panel.querySelector("[data-console-status]").textContent = message;
  }

  function renderHints(items) {
    hints.replaceChildren();
    items.forEach((hint, index) => {
      const details = document.createElement("details");
      details.className = "article-hint game-hint";
      const summary = document.createElement("summary");
      const hintLabel = document.createElement("span");
      hintLabel.textContent = `Hint / ${String(index + 1).padStart(2, "0")}`;
      const hintState = document.createElement("span");
      hintState.className = "hint-state";
      hintState.setAttribute("aria-hidden", "true");
      hintState.innerHTML = '<span class="hint-reveal">reveal hint +</span><span class="hint-hide">hide hint −</span>';
      const body = document.createElement("div");
      body.className = "article-hint-body";
      const paragraph = document.createElement("p");
      paragraph.textContent = hint;
      body.append(paragraph);
      summary.append(hintLabel, hintState);
      details.append(summary, body);
      hints.append(details);
    });
  }

  function completeLevel() {
    if (content.querySelector(".game-complete")) return;
    state.completed = Math.max(state.completed, state.level);
    saveState();
    content.querySelectorAll("input, select, button").forEach((control) => { control.disabled = true; });

    const completion = document.createElement("div");
    completion.className = "game-complete";
    completion.setAttribute("role", "status");
    const small = document.createElement("span");
    small.textContent = "Level complete";
    const text = document.createElement("p");
    text.textContent = LEVELS[state.level - 1].explanation;
    const next = document.createElement("button");
    next.className = "game-next";
    next.type = "button";
    next.textContent = state.level === 5 ? "Reveal what this was →" : "Continue →";
    next.addEventListener("click", () => {
      state.level += 1;
      session = {};
      saveState();
      render();
    });
    completion.append(small, text, next);
    content.append(completion);
    next.focus({ preventScroll: true });
  }

  function incrementRequests() {
    state.requests += 1;
    saveState();
  }

  function renderLevelOne() {
    content.innerHTML = `
      <div class="game-split">
        <form class="game-form" data-level-one-form>
          <label>username<input name="username" type="text" autocomplete="off" spellcheck="false" required></label>
          <label>password<input name="password" type="password" autocomplete="off" required></label>
          <button class="game-primary" type="submit">authenticate <span aria-hidden="true">→</span></button>
        </form>
        <div data-console-slot></div>
      </div>`;
    const panel = makeConsole();
    content.querySelector("[data-console-slot]").append(panel);
    session.inputs = new Set();
    content.querySelector("[data-level-one-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const username = String(form.get("username") || "").trim();
      if (!username) return;
      incrementRequests();
      session.inputs.add(username);
      updateConsole(panel, {
        request: `login.username = ${JSON.stringify(username)}`,
        response: "FAILED",
        time: "0.07s",
        message: session.inputs.size > 1 ? "The request changed when the input changed." : "Change the username and send one more request."
      });
      if (session.inputs.size > 1) completeLevel();
    });
  }

  function renderLevelTwo() {
    content.innerHTML = `
      <div class="payload-builder">
        <section class="payload-panel" aria-labelledby="payload-bank-label">
          <div class="payload-panel-label"><span id="payload-bank-label">Payload blocks</span><small>drag or click to add</small></div>
          <div class="payload-bank" data-payload-bank></div>
        </section>
        <section class="payload-panel payload-workspace-panel" aria-labelledby="payload-workspace-label">
          <div class="payload-panel-label"><span id="payload-workspace-label">Payload workspace</span><small>drop blocks in order</small></div>
          <div class="payload-dropzone" data-payload-dropzone role="group" aria-label="Assembled payload"></div>
          <div class="payload-preview"><span>input</span><code data-payload-preview>_</code></div>
        </section>
      </div>
      <div class="game-query payload-query"><span>simulated query</span><pre><code data-query-preview></code></pre><p role="status" aria-live="polite" data-query-status>Assemble the payload, then run the simulation.</p></div>
      <div class="payload-actions">
        <button type="button" class="payload-clear" data-payload-clear>clear workspace</button>
        <button type="button" class="game-primary" data-payload-run>run payload <span aria-hidden="true">→</span></button>
      </div>`;

    const available = [
      { label: "'", type: "delimiter" },
      { label: "OR", type: "keyword" },
      { label: "AND", type: "keyword" },
      { label: "1=1", type: "condition" },
      { label: "1=0", type: "condition" },
      { label: "--", type: "comment" },
      { label: ";", type: "delimiter" },
      { label: "guest", type: "value" }
    ];
    const answer = ["'", "OR", "1=1", "--"];
    const bank = content.querySelector("[data-payload-bank]");
    const dropzone = content.querySelector("[data-payload-dropzone]");
    const payloadPreview = content.querySelector("[data-payload-preview]");
    const queryPreview = content.querySelector("[data-query-preview]");
    const status = content.querySelector("[data-query-status]");
    let selected = [];
    let dragged = null;

    function makeBlock(block, source, index = -1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `payload-block is-${block.type}`;
      button.textContent = block.label;
      button.draggable = true;
      button.dataset.source = source;
      if (index >= 0) button.dataset.index = String(index);
      button.setAttribute("aria-label", source === "bank" ? `Add ${block.label}` : `Remove ${block.label}`);
      button.addEventListener("dragstart", (event) => {
        dragged = { block, source, index };
        button.classList.add("is-dragging");
        event.dataTransfer.effectAllowed = source === "bank" ? "copy" : "move";
        event.dataTransfer.setData("text/plain", block.label);
      });
      button.addEventListener("dragend", () => {
        dragged = null;
        button.classList.remove("is-dragging");
        dropzone.classList.remove("is-dragover");
      });
      button.addEventListener("click", () => {
        if (source === "bank") selected.push({ ...block });
        else selected.splice(index, 1);
        status.textContent = "Workspace changed. Run the payload when it looks right.";
        paintWorkspace();
      });
      return button;
    }

    function paintWorkspace() {
      dropzone.replaceChildren();
      if (!selected.length) {
        const empty = document.createElement("p");
        empty.className = "payload-empty";
        empty.textContent = "Drop blocks here to build the input";
        dropzone.append(empty);
      } else {
        selected.forEach((block, index) => dropzone.append(makeBlock(block, "workspace", index)));
      }
      const payload = selected.map((block) => block.label).join(" ");
      payloadPreview.textContent = payload || "_";
      queryPreview.textContent = `SELECT access\nFROM accounts\nWHERE username = '${payload}';`;
    }

    available.forEach((block) => bank.append(makeBlock(block, "bank")));
    dropzone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragover");
      if (event.dataTransfer) event.dataTransfer.dropEffect = dragged?.source === "bank" ? "copy" : "move";
    });
    dropzone.addEventListener("dragleave", (event) => {
      if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove("is-dragover");
    });
    dropzone.addEventListener("drop", (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragover");
      if (!dragged) return;
      const target = event.target.closest("[data-source='workspace']");
      let insertAt = target ? Number(target.dataset.index) : selected.length;
      if (dragged.source === "workspace") {
        const [block] = selected.splice(dragged.index, 1);
        if (dragged.index < insertAt) insertAt -= 1;
        selected.splice(insertAt, 0, block);
      } else {
        selected.splice(insertAt, 0, { ...dragged.block });
      }
      status.textContent = "Block added. Keep building or run the payload.";
      paintWorkspace();
    });
    content.querySelector("[data-payload-clear]").addEventListener("click", () => {
      selected = [];
      status.textContent = "Workspace cleared.";
      paintWorkspace();
    });
    content.querySelector("[data-payload-run]").addEventListener("click", () => {
      incrementRequests();
      const isCorrect = answer.length === selected.length && answer.every((token, index) => token === selected[index].label);
      if (isCorrect) {
        status.textContent = "ACCESS GRANTED — the simulated WHERE condition is always true.";
        completeLevel();
      } else {
        status.textContent = "Payload rejected. Check the quote, boolean operator, true condition, and comment order.";
      }
    });
    paintWorkspace();
  }

  function conditionButton(text, condition) {
    return `<button type="button" data-condition="${condition}">${text}<span aria-hidden="true">→</span></button>`;
  }

  function renderLevelThree() {
    content.innerHTML = `
      <div class="game-question-set" aria-label="Questions for the fictional database">
        ${conditionButton("secret length is greater than 3", "true")}
        ${conditionButton("secret starts with Z", "false")}
        ${conditionButton("secret contains 7", "false")}
      </div>
      <div data-console-slot></div>`;
    const panel = makeConsole();
    content.querySelector("[data-console-slot]").append(panel);
    session.booleanStates = new Set();
    content.querySelectorAll("[data-condition]").forEach((button) => {
      button.addEventListener("click", () => {
        incrementRequests();
        const result = button.dataset.condition === "true";
        session.booleanStates.add(String(result));
        updateConsole(panel, {
          request: button.firstChild.textContent.trim(),
          response: result ? "SUCCESS" : "FAILED",
          time: "0.08s",
          message: session.booleanStates.size > 1 ? "Both boolean states are now observable." : "That was one possible state. Find the other."
        });
        if (session.booleanStates.size > 1) completeLevel();
      });
    });
  }

  function runTimedTest(button, panel, isMatch, message, done) {
    content.querySelectorAll("button").forEach((control) => { control.disabled = true; });
    updateConsole(panel, { request: button.firstChild.textContent.trim(), response: "PENDING", time: "…", message: "Request sent." });
    window.setTimeout(() => {
      incrementRequests();
      updateConsole(panel, {
        response: "OK",
        time: isMatch ? "1.60s" : "0.08s",
        message
      });
      content.querySelectorAll("button").forEach((control) => { control.disabled = false; });
      done();
    }, isMatch ? 1600 : 80);
  }

  function renderLevelFour() {
    content.innerHTML = `
      <div class="game-question-set" aria-label="Timing questions for the fictional database">
        ${conditionButton("first character is M", "slow")}
        ${conditionButton("first character is Q", "fast")}
      </div>
      <div data-console-slot></div>`;
    const panel = makeConsole();
    content.querySelector("[data-console-slot]").append(panel);
    session.timingStates = new Set();
    content.querySelectorAll("[data-condition]").forEach((button) => {
      button.addEventListener("click", () => {
        const kind = button.dataset.condition;
        runTimedTest(button, panel, kind === "slow", "Same body. Different timing.", () => {
          session.timingStates.add(kind);
          if (session.timingStates.size > 1) completeLevel();
        });
      });
    });
  }

  function renderLevelFive() {
    content.innerHTML = `
      <div class="game-recovery">
        <div><span>fictional value</span><div class="game-secret" data-secret-slots aria-label="Recovered characters"></div></div>
        <div><span>candidate character</span><div class="game-candidates" data-candidates></div></div>
      </div>
      <div data-console-slot></div>`;
    const panel = makeConsole();
    content.querySelector("[data-console-slot]").append(panel);
    const slots = content.querySelector("[data-secret-slots]");
    const candidates = content.querySelector("[data-candidates]");

    const paintSlots = () => {
      slots.replaceChildren();
      const active = state.recovered.findIndex((value) => !value);
      state.recovered.forEach((value, index) => {
        const slot = document.createElement("span");
        slot.textContent = value || "·";
        if (index === active) slot.className = "is-active";
        slots.append(slot);
      });
    };

    const paintCandidates = () => {
      candidates.replaceChildren();
      CANDIDATES.forEach((candidate) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = candidate;
        button.addEventListener("click", () => {
          const position = state.recovered.findIndex((value) => !value);
          if (position < 0) return;
          const isMatch = FICTIONAL_SECRET[position] === candidate;
          button.insertAdjacentHTML("beforeend", '<span aria-hidden="true"> →</span>');
          runTimedTest(button, panel, isMatch, isMatch ? "Delayed. The candidate matched." : "Fast. Rule that candidate out.", () => {
            button.querySelector("span")?.remove();
            if (!isMatch) return;
            state.recovered[position] = candidate;
            saveState();
            paintSlots();
            if (state.recovered.every(Boolean)) completeLevel();
          });
        });
        candidates.append(button);
      });
    };

    paintSlots();
    paintCandidates();
    if (state.recovered.every(Boolean)) completeLevel();
  }

  const renderers = [renderLevelOne, renderLevelTwo, renderLevelThree, renderLevelFour, renderLevelFive];

  function renderLevel() {
    intro.hidden = true;
    final.hidden = true;
    stage.hidden = false;
    game.dataset.level = String(state.level);
    const details = LEVELS[state.level - 1];
    label.textContent = `Level ${String(state.level).padStart(2, "0")} / ${details.title}`;
    title.textContent = details.title;
    objective.textContent = details.objective;
    content.replaceChildren();
    session = {};
    renderers[state.level - 1]();
    renderHints(details.hints);
    updateProgress();
    if (state.completed >= state.level) completeLevel();
    content.querySelector("input, button")?.focus({ preventScroll: true });
  }

  function renderFinal() {
    state.started = true;
    state.level = 6;
    saveState();
    intro.hidden = true;
    stage.hidden = true;
    final.hidden = false;
    game.dataset.level = "final";
    final.querySelector("a")?.focus({ preventScroll: true });
  }

  function renderIntro() {
    intro.hidden = false;
    stage.hidden = true;
    final.hidden = true;
    game.dataset.level = "0";
  }

  function render() {
    if (!state.started) renderIntro();
    else if (state.level > 5) renderFinal();
    else renderLevel();
  }

  startButton.addEventListener("click", () => {
    state.started = true;
    state.level = Math.min(5, Math.max(1, state.level));
    saveState();
    render();
  });

  resetButton.addEventListener("click", () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* Nothing sensitive to clear. */ }
    state = freshState();
    session = {};
    renderIntro();
    startButton.focus({ preventScroll: true });
  });

  async function copyShareUrl(url) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("textarea");
      input.value = url;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
  }

  shareButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const url = `${window.location.href.split("#")[0]}#sqli-lab`;
      const shareData = {
        title: "SQLi intuition — Soyez Sécurisé",
        text: "A small simulated game about what an application leaks without printing the answer.",
        url
      };
      try {
        if (navigator.share) {
          await navigator.share(shareData);
          if (shareStatus) shareStatus.textContent = "Shared.";
        } else {
          await copyShareUrl(url);
          if (shareStatus) shareStatus.textContent = "Game link copied.";
        }
      } catch (error) {
        if (error?.name === "AbortError") {
          if (shareStatus) shareStatus.textContent = "Share cancelled.";
          return;
        }
        await copyShareUrl(url);
        if (shareStatus) shareStatus.textContent = "Game link copied.";
      }
    });
  });

  render();
})();
