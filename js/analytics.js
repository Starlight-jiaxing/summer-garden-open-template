(() => {
	"use strict";

	if (navigator.doNotTrack === "1" || navigator.doNotTrack === "yes" || navigator.globalPrivacyControl === true) return;
	const pageByPath = new Map([
		["/", "station"],
		["/index.html", "station"],
		["/html/home.html", "diary"],
		["/html/detail.html", "archive"],
		["/html/toolbox.html", "toolbox"],
		["/html/message.html", "letters"],
	]);
	const page = pageByPath.get(window.location.pathname);
	if (!page) return;

	function recordPage() {
		fetch("/api/analytics/visit", {
		method: "POST",
		credentials: "same-origin",
		cache: "no-store",
		keepalive: true,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ page }),
		}).catch(() => {});
	}
	recordPage();
	window.addEventListener("pageshow", event => { if (event.persisted) recordPage(); });
})();
