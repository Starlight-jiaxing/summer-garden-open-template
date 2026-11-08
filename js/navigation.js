(function () {
	"use strict";
	const nav = document.getElementById("capsuleNav");
	const toggle = nav?.querySelector(".capsule-header");
	if (!nav || !toggle) return;

	function setExpanded(expanded) {
		nav.classList.toggle("is-expanded", expanded);
		toggle.setAttribute("aria-expanded", String(expanded));
		toggle.setAttribute("aria-label", expanded ? "收起快捷导航" : "展开快捷导航");
	}

	toggle.addEventListener("click", () => setExpanded(!nav.classList.contains("is-expanded")));
	toggle.addEventListener("keydown", event => {
		if (event.key !== "ArrowDown") return;
		event.preventDefault();
		setExpanded(true);
		nav.querySelector(".capsule-item")?.focus();
	});
	document.addEventListener("pointerdown", event => {
		if (!nav.contains(event.target)) setExpanded(false);
	});
	document.addEventListener("keydown", event => {
		if (event.key === "Escape" && nav.classList.contains("is-expanded")) {
			setExpanded(false);
			toggle.focus({ preventScroll: true });
		}
	});
	nav.addEventListener("click", event => {
		if (event.target.closest("a")) setExpanded(false);
	});
	window.addEventListener("pageshow", () => setExpanded(false));
})();
