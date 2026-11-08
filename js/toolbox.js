(() => {
  "use strict";
  const input = document.getElementById("tool-search");
  const controls = document.getElementById("tools-controls");
  const cards = [...document.querySelectorAll(".tool-card")];
  if (!input || !controls || !cards.length) return;
  const filters = [...document.querySelectorAll(".tool-filters button")];
  const count = document.getElementById("tool-result-count");
  const clear = document.getElementById("tool-search-clear");
  const empty = document.getElementById("tools-empty");
  const noteFilters = document.getElementById("fieldnote-filters");
  const noteButtons = [...document.querySelectorAll(".fieldnote-filters button")];
  const noteCards = [...document.querySelectorAll(".fieldnote-grid .fieldnote")];
  const noteCount = document.getElementById("fieldnote-result-count");
  const noteEmpty = document.getElementById("fieldnote-empty");
  const normalize = value => value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/\s+/g, " ").trim();
  const searchable = cards.map(card => normalize(card.textContent + " " + card.dataset.keywords));
  const params = new URLSearchParams(location.search);
  let selected = filters.some(button => button.dataset.filter === params.get("filter")) ? params.get("filter") : "all";
  const validTopics = new Set(["all", ...noteButtons.map(button => button.dataset.noteFilter).filter(value => value !== "all")]);
  let selectedTopic = validTopics.has(params.get("topic")) ? params.get("topic") : "all";
  input.value = (params.get("q") || "").slice(0, 100);
  controls.hidden = false;

  function applyFilters(updateURL = true) {
    const query = normalize(input.value);
    const terms = query.split(" ").filter(Boolean);
    let visible = 0;
    cards.forEach((card, index) => {
      const matchesCategory = selected === "all" || card.dataset.category.split(" ").includes(selected);
      const matchesQuery = terms.every(term => searchable[index].includes(term));
      card.hidden = !(matchesCategory && matchesQuery);
      if (!card.hidden) visible += 1;
    });
    filters.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.filter === selected)));
    count.textContent = selected === "all" && !query ? "抽屉里有 " + visible + " 件工具" : "找到 " + visible + " 件工具";
    clear.hidden = !input.value;
    empty.hidden = visible > 0;
    if (updateURL && location.protocol !== "file:") {
      const url = new URL(location.href);
      if (query) url.searchParams.set("q", input.value.trim()); else url.searchParams.delete("q");
      if (selected !== "all") url.searchParams.set("filter", selected); else url.searchParams.delete("filter");
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }

  function applyNoteFilter(updateURL = true) {
    if (!noteCards.length) return;
    let visible = 0;
    noteCards.forEach(card => {
      card.hidden = selectedTopic !== "all" && card.dataset.topic !== selectedTopic;
      if (!card.hidden) visible += 1;
    });
    noteButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.noteFilter === selectedTopic)));
    noteCount.textContent = selectedTopic === "all" ? `收录 ${visible} 则经验手记` : `这个主题有 ${visible} 则手记`;
    noteEmpty.hidden = visible > 0;
    if (noteFilters) noteFilters.hidden = false;
    if (updateURL && location.protocol !== "file:") {
      const url = new URL(location.href);
      if (selectedTopic !== "all") url.searchParams.set("topic", selectedTopic); else url.searchParams.delete("topic");
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }
  filters.forEach(button => button.addEventListener("click", () => { selected = button.dataset.filter; applyFilters(); }));
  noteButtons.forEach(button => button.addEventListener("click", () => { selectedTopic = button.dataset.noteFilter; applyNoteFilter(); }));
  input.addEventListener("input", () => applyFilters());
  input.addEventListener("keydown", event => { if (event.key === "Escape" && input.value) { event.preventDefault(); input.value = ""; applyFilters(); } });
  clear.addEventListener("click", () => { input.value = ""; applyFilters(); input.focus(); });
  document.getElementById("tools-reset").addEventListener("click", () => { selected = "all"; input.value = ""; applyFilters(); input.focus(); });
  window.addEventListener("popstate", () => {
    const next = new URLSearchParams(location.search);
    selected = filters.some(button => button.dataset.filter === next.get("filter")) ? next.get("filter") : "all";
    input.value = (next.get("q") || "").slice(0, 100);
    applyFilters(false);
    selectedTopic = validTopics.has(next.get("topic")) ? next.get("topic") : "all";
    applyNoteFilter(false);
  });
  document.getElementById("fieldnote-reset")?.addEventListener("click", () => { selectedTopic = "all"; applyNoteFilter(); noteButtons[0]?.focus(); });
  function revealLinkedCard() {
    const card = cards.find(item => "#" + item.id === location.hash);
    if (card) {
      selected = "all"; input.value = ""; applyFilters(false);
      const details = card.querySelector("details");
      if (details) details.open = true;
    }
    const note = noteCards.find(item => "#" + item.id === location.hash);
    if (note) { selectedTopic = "all"; applyNoteFilter(false); note.open = true; }
  }
  window.addEventListener("hashchange", revealLinkedCard);
  applyFilters(false); applyNoteFilter(false); revealLinkedCard();

  const copy = document.getElementById("copy-question");
  const toast = document.getElementById("notes-toast");
  let toastTimer;
  copy.addEventListener("click", async () => {
    const value = document.getElementById("question-template").textContent;
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      toast.textContent = "提问模板已复制，把括号里的内容换成你的情况就好。";
    } catch {
      const selection = window.getSelection();
      const range = document.createRange(); range.selectNodeContents(document.getElementById("question-template"));
      selection.removeAllRanges(); selection.addRange(range);
      toast.textContent = "模板已选中，可按 Ctrl+C，或长按文字复制。";
    }
    toast.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
  });
})();
