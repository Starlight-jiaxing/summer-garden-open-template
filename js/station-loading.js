/* First arrival is a paper ticket; later pages keep a quiet loading rail. */
(function () {
	"use strict";
	const root = document.documentElement;
	function updateVisibility() { root.classList.toggle("site-tab-hidden", document.hidden); }
	document.addEventListener("visibilitychange", updateVisibility);
	updateVisibility();
	function observeScenes() {
		const sections = document.querySelectorAll(".camp-section");
		function loadImages(section) {
			section.querySelectorAll("img[data-scene-src]").forEach(image => {
				image.src = image.dataset.sceneSrc;
				delete image.dataset.sceneSrc;
			});
		}
		if (!sections.length) return;
		if (!("IntersectionObserver" in window)) { sections.forEach(loadImages); return; }
		const observer = new IntersectionObserver(entries => {
			entries.forEach(entry => {
				entry.target.classList.toggle("is-motion-visible", entry.isIntersecting);
				if (entry.isIntersecting) loadImages(entry.target);
			});
		}, { rootMargin: "400px 0px" });
		sections.forEach(section => observer.observe(section));
		document.body.classList.add("has-viewport-motion");
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", observeScenes, { once: true });
	else observeScenes();
	const loader = document.getElementById("stationLoader");
	if (!loader || !root.classList.contains("station-booting")) return;
	const returning = root.classList.contains("station-returning");
	const status = loader.querySelector("[data-station-status]");
	const skip = loader.querySelector("button");
	const started = window.JXStationBoot?.started || performance.now();
	const inertElements = [];
	let finished = false;
	let imageReady = !document.body.dataset.stationImage;
	let pageReady = document.readyState === "complete";
	let timer;
	function handleKey(event) {
		if (finished || returning) return;
		if (event.key === "Escape") finish();
		if (event.key === "Tab") { event.preventDefault(); skip.focus(); }
	}

	if (!returning) {
		loader.setAttribute("role", "dialog");
		loader.setAttribute("aria-modal", "true");
		Array.from(document.body.children).forEach(element => {
			if (element === loader || /^(SCRIPT|STYLE)$/.test(element.tagName) || element.inert) return;
			element.inert = true;
			element.dataset.stationInert = "";
			inertElements.push(element);
		});
	}
	loader.setAttribute("aria-hidden", "false");

	function finish() {
		if (finished) return;
		finished = true;
		clearTimeout(timer);
		document.removeEventListener("keydown", handleKey);
		const wasFocused = loader.contains(document.activeElement);
		inertElements.forEach(element => { element.inert = false; delete element.dataset.stationInert; });
		loader.inert = true;
		loader.setAttribute("aria-hidden", "true");
		root.classList.remove("station-booting", "station-returning");
		try { sessionStorage.setItem("jxgarden-station-entered", "1"); } catch (error) {}
		if (wasFocused) {
			const main = document.querySelector("main, h1, #header");
			if (main) {
				const original = main.getAttribute("tabindex");
				main.tabIndex = -1;
				main.focus({ preventScroll: true });
				main.addEventListener("blur", () => {
					if (original === null) main.removeAttribute("tabindex");
					else main.setAttribute("tabindex", original);
				}, { once: true });
			}
		}
		loader.addEventListener("transitionend", () => loader.remove(), { once: true });
		setTimeout(() => loader.remove(), 260);
	}

	function update() {
		if (finished) return;
		loader.dataset.step = pageReady ? (imageReady ? "3" : "2") : "1";
		status.textContent = !pageReady ? "正在铺开这一页手账…" : !imageReady ? "等夏日的风景慢慢显影…" : "这一站，已为你准备好。";
		if (pageReady && imageReady) finish();
	}

	document.addEventListener("keydown", handleKey);
	timer = setTimeout(finish, Math.max(0, 4500 - (performance.now() - started)));
	window.addEventListener("station:release", finish, { once: true });
	window.addEventListener("pageshow", event => { if (event.persisted) finish(); });
	if (!pageReady) document.addEventListener("DOMContentLoaded", () => {
		// Let the page's existing DOMContentLoaded initializers finish first.
		requestAnimationFrame(() => { pageReady = true; update(); });
	}, { once: true });
	if (!imageReady) {
		const image = new Image();
		image.decoding = "async";
		image.onload = () => {
			const decoded = image.decode ? image.decode().catch(() => {}) : Promise.resolve();
			decoded.then(() => { imageReady = true; update(); });
		};
		image.onerror = () => { imageReady = true; update(); };
		image.src = document.body.dataset.stationImage;
	}
	update();
})();
