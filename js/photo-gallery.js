function initMemoryGallery() {
	const stage = document.getElementById("photoStageViewport");
	const world = document.getElementById("photo3DWorld");
	const strip = document.getElementById("dockThumbTrack");
	const stripViewport = document.getElementById("dockThumbContainer");
	const filters = document.getElementById("photoFilterNav");
	const counter = document.getElementById("photoCounter");
	const playButton = document.getElementById("btnDockPlay");
	const playIcon = document.getElementById("dockPlayIcon");
	const ambientCoord = document.getElementById("photoAmbientCoord");
	const ambientDate = document.getElementById("photoAmbientDate");
	if (!stage || !world || !strip) return;

	// Dates come from camera filenames. Exported images have no reliable capture date.
	const records = [
		["IMG_20250617_142644.webp", "summer", "树下的晴天", "蓝天、步道和树影。"],
		["IMG_20250617_191009.webp", "summer", "傍晚的草地", "云层下留着一线晚光。"],
		["MVIMG_20251002_190918.webp", "night", "夜色中的灯饰", "发光的装置立在夜空下。"],
		["MVIMG_20251029_112045.webp", "daily", "笔直的步道", "道路向树木深处延伸。"],
		["MVIMG_20251229_204947.webp", "daily", "黑板上的速写", "一幅粉笔画留在绿色黑板上。"],
		["MVIMG_20260101_214820.webp", "night", "桥边的灯笼", "暖色灯笼照亮夜晚的栏杆。"],
		["MVIMG_20260101_215643.webp", "night", "夜里的彩灯", "彩色灯饰悬在夜色中。"],
		["MVIMG_20260104_091429.webp", "daily", "树影与街道", "晨光落在树下的人行道。"],
		["IMG_20260404_164642.webp", "daily", "树旁的白鹅", "白鹅停在树干旁。"],
		["IMG_20260404_173444.webp", "summer", "粉色的花", "一朵盛开的粉色花。"],
		["IMG_20260404_173635.webp", "summer", "绿色叶片", "叶片铺满了整个画面。"],
		["IMG_20260517_211300.webp", "daily", "一碗甜品", "浅色甜品放在木盘里。"],
		["IMG_20260531_160331.webp", "campus", "楼前的草坪", "树荫与建筑围出一块草地。"],
		["IMG_20260603_215546.webp", "daily", "草地上的猫", "两只猫停在草地边。"],
		["IMG_20260617_185435.webp", "travel", "路上的傍晚", "车流沿着城市道路前行。"],
		["IMG_20260618_093243.webp", "campus", "门前的路牌", "红色路牌立在建筑前。"],
		["IMG_20260618_101524.webp", "travel", "广场一角", "树木、路面和一辆红色车。"],
		["IMG_20260618_102550.webp", "travel", "林间台阶", "石阶穿过一片树林。"],
		["IMG_20260618_195729.webp", "night", "夜间车窗", "车窗外是红色灯光。"],
		["IMG_20260619_184753.webp", "travel", "街道与公交车", "一辆蓝色公交车经过街边。"],
		["IMG_20260703_210055.webp", "daily", "桌上的纸签", "一张绿色纸签放在桌面。"],
		["IMG_20260705_181438.webp", "summer", "晴天与建筑", "树影映在明亮的城市街边。"],
		["IMG_20260719_163847.webp", "travel", "屋檐与树", "深色屋檐藏在树木之间。"],
		["mmexport1768389082919.webp", "night", "灯下的亭子", "灯光勾勒出亭子的轮廓。"],
		["mmexport1780117107740.webp", "daily", "树上的猫", "一只猫坐在树枝旁。"],
		["mmexport1780239583827.webp", "campus", "室内投影", "屏幕前有人站着。"]
	];
	const gps = []; // Add your own photo locations if desired.
	const photos = records.map(([filename, category, title, note], index) => {
		const match = filename.match(/^(?:MV)?IMG_(\d{4})(\d{2})(\d{2})_/);
		const stem = filename.replace(/\.webp$/i, "");
		return {
			frame: String(index + 1).padStart(2, "0"), filename, category, title, note,
			date: match ? `${match[1]}.${match[2]}.${match[3]}` : "",
			place: gps[index] ? `${gps[index][0].toFixed(2)}°N ${gps[index][1].toFixed(2)}°E` : "",
			src: `../photos/previews/${stem}-display.webp`,
			thumb: `../photos/previews/${stem}-thumb.webp`,
			display: `../photos/previews/${stem}-display.webp`,
			frameStyle: ["film", "postcard", "polaroid", "film", "postcard"][index % 5]
		};
	});
	const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
	const canHover = window.matchMedia("(hover: hover)");
	let visible = photos;
	let active = 0;
	let progress = 0;
	let from = 0;
	let to = 0;
	let started = 0;
	let animating = false;
	let raf = 0;
	let cards = [];
	let playing = false;
	let timer = 0;
	let resumeAfterPreview = false;
	let dragging = false;
	let dragStart = 0;
	let dragDistance = 0;
	let ignoreClick = false;
	let lastWheel = -Infinity;
	let tiltX = 0;
	let tiltY = 0;

	function wrappedOffset(index) {
		const length = visible.length;
		let offset = ((index - progress) % length + length) % length;
		if (offset > length / 2) offset -= length;
		return offset;
	}

	function pose(offset, index, mobile) {
		const side = Math.sign(offset) || 1;
		const distance = Math.abs(offset);
		const reach = mobile ? 145 : Math.min(440, stage.clientWidth * 0.35);
		const spread = Math.min(distance, 3.6);
		const irregular = distance < 0.12 ? 0 : Math.sin(index * 2.4) * 8 * Math.min(distance, 1);
		return {
			x: side * reach * Math.sin(Math.min(spread, 3.6) * 0.52) + irregular,
			y: distance < 0.12 ? 0 : Math.sin(index * 1.8) * 15 - 11 * distance,
			z: 145 - 105 * distance - 24 * distance * distance,
			ry: side * -Math.min(58, distance * 29),
			rz: distance < 0.12 ? 0 : Math.cos(index * 1.9) * 2.5,
			scale: Math.max(0.48, 1.08 - distance * 0.16),
			opacity: Math.max(0, 1 - Math.max(0, distance - 0.15) * (mobile ? 0.3 : 0.22)),
			blur: mobile ? 0 : Math.max(0, distance - 0.75) * 0.75
		};
	}

	function paint() {
		const mobile = window.innerWidth <= 768;
		cards.forEach((card, index) => {
			const offset = wrappedOffset(index);
			const distance = Math.abs(offset);
			const shown = distance <= (mobile ? 1.18 : 3.7);
			card.hidden = !shown;
			if (!shown) return;
			const p = pose(offset, index, mobile);
			const hero = distance < 0.48;
			card.classList.toggle("is-hero-card", hero);
			card.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,${p.z.toFixed(1)}px) rotateX(${hero ? 2 + tiltX : 0}deg) rotateY(${p.ry + (hero ? tiltY : 0)}deg) rotateZ(${p.rz}deg) scale(${p.scale})`;
			card.style.opacity = p.opacity.toFixed(2);
			card.style.filter = `blur(${p.blur.toFixed(1)}px)`;
			card.style.zIndex = String(Math.round(100 - distance * 15));
			card.style.pointerEvents = distance < (mobile ? 1.05 : 2.5) ? "auto" : "none";
			const image = card.querySelector("img");
			const desired = distance < 1.6 ? visible[index].display : visible[index].thumb;
			if (image.dataset.current !== desired) {
				image.src = desired;
				image.dataset.current = desired;
			}
		});
	}

	function animate(now) {
		const t = Math.min(1, (now - started) / 920);
		const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
		progress = from + (to - from) * eased;
		paint();
		if (t < 1) raf = requestAnimationFrame(animate);
		else { progress = to; animating = false; paint(); }
	}

	function syncControls() {
		strip.querySelectorAll(".dock-thumb-chip").forEach((button, index) => {
			button.classList.toggle("is-active", index === active);
			button.setAttribute("aria-current", index === active ? "true" : "false");
		});
		const selected = strip.children[active];
		if (selected && stripViewport) {
			stripViewport.scrollTo({
				left: selected.offsetLeft - stripViewport.clientWidth / 2 + selected.clientWidth / 2,
				behavior: motion.matches ? "instant" : "smooth"
			});
		}
		if (counter) counter.textContent = `${String(active + 1).padStart(2, "0")} / ${String(visible.length).padStart(2, "0")}`;
		if (ambientCoord) ambientCoord.textContent = visible[active]?.place || "";
		if (ambientDate) {
			ambientDate.textContent = visible[active]?.date || "";
			if (!motion.matches && document.getElementById("photo")?.classList.contains("chapter-visual-in")) {
				ambientDate.classList.remove("date-stamp-in");
				void ambientDate.offsetWidth;
				ambientDate.classList.add("date-stamp-in");
			}
		}
	}

	function go(index) {
		if (!visible.length) return;
		const next = (index + visible.length) % visible.length;
		if (next === active) return;
		let delta = next - active;
		if (delta > visible.length / 2) delta -= visible.length;
		if (delta < -visible.length / 2) delta += visible.length;
		cancelAnimationFrame(raf);
		active = next;
		from = progress;
		to += delta;
		tiltX = tiltY = 0;
		if (motion.matches) { progress = to; paint(); }
		else { started = performance.now(); animating = true; raf = requestAnimationFrame(animate); }
		syncControls();
		restartTimer();
	}

	function rebuild() {
		world.replaceChildren();
		strip.replaceChildren();
		cards = visible.map((photo, index) => {
			const card = document.createElement("button");
			card.type = "button";
			card.className = `photo-polaroid-card frame-${photo.frameStyle}`;
			card.setAttribute("aria-label", `${photo.frame} ${photo.title}，点击查看或切换`);
			card.innerHTML = `<span class="card-washi-tape" aria-hidden="true"></span><span class="film-sprockets film-sprockets-top" aria-hidden="true"></span><span class="film-sprockets film-sprockets-bottom" aria-hidden="true"></span><span class="card-photo-wrapper"><img src="${photo.thumb}" width="305" height="268" alt="${photo.title}" loading="lazy" decoding="async"></span><span class="card-film-header"><span class="card-frame-badge">NO. ${photo.frame}</span><span class="card-date-badge">${photo.date}</span></span><span class="card-film-title">${photo.title}</span><span class="card-film-note">${photo.note}</span><span class="card-place">${photo.place}</span><span class="card-file-name">${photo.filename}</span>`;
			card.addEventListener("click", () => {
				if (ignoreClick) { ignoreClick = false; return; }
				if (index === active) globalPhotoLightboxOpen?.(visible, index);
				else go(index);
			});
			world.appendChild(card);

			const thumb = document.createElement("button");
			thumb.type = "button";
			thumb.className = "dock-thumb-chip";
			thumb.title = `第 ${photo.frame} 张：${photo.title}`;
			thumb.setAttribute("aria-label", thumb.title);
			thumb.innerHTML = `<img src="${photo.thumb}" width="48" height="40" alt="" loading="lazy">`;
			thumb.addEventListener("click", () => go(index));
			strip.appendChild(thumb);
			return card;
		});
		progress = active = from = to = 0;
		paint();
		syncControls();
	}

	function restartTimer() {
		clearInterval(timer);
		if (playing && !motion.matches) timer = setInterval(() => {
			const bounds = stage.getBoundingClientRect();
			if (bounds.bottom > 0 && bounds.top < window.innerHeight && !animating && !dragging && !(canHover.matches && document.getElementById("photo")?.matches(":hover")) && !document.hidden && !document.getElementById("lightbox-modal")?.classList.contains("show")) go(active + 1);
		}, 5500);
	}

	function syncPlay() {
		playIcon.textContent = playing ? "Ⅱ" : "▶";
		playButton.title = playing ? "暂停自动播放" : "开始自动播放";
		playButton.setAttribute("aria-label", playButton.title);
		playButton.setAttribute("aria-pressed", String(playing));
		restartTimer();
	}

	filters?.querySelectorAll(".photo-archive-btn").forEach(button => button.addEventListener("click", () => {
		filters.querySelectorAll(".photo-archive-btn").forEach(item => {
			const selected = item === button;
			item.classList.toggle("is-active", selected);
			item.setAttribute("aria-selected", String(selected));
		});
		const category = button.dataset.cat;
		visible = category === "all" ? photos : photos.filter(photo => photo.category === category);
		cancelAnimationFrame(raf);
		animating = false;
		rebuild();
		restartTimer();
	}));

	document.getElementById("btnDockPrev")?.addEventListener("click", () => go(active - 1));
	document.getElementById("btnDockNext")?.addEventListener("click", () => go(active + 1));
	playButton?.addEventListener("click", () => { playing = !playing; syncPlay(); });
	stage.addEventListener("pointerdown", event => {
		if (event.pointerType === "mouse" && event.button !== 0) return;
		if (event.pointerType === "mouse") event.preventDefault();
		dragging = true;
		dragStart = event.clientX;
		dragDistance = 0;
	});
	stage.addEventListener("dragstart", event => event.preventDefault());
	stage.addEventListener("pointermove", event => {
		if (dragging) {
			dragDistance = event.clientX - dragStart;
			return;
		}
		const hero = cards[active];
		if (!hero || !hero.matches(":hover") || motion.matches) return;
		const rect = hero.getBoundingClientRect();
		tiltY = Math.max(-4, Math.min(4, (event.clientX - rect.left - rect.width / 2) / rect.width * 8));
		tiltX = Math.max(-3, Math.min(3, -(event.clientY - rect.top - rect.height / 2) / rect.height * 6));
		if (!animating) paint();
	});
	window.addEventListener("pointerup", () => {
		if (Math.abs(dragDistance) > 48) {
			ignoreClick = true;
			setTimeout(() => { ignoreClick = false; }, 100);
			go(active + (dragDistance < 0 ? 1 : -1));
		}
		dragging = false;
		dragDistance = 0;
	});
	stage.addEventListener("pointercancel", () => { dragging = false; dragDistance = 0; });
	stage.addEventListener("pointerleave", () => { tiltX = tiltY = 0; if (!animating) paint(); });
	stage.addEventListener("wheel", event => {
		if (Math.abs(event.deltaY) < 5) return;
		if (performance.now() - lastWheel < 700) return;
		lastWheel = performance.now();
		go(active + (event.deltaY > 0 ? 1 : -1));
	}, { passive: true });
	document.addEventListener("keydown", event => {
		if (event.target.closest("input, textarea, [contenteditable='true']") || document.getElementById("lightbox-modal")?.classList.contains("show")) return;
		const bounds = stage.getBoundingClientRect();
		if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) return;
		if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
			event.preventDefault();
			go(active + (event.key === "ArrowRight" ? 1 : -1));
		}
	});
	window.addEventListener("resize", () => { if (!animating) paint(); });
	motion.addEventListener("change", () => { if (motion.matches) { playing = false; cancelAnimationFrame(raf); animating = false; progress = to; paint(); } syncPlay(); });
	window._pausePhotoOrbit = () => { resumeAfterPreview = playing; clearInterval(timer); };
	window._resumePhotoOrbit = () => { if (resumeAfterPreview) restartTimer(); resumeAfterPreview = false; };
	rebuild();
	syncPlay();
}
