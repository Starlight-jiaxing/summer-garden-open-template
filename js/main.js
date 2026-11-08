/**
 * ==========================================================================
 * 夏日铁轨手账 · 个人档案交互引擎 (main.js)
 * 功能包含：动态问候时钟、本地便签与回信、黑胶与磁带联动、图片大图灯箱
 * ==========================================================================
 */

document.addEventListener("DOMContentLoaded", function () {
	if (typeof initDynamicGreeting === "function") initDynamicGreeting();
	if (typeof initStickyNotes === "function") initStickyNotes();
	if (typeof initLightbox === "function") initLightbox();
	if (typeof initVinylWall === "function") initVinylWall();
	if (typeof initMixtapeDeckInteractivity === "function") initMixtapeDeckInteractivity();
	if (typeof initTeyvatArchive === "function") initTeyvatArchive();
	if (typeof initWukongShowcase === "function") initWukongShowcase();
	if (typeof initReadingJournal === "function") initReadingJournal();
	if (typeof initMemoryGallery === "function") initMemoryGallery();
	if (typeof initCampChapterScrollReveal === "function") initCampChapterScrollReveal();
	if (typeof initSomersaultCloud === "function") initSomersaultCloud();
});

/* ========================================================================== 
   私人常听磁带 (Tape & Sleeve) · A/B面沉浸联动与微音效系统
   ========================================================================== */
function playCassetteDeckSound() {
	try {
		const AudioContext = window.AudioContext || window.webkitAudioContext;
		if (!AudioContext) return;
		const ctx = new AudioContext();
		const now = ctx.currentTime;

		// 1. 机械压扣脆响 (Click)
		const osc1 = ctx.createOscillator();
		const gain1 = ctx.createGain();
		osc1.type = "sine";
		osc1.frequency.setValueAtTime(160, now);
		osc1.frequency.exponentialRampToValueAtTime(45, now + 0.035);
		gain1.gain.setValueAtTime(0.22, now);
		gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
		osc1.connect(gain1);
		gain1.connect(ctx.destination);
		osc1.start(now);
		osc1.stop(now + 0.035);

		// 2. 磁带入仓咬合声 (Snap / Settle)
		const osc2 = ctx.createOscillator();
		const gain2 = ctx.createGain();
		osc2.type = "triangle";
		osc2.frequency.setValueAtTime(340, now + 0.045);
		osc2.frequency.exponentialRampToValueAtTime(80, now + 0.09);
		gain2.gain.setValueAtTime(0.18, now + 0.045);
		gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
		osc2.connect(gain2);
		gain2.connect(ctx.destination);
		osc2.start(now + 0.045);
		osc2.stop(now + 0.09);
	} catch (e) {
		// 忽略静音模式或未经交互拦截
	}
}

function initMixtapeDeckInteractivity() {
	const tapeCards = document.querySelectorAll(".mixtape-card");
	if (!tapeCards || tapeCards.length === 0) return;

	// 曲目名称与本地可播放黑胶 ID 映射字典
	const SONG_MAPPING = {
		"大鱼": "bigFish",
		"光亮": "brightness",
		"花开忘忧": "forgetWorry",
		"三餐四季": "threeMeals",
		"请笃信一个梦": "believeDream",
		"化身孤岛的鲸": "ocean",
		"风仪之舞": "summer",
		"快意新词": "passion",
		"山风拂萝衣": "companion",
		"云楼烟霭月斜白": "mistMoon",
		"神女劈观·唤情": "devastation",
		"共逐星华": "chasingStarlight",
		"詹诸张幕遮银阙": "moonVeil",
		"献向镜水的月光": "mirroredMoon"
	};

	function showMixtapeToast(text) {
		const existingToast = document.getElementById("audio-toast-tip");
		if (existingToast) {
			existingToast.textContent = text;
			existingToast.style.display = "block";
			clearTimeout(existingToast._timer);
			existingToast._timer = setTimeout(() => {
				existingToast.style.display = "none";
			}, 2800);
		}
	}

	tapeCards.forEach((card) => {
		// 1. 卡带整体点击：入仓激活状态切换
		card.addEventListener("click", function (e) {
			// 如果点击的是具体曲目项，交给曲目逻辑处理
			if (e.target.closest(".mixtape-track-item")) return;

			playCassetteDeckSound();
			const isAlreadyActive = card.classList.contains("is-active-tape");

			tapeCards.forEach(c => c.classList.remove("is-active-tape"));
			if (!isAlreadyActive) {
				card.classList.add("is-active-tape");
				const sideLabel = card.querySelector(".tape-pill-side")?.textContent || "CASSETTE";
				const artistName = card.querySelector(".artist-name-zh")?.textContent || "音乐特展";
				showMixtapeToast(`📻 卡带装入就绪：[${sideLabel}] ${artistName}`);
			}
		});

		// 2. 卡带内每一首曲目点击联动
		const trackItems = card.querySelectorAll(".mixtape-track-item");
		trackItems.forEach((item) => {
			const songName = item.querySelector(".track-name")?.textContent.trim() || "";
			const targetSongId = item.dataset.songId || SONG_MAPPING[songName];
			const targetSong = targetSongId && window.VinylPlayer?.getSong
				? window.VinylPlayer.getSong(targetSongId)
				: null;
			const playState = document.createElement("span");
			playState.className = "track-play-state";
			playState.textContent = targetSong?.src ? "▶ 播放" : `${targetSong?.format || "音频"} 需转换`;
			item.appendChild(playState);
			item.classList.toggle("is-unavailable", Boolean(targetSong && !targetSong.src));
			item.setAttribute("role", "button");
			item.setAttribute("tabindex", "0");
			item.setAttribute("aria-label", targetSong?.src
				? `播放《${songName}》`
				: `《${songName}》为 ${targetSong?.format || "不可播放"} 格式，需要转换`);

			item.addEventListener("click", function (e) {
				e.stopPropagation();
				playCassetteDeckSound();

				// 设置当前卡带为激活态
				tapeCards.forEach(c => c.classList.remove("is-active-tape"));
				card.classList.add("is-active-tape");

				const artistTagEl = item.querySelector(".track-artist-tag, .track-tag-badge");
				const artistName = artistTagEl ? artistTagEl.textContent.trim() : "";

				if (targetSongId && window.VinylPlayer && typeof window.VinylPlayer.togglePlay === "function") {
					const accepted = window.VinylPlayer.togglePlay(targetSongId);
					if (targetSong?.src && accepted !== false) {
						showMixtapeToast(`正在切换：${artistName} ·《${songName}》`);
					}
				} else {
					showMixtapeToast(`没有找到《${songName}》对应的音频文件`);
				}
			});

			item.addEventListener("keydown", function (e) {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					item.click();
				}
			});
		});
	});

	// 尾声信箱跳转按钮轻微音效与交互
	const dropBtn = document.getElementById("dropNoteBtn");
	if (dropBtn) {
		dropBtn.addEventListener("click", function () {
			playCassetteDeckSound();
		});
	}
}

/* ========================================================================== 
   提瓦特旅行影像卷宗 · 滚动与点选翻阅
   ========================================================================== */
function initTeyvatArchive() {
	const archive = document.getElementById("teyvatArchive");
	const stage = document.getElementById("teyvatArchiveStage");
	if (!archive || !stage) return;

	const slides = Array.from(stage.querySelectorAll(".contact-main-slide"));
	const thumbs = Array.from(stage.querySelectorAll(".contact-thumb"));
	const number = document.getElementById("teyvatArchiveNo");
	const title = document.getElementById("teyvatArchiveTitle");
	const mainIndex = document.getElementById("contactMainIndex");
	const mainTitle = document.getElementById("contactMainTitle");
	const sheetStatus = document.getElementById("contactSheetStatus");
	const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
	let targetProgress = 0;
	let displayProgress = 0;
	let currentIndex = -1;
	let frame = 0;

	function setCurrent(index) {
		const next = Math.max(0, Math.min(slides.length - 1, index));
		if (next === currentIndex) return;
		currentIndex = next;
		const label = slides[next].dataset.title || `收藏片段 ${next + 1}`;
		const formatted = String(next + 1).padStart(2, "0");
		if (number) number.textContent = formatted;
		if (title) title.textContent = label;
		if (mainIndex) mainIndex.textContent = `FRAME ${formatted} / 05`;
		if (mainTitle) mainTitle.textContent = label;
		if (sheetStatus) sheetStatus.textContent = formatted;

		slides.forEach((slide, slideIndex) => {
			const active = slideIndex === next;
			slide.classList.toggle("is-active", active);
			if (active && !motion.matches) {
				slide.classList.remove("contact-print-reveal");
				void slide.offsetWidth;
				slide.classList.add("contact-print-reveal");
			}
		});
		thumbs.forEach((thumb, thumbIndex) => {
			const active = thumbIndex === next;
			thumb.classList.toggle("is-active", active);
			thumb.toggleAttribute("aria-current", active);
		});
	}

	function paint(progress) {
		setCurrent(Math.round(progress));
		const normalized = progress / Math.max(1, slides.length - 1);
		stage.style.setProperty("--viewfinder-left", `${(normalized * 80).toFixed(3)}%`);
	}

	function animate() {
		const smoothing = motion.matches ? 1 : 0.16;
		displayProgress += (targetProgress - displayProgress) * smoothing;
		if (Math.abs(targetProgress - displayProgress) < 0.001) displayProgress = targetProgress;
		paint(displayProgress);
		if (displayProgress !== targetProgress) frame = requestAnimationFrame(animate);
		else frame = 0;
	}

	function updateFromPage() {
		if (window.innerWidth <= 768) return;
		const rect = archive.getBoundingClientRect();
		const stickyTop = Math.min(112, window.innerHeight * 0.13);
		const travel = Math.max(1, rect.height - Math.min(window.innerHeight * 0.76, 680) - stickyTop);
		const ratio = Math.max(0, Math.min(1, (stickyTop - rect.top) / travel));
		targetProgress = ratio * (slides.length - 1);
		if (!frame) frame = requestAnimationFrame(animate);
	}

	function resetMode() {
		if (window.innerWidth <= 768) {
			cancelAnimationFrame(frame);
			frame = 0;
			targetProgress = displayProgress = Math.max(0, currentIndex);
			setCurrent(0);
			stage.style.setProperty("--viewfinder-left", "0%");
		} else {
			updateFromPage();
		}
	}

	thumbs.forEach((thumb, index) => {
		thumb.addEventListener("click", () => {
			targetProgress = displayProgress = index;
			stage.style.setProperty("--viewfinder-left", `${index * 20}%`);
			setCurrent(index);
			if (window.innerWidth > 768) {
				const rect = archive.getBoundingClientRect();
				const archiveTop = window.scrollY + rect.top;
				const stickyTop = Math.min(112, window.innerHeight * 0.13);
				const travel = Math.max(1, rect.height - Math.min(window.innerHeight * 0.76, 680) - stickyTop);
				window.scrollTo({
					top: archiveTop - stickyTop + travel * (index / Math.max(1, slides.length - 1)),
					behavior: motion.matches ? "auto" : "smooth"
				});
			}
		});
	});

	window.addEventListener("scroll", updateFromPage, { passive: true });
	window.addEventListener("resize", resetMode);
	motion.addEventListener("change", resetMode);
	setCurrent(0);
	resetMode();
}

/* ==========================================================================
   1. 动态时间与问候语系统 (用于 home.html 等页面)
   ========================================================================== */
function initDynamicGreeting() {
	const greetingText = document.getElementById("greeting-text");
	const clockText = document.getElementById("clock-text");
	const weatherIcon = document.getElementById("weather-icon");

	if (!greetingText || !clockText) return;

	function updateClockAndGreeting() {
		const now = new Date();
		const hour = now.getHours();
		const minute = String(now.getMinutes()).padStart(2, "0");

		clockText.textContent = `${String(hour).padStart(2, "0")}:${minute}`;

		let greeting = "你好呀，林间旅人！";
		let icon = "🍃";

		if (hour >= 5 && hour < 11) {
			greeting = "早安，晨光洒满林间！";
			icon = "🌅";
		} else if (hour >= 11 && hour < 14) {
			greeting = "午安，阳光正好，欢迎小坐！";
			icon = "☀️";
		} else if (hour >= 14 && hour < 18) {
			greeting = "午后好，吹吹林间的微风吧！";
			icon = "🍃";
		} else if (hour >= 18 && hour < 23) {
			greeting = "晚上好，在星光下慢慢探索吧！";
			icon = "✨";
		} else {
			greeting = "夜深了，林间旅人早点休息哦！";
			icon = "🌙";
		}

		const days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
		const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
		const dayStr = days[now.getDay()];
		const monthStr = months[now.getMonth()];
		const dateNum = now.getDate();

		if (document.body.classList.contains("summer-diary-page")) {
			greetingText.textContent = `${dayStr}, ${monthStr} ${dateNum} · ${greeting}`;
		} else {
			greetingText.textContent = greeting;
		}

		if (weatherIcon) weatherIcon.textContent = icon;
	}

	updateClockAndGreeting();
	setInterval(updateClockAndGreeting, 60000); // 每分钟更新一次
}

/* ========================================================================== 
   2. 本地便签留言板与回信 (用于 message.html)
   ========================================================================== */
const STORAGE_KEY = "personal_guestbook_notes_v2";
const LEGACY_STORAGE_KEY = "treehouse_sticky_notes_v1";

const DEFAULT_NOTES = [
	{
		id: "welcome-note",
		author: "站主",
		color: "green",
		content: "欢迎来到我的留言页。可以聊聊你看到这里的感受，也可以分享最近喜欢的歌、书、游戏或生活片段。",
		time: "置顶",
		createdAt: 0,
		owner: true,
		reactionCount: 0,
		reacted: false,
		replies: []
	}
];

function initStickyNotes() {
	const stickyBoard = document.getElementById("sticky-board");
	const stickyForm = document.getElementById("sticky-form");
	const clearBtn = document.getElementById("clear-notes-btn");
	const contentInput = document.getElementById("note-content");
	const charCount = document.getElementById("note-char-count");
	const feedback = document.getElementById("form-feedback");
	const filterButtons = Array.from(document.querySelectorAll(".filter-btn"));

	if (!stickyBoard || !stickyForm) return;
	let activeFilter = "newest";
	const openThreads = new Set();

	function createId(prefix) {
		return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	function formatTime(date = new Date()) {
		return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
	}

	function normalizeNote(note, index = 0) {
		return {
			id: note.id ?? createId("note"),
			author: note.author || "未署名访客",
			color: ["yellow", "green", "pink", "blue"].includes(note.color) ? note.color : "yellow",
			content: note.content || "",
			time: note.time || "曾经留下",
			createdAt: Number(note.createdAt) || (Number(note.id) > 100000 ? Number(note.id) : Date.now() - index),
			owner: Boolean(note.owner),
			reactionCount: Number(note.reactionCount) || 0,
			reacted: Boolean(note.reacted),
			replies: Array.isArray(note.replies) ? note.replies.map((reply, replyIndex) => ({
				id: reply.id ?? createId(`reply-${replyIndex}`),
				author: reply.author || "未署名访客",
				content: reply.content || "",
				time: reply.time || "曾经回复",
				owner: Boolean(reply.owner)
			})) : []
		};
	}

	function migrateLegacyNotes() {
		const legacyAuthors = ["树屋主人 🌿", "派蒙 (提瓦特漫游者)", "天命人 🐵", "峡谷守塔人 ⚔️"];
		try {
			const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "[]");
			const personalNotes = Array.isArray(legacy)
				? legacy.filter(note => !legacyAuthors.includes(note.author)).map(normalizeNote)
				: [];
			return [...DEFAULT_NOTES.map(normalizeNote), ...personalNotes];
		} catch (error) {
			return DEFAULT_NOTES.map(normalizeNote);
		}
	}

	function getNotes() {
		try {
			const data = localStorage.getItem(STORAGE_KEY);
			if (data) return JSON.parse(data).map(normalizeNote);
			const migrated = migrateLegacyNotes();
			localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
			return migrated;
		} catch (error) {
			return DEFAULT_NOTES.map(normalizeNote);
		}
	}

	function saveNotes(notes) {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
		renderNotes(notes);
	}

	function renderNotes(notes) {
		let visible = notes.slice();
		if (activeFilter === "replied") visible = visible.filter(note => note.replies.length > 0);
		visible.sort((a, b) => {
			if (a.owner !== b.owner) return a.owner ? -1 : 1;
			return activeFilter === "oldest" ? a.createdAt - b.createdAt : b.createdAt - a.createdAt;
		});

		stickyBoard.innerHTML = "";
		if (!visible.length) {
			stickyBoard.innerHTML = `<div class="board-empty"><strong>这里暂时没有符合条件的纸条。</strong><span>换个筛选看看，或者写下第一张。</span></div>`;
			return;
		}

		visible.forEach((note, index) => {
			const noteId = String(note.id);
			const isOpen = openThreads.has(noteId);
			const article = document.createElement("article");
			article.className = `sticky-note ${note.color}${isOpen ? " thread-open" : ""}`;
			article.style.setProperty("--note-rotate", `${[-1.1, .7, -.45, .9][index % 4]}deg`);
			article.dataset.noteId = noteId;
			const replies = note.replies.map(reply => `
				<div class="reply-slip">
					<div class="reply-head"><strong>${escapeHTML(reply.author)}</strong>${reply.owner ? '<span class="owner-seal">站主回信</span>' : ""}<time>${escapeHTML(reply.time)}</time></div>
					<p>${escapeHTML(reply.content)}</p>
				</div>`).join("");

			article.innerHTML = `
				<div class="note-paper">
					<div class="note-author"><span>${escapeHTML(note.author)}</span>${note.owner ? '<span class="owner-seal">站主置顶</span>' : `<button class="delete-btn" type="button" aria-label="删除 ${escapeHTML(note.author)} 的便签" data-action="delete">×</button>`}</div>
					<p class="note-content">${escapeHTML(note.content)}</p>
					<div class="note-meta"><time>${escapeHTML(note.time)}</time><div class="note-tools"><button type="button" class="stamp-btn${note.reacted ? " is-stamped" : ""}" data-action="react" aria-pressed="${note.reacted}">共鸣${note.reactionCount ? ` ${note.reactionCount}` : ""}</button><button type="button" class="reply-toggle" data-action="toggle" aria-expanded="${isOpen}">回信${note.replies.length ? ` ${note.replies.length}` : ""}</button></div></div>
				</div>
				<div class="reply-thread" ${isOpen ? "" : "hidden"}>
					<div class="reply-stack">${replies || '<p class="reply-empty">还没有回信，你可以接着这张纸条说两句。</p>'}</div>
					<form class="reply-form">
						<label><span>你的昵称</span><input name="reply-author" maxlength="24" autocomplete="nickname" required></label>
						<label class="reply-message"><span>写一封回信</span><textarea name="reply-content" maxlength="180" rows="2" required></textarea></label>
						<button type="submit">夹入回信</button>
					</form>
				</div>`;
			stickyBoard.appendChild(article);
		});
	}

	stickyForm.addEventListener("submit", function (e) {
		e.preventDefault();
		const authorInput = document.getElementById("note-author");
		const author = authorInput.value.trim();
		const content = contentInput.value.trim();
		const color = stickyForm.querySelector('input[name="note-color"]:checked')?.value || "yellow";
		if (!author || !content) {
			feedback.textContent = "请写下昵称和留言内容。";
			(!author ? authorInput : contentInput).focus();
			return;
		}

		const newNote = {
			id: createId("note"), author, color, content,
			time: formatTime(), createdAt: Date.now(), owner: false,
			reactionCount: 0, reacted: false, replies: []
		};
		const notes = getNotes();
		notes.unshift(newNote);
		activeFilter = "newest";
		filterButtons.forEach(button => {
			const active = button.dataset.filter === activeFilter;
			button.classList.toggle("is-active", active);
			button.setAttribute("aria-pressed", String(active));
		});
		saveNotes(notes);
		contentInput.value = "";
		charCount.textContent = "0 / 280";
		feedback.textContent = "纸条已经贴到墙上。";
		stickyBoard.querySelector(`[data-note-id="${newNote.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
	});

	contentInput.addEventListener("input", () => {
		charCount.textContent = `${contentInput.value.length} / 280`;
		feedback.textContent = "";
	});

	filterButtons.forEach(button => button.addEventListener("click", () => {
		activeFilter = button.dataset.filter;
		filterButtons.forEach(item => {
			const active = item === button;
			item.classList.toggle("is-active", active);
			item.setAttribute("aria-pressed", String(active));
		});
		renderNotes(getNotes());
	}));

	stickyBoard.addEventListener("click", event => {
		const button = event.target.closest("button[data-action]");
		if (!button) return;
		const article = button.closest(".sticky-note");
		const noteId = article?.dataset.noteId;
		if (!noteId) return;
		const notes = getNotes();
		const note = notes.find(item => String(item.id) === noteId);
		if (!note) return;

		if (button.dataset.action === "toggle") {
			openThreads.has(noteId) ? openThreads.delete(noteId) : openThreads.add(noteId);
			renderNotes(notes);
			if (openThreads.has(noteId)) stickyBoard.querySelector(`[data-note-id="${CSS.escape(noteId)}"] textarea`)?.focus();
		}
		if (button.dataset.action === "react") {
			note.reacted = !note.reacted;
			note.reactionCount = Math.max(0, note.reactionCount + (note.reacted ? 1 : -1));
			saveNotes(notes);
		}
		if (button.dataset.action === "delete" && confirm("确定删除这张本机便签吗？")) {
			saveNotes(notes.filter(item => String(item.id) !== noteId));
		}
	});

	stickyBoard.addEventListener("submit", event => {
		const replyForm = event.target.closest(".reply-form");
		if (!replyForm) return;
		event.preventDefault();
		const noteId = replyForm.closest(".sticky-note")?.dataset.noteId;
		const author = replyForm.elements["reply-author"].value.trim();
		const content = replyForm.elements["reply-content"].value.trim();
		if (!noteId || !author || !content) return;
		const notes = getNotes();
		const note = notes.find(item => String(item.id) === noteId);
		if (!note) return;
		note.replies.push({ id: createId("reply"), author, content, time: formatTime(), owner: false });
		openThreads.add(noteId);
		saveNotes(notes);
	});

	clearBtn?.addEventListener("click", function () {
		if (confirm("清除当前浏览器中的留言和回信，只保留欢迎纸条吗？")) {
			openThreads.clear();
			saveNotes(DEFAULT_NOTES.map(normalizeNote));
		}
	});

	renderNotes(getNotes());
}

/* ==========================================================================
   4. 图片大图灯箱 Lightbox (用于 3D 星轨相册与全屏胶片放映)
   ========================================================================== */
let globalPhotoLightboxOpen = null;

function initLightbox() {
	const modal = document.getElementById("lightbox-modal");
	const modalImg = document.getElementById("lightbox-img");
	const closeBtn = document.getElementById("lb-close-btn") || modal?.querySelector(".close-btn");
	const prevBtn = document.getElementById("lb-prev-btn");
	const nextBtn = document.getElementById("lb-next-btn");
	const frameBadge = document.getElementById("lb-frame-badge");
	const dateText = document.getElementById("lb-date-text");
	const titleText = document.getElementById("lb-title-text");
	const noteText = document.getElementById("lb-note-text");
	const statusText = document.getElementById("lb-status");
	const retryBtn = document.getElementById("lb-retry-btn");

	if (!modal || !modalImg) return;

	let currentList = [];
	let currentIndex = 0;
	let requestId = 0, pendingImage = null, loadTimer = 0;
	let returnFocus = null, previousOverflow = "";
	modalImg.decoding = "async";

	function cancelLoad() {
		requestId++;
		clearTimeout(loadTimer);
		if (pendingImage) {
			pendingImage.onload = pendingImage.onerror = null;
			pendingImage.removeAttribute("src");
			pendingImage = null;
		}
	}

	function showPhoto(idx) {
		if (!currentList.length) return;
		currentIndex = (idx + currentList.length) % currentList.length;
		const item = currentList[currentIndex];
		if (!item) return;

		cancelLoad();
		const id = requestId;
		modal.dataset.photoState = "loading";
		modalImg.setAttribute("aria-busy", "true");
		modalImg.hidden = true;
		modalImg.removeAttribute("src");
		modalImg.alt = item.title || "放大照片";
		if (statusText) statusText.textContent = "正在显影…";
		if (retryBtn) retryBtn.hidden = true;
		// Clear the previous frame before changing its caption. A cached thumbnail
		// of this same photo can remain visible while its clear version decodes.
		if (item.thumb) {
			modalImg.onload = () => { if (id === requestId && modalImg.naturalWidth) modalImg.hidden = false; };
			modalImg.src = encodeURI(item.thumb);
		}
		if (frameBadge) frameBadge.textContent = `FRAME ${item.frame || String(currentIndex + 1).padStart(2, "0")}`;
		if (dateText) dateText.textContent = item.date || "";
		if (titleText) titleText.textContent = item.title || "";
		if (noteText) noteText.textContent = item.note ? `“${item.note}”` : "";
		if (!modal.classList.contains("show")) {
			returnFocus = document.activeElement;
			previousOverflow = document.body.style.overflow;
			modal.classList.add("show");
			closeBtn?.focus({ preventScroll: true });
		}
		document.body.classList.add("has-photo-preview");
		document.body.style.overflow = "hidden";
		function failed() {
			if (id !== requestId) return;
			clearTimeout(loadTimer);
			modal.dataset.photoState = "error";
			modalImg.setAttribute("aria-busy", "false");
			if (statusText) statusText.textContent = "清晰照片暂未加载好，可以再试一次。";
			if (retryBtn) retryBtn.hidden = false;
		}
		const image = pendingImage = new Image();
		image.decoding = "async";
		image.onload = async () => {
			try { await image.decode(); } catch (error) { failed(); return; }
			if (id !== requestId || !modal.classList.contains("show")) return;
			clearTimeout(loadTimer);
			modalImg.onload = null;
			modalImg.src = image.src;
			modalImg.hidden = false;
			modalImg.setAttribute("aria-busy", "false");
			modal.dataset.photoState = "ready";
			if (statusText) statusText.textContent = "";
			pendingImage = null;
		};
		image.onerror = failed;
		loadTimer = setTimeout(failed, 12000);
		image.src = encodeURI(item.display || item.src);
	}

	function closeLightbox() {
		cancelLoad();
		modal.classList.remove("show");
		document.body.classList.remove("has-photo-preview");
		document.body.style.overflow = previousOverflow;
		if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
		if (window._resumePhotoOrbit) window._resumePhotoOrbit();
	}
	retryBtn?.addEventListener("click", () => showPhoto(currentIndex));

	// 暴露全局唤起方法供 3D 星轨卡片调用
	globalPhotoLightboxOpen = function (photoList, startIndex = 0) {
		currentList = photoList;
		showPhoto(startIndex);
		if (window._pausePhotoOrbit) window._pausePhotoOrbit();
	};

	if (prevBtn) {
		prevBtn.addEventListener("click", function (e) {
			e.stopPropagation();
			showPhoto(currentIndex - 1);
		});
	}

	if (nextBtn) {
		nextBtn.addEventListener("click", function (e) {
			e.stopPropagation();
			showPhoto(currentIndex + 1);
		});
	}

	if (closeBtn) {
		closeBtn.addEventListener("click", closeLightbox);
	}

	modal.addEventListener("click", function (e) {
		if (e.target === modal || e.target.classList.contains("lightbox-viewport") || e.target.classList.contains("lightbox-media-container")) {
			closeLightbox();
		}
	});

	document.addEventListener("keydown", function (e) {
		if (!modal.classList.contains("show")) return;
		if (e.key === "Escape") {
			closeLightbox();
		} else if (e.key === "ArrowLeft") {
			showPhoto(currentIndex - 1);
		} else if (e.key === "ArrowRight") {
			showPhoto(currentIndex + 1);
		} else if (e.key === "Tab") {
			const buttons = [...modal.querySelectorAll("button")].filter(b => !b.hidden && !b.disabled);
			const first = buttons[0], last = buttons[buttons.length - 1];
			if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
			else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
		}
	});

	// 兼容普通切片图片点击
	document.querySelectorAll(".photo-slice img").forEach(img => {
		img.style.cursor = "zoom-in";
		img.addEventListener("click", function () {
			globalPhotoLightboxOpen([{ src: this.src, title: this.alt }]);
		});
	});
}

// XSS 安全字符转义辅助函数
function escapeHTML(str) {
	if (!str) return "";
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

/* ==========================================================================
   5. 悬浮式玻璃胶囊菜单交互引擎 (Capsule Nav Interactive Engine)
   支持：
   - 鼠标悬停平滑展开 (由 CSS :hover 驱动)
   - 点击标头或菜单切换锁定展开/收起 (支持触屏与点击偏好)
   - 点击外部区域自动折叠收拢
   - 按下 ESC 键自动收拢
   ========================================================================== */
/* ==========================================================================
   7. 黑胶手账音乐墙交互 (Vinyl Record Shelf & Real Audio Player)
   - 本地真实音频 HTML5 <audio> 播放控制（单例音频，切歌暂停旧曲目，无重叠）
   - 极细米白手账播放条、时间轴、实时拖拽跳转进度、唱片真实旋转同步
   - 抽屉式米色纸质歌词卡/故事卡弹窗（上一首/下一首/设为播放/关闭）
   - 异常安全处理与轻量气泡通知
   ========================================================================== */
function initVinylWall() {
	const musicSection = document.getElementById("music");
	if (!musicSection) return;

	// 示例曲目字典，可替换为你有权使用的音频
	const VINYL_SONGS = Object.fromEntries(["courage", "summer", "ocean", "room", "passion", "companion", "bigFish", "brightness", "forgetWorry", "threeMeals", "believeDream", "mistMoon", "devastation", "chasingStarlight", "moonVeil", "mirroredMoon"] .map((id, i) => [id, {id, title: "示例曲目 " + (i + 1), artist: "示例音乐", src: "../audio/demo.wav", discImg: "../img/demo.svg", coverImg: "../img/demo.svg", totalTimeStr: "00:04", memoryNote: "替换成你的音乐与故事。", lyric: "示例文字", memoryTags: ["示例"], story: "在此填写你的音乐故事。"}]));

	const songKeys = Object.keys(VINYL_SONGS);
	let currentSongId = "courage";
	let desiredPlaying = false;
	let playbackStatus = "paused";
	let playGeneration = 0;
	let connectionTimer = 0;
	let viewedModalSongId = "courage";

	// 音频播放器与浮动提示
	const audioPlayer = document.getElementById("real-audio-player");
	const audioToastTip = document.getElementById("audio-toast-tip");
	let toastTimer = null;
	if (audioPlayer) {
		audioPlayer.muted = false;
		audioPlayer.volume = 1;
	}

	// 正在播放横条元素引用
	const nowPlayingBar = document.getElementById("vinyl-now-playing-bar");
	const npDiscImg = document.getElementById("np-disc-img");
	const npSongTitle = document.getElementById("np-song-title");
	const npSongArtist = document.getElementById("np-song-artist");
	const npCurrentTime = document.getElementById("np-current-time");
	const npTotalTime = document.getElementById("np-total-time");
	const npProgressBar = document.getElementById("np-progress-bar");
	const npLyricQuote = document.getElementById("np-lyric-quote");
	const npPlayToggleBtn = document.getElementById("np-play-toggle-btn");
	const npPlayIcon = document.getElementById("np-play-icon");
	const npPlaybackStatus = document.getElementById("np-playback-status");
	const npOpenCardBtn = document.getElementById("np-open-card-btn");
	const npProgressTrack = document.getElementById("np-progress-track");

	// 弹窗元素引用
	const lyricModal = document.getElementById("lyric-card-modal");
	const lyricModalBackdrop = document.getElementById("lyric-modal-backdrop");
	const lyricCardClose = document.getElementById("lyric-card-close");
	const modalDiscImg = document.getElementById("modal-disc-img");
	const modalSongTitle = document.getElementById("modal-song-title");
	const modalSongArtist = document.getElementById("modal-song-artist");
	const modalQuoteText = document.getElementById("modal-quote-text");
	const modalMemoryTags = document.getElementById("modal-memory-tags");
	const modalStoryText = document.getElementById("modal-story-text");
	const modalPrevBtn = document.getElementById("modal-prev-btn");
	const modalNextBtn = document.getElementById("modal-next-btn");
	const modalPlayBtn = document.getElementById("modal-play-btn");

	// 提示消息气泡
	function showToast(msg) {
		if (!audioToastTip) return;
		audioToastTip.textContent = msg;
		audioToastTip.style.display = "block";
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = setTimeout(() => {
			audioToastTip.style.display = "none";
		}, 3200);
	}

	// 格式化秒数为 mm:ss
	function formatTime(sec) {
		if (isNaN(sec) || sec < 0) return "00:00";
		const m = Math.floor(sec / 60);
		const s = Math.floor(sec % 60);
		return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	}

	// 更新轻量播放栏与唱片卡片视觉状态
	function updateHUDState(isPlaying, status = isPlaying ? "playing" : "paused") {
		playbackStatus = status;
		const loading = status === "loading" || status === "buffering";
		// 正在播放横条状态
		if (nowPlayingBar) {
			nowPlayingBar.dataset.playback = status;
			nowPlayingBar.classList.toggle("is-loading", loading);
			nowPlayingBar.classList.toggle("is-error", status === "error");
			if (isPlaying) {
				nowPlayingBar.classList.remove("is-paused");
				if (npPlayIcon) npPlayIcon.textContent = "❚❚";
			} else {
				nowPlayingBar.classList.add("is-paused");
				if (npPlayIcon) npPlayIcon.textContent = loading ? "■" : status === "error" ? "↻" : "▶";
			}
		}
		if (npPlayToggleBtn) {
			npPlayToggleBtn.setAttribute("aria-busy", String(loading));
			npPlayToggleBtn.setAttribute("aria-pressed", String(isPlaying));
			npPlayToggleBtn.setAttribute("aria-label", loading ? "取消等待并暂停这首歌" : isPlaying ? "暂停这首歌" : status === "error" ? "重试播放这首歌" : "播放这首歌");
			npPlayToggleBtn.removeAttribute("title");
		}
		if (npPlaybackStatus) npPlaybackStatus.textContent = { playing: "正在播放", paused: "点击播放 / 继续听", loading: "正在准备 · 再点可取消", buffering: "正在缓冲 · 再点可暂停", error: "暂时未能播放，点击播放键重试" }[status];

		if (npLyricQuote) {
			npLyricQuote.classList.toggle("is-playing", isPlaying);
		}

		// 唱片卡片高亮与转动同步
		document.querySelectorAll(".vinyl-clean-card").forEach((card) => {
			const cId = card.getAttribute("data-song-id");
			if (cId === currentSongId) {
				card.classList.add("is-playing");
				if (isPlaying) {
					card.classList.remove("is-paused");
				} else {
					card.classList.add("is-paused");
				}
			} else {
				card.classList.remove("is-playing");
				card.classList.remove("is-paused");
			}
		});

		// 同步弹窗播放按钮文字
		if (modalPlayBtn) {
			if (viewedModalSongId === currentSongId && loading) {
				modalPlayBtn.textContent = "■ 取消等待";
			} else if (viewedModalSongId === currentSongId && isPlaying) {
				modalPlayBtn.textContent = "❚❚ 正在播放";
			} else if (viewedModalSongId === currentSongId && !isPlaying) {
				modalPlayBtn.textContent = "▶ 继续播放";
			} else {
				modalPlayBtn.textContent = "▶ 设为当前播放";
			}
		}

		// 同步双辑歌单的真实状态，避免不可播放文件显示成“正在播放”。
		document.querySelectorAll(".mixtape-track-item[data-song-id]").forEach((item) => {
			const songId = item.dataset.songId;
			const song = VINYL_SONGS[songId];
			const stateLabel = item.querySelector(".track-play-state");
			const isCurrentPlaying = Boolean(song?.src && songId === currentSongId && isPlaying);
			const isCurrentLoading = Boolean(song?.src && songId === currentSongId && loading);
			item.classList.toggle("is-playing-track", isCurrentPlaying);
			if (stateLabel) {
				stateLabel.textContent = song?.src
					? (isCurrentLoading ? "■ 准备中" : isCurrentPlaying ? "❚❚ 播放中" : "▶ 播放")
					: `${song?.format || "音频"} 需转换`;
			}
		});
	}
	function clearConnectionTimer() { clearTimeout(connectionTimer); connectionTimer = 0; }
	function watchConnection(generation) {
		clearConnectionTimer();
		connectionTimer = setTimeout(() => {
			if (generation === playGeneration && desiredPlaying && audioPlayer.readyState < 3) {
				failPlayback(null, generation);
				if (npPlaybackStatus) npPlaybackStatus.textContent = "连接较慢，点击播放键重试";
			}
		}, 12000);
	}
	function failPlayback(error, generation) {
		if (generation !== playGeneration || !desiredPlaying) return;
		desiredPlaying = false; ++playGeneration; clearConnectionTimer();
		audioPlayer.pause(); updateHUDState(false, "error");
		if (npPlaybackStatus && error?.name === "NotAllowedError") npPlaybackStatus.textContent = "请再点一次播放，开始听这首歌";
	}
	function playCurrent() {
		if (!audioPlayer) return false;
		if (audioPlayer.error) audioPlayer.load();
		const generation = ++playGeneration;
		desiredPlaying = true; clearConnectionTimer(); updateHUDState(false, "loading");
		watchConnection(generation);
		try {
			const request = audioPlayer.play();
			if (request?.then) request.then(() => {
				if (generation === playGeneration && desiredPlaying && !audioPlayer.paused && audioPlayer.readyState >= 3) { clearConnectionTimer(); updateHUDState(true); }
			}).catch(error => failPlayback(error, generation));
		} catch (error) { failPlayback(error, generation); }
		return true;
	}
	function pauseCurrent() {
		desiredPlaying = false; ++playGeneration; clearConnectionTimer();
		audioPlayer?.pause(); updateHUDState(false);
	}

	// 加载曲目并决定是否立即播放
	function loadSong(songId, autoPlay = false) {
		const song = VINYL_SONGS[songId];
		if (!song) return false;
		pauseCurrent();

		currentSongId = songId;

		// 更新顶部横条基本信息与封面
		if (npDiscImg) npDiscImg.src = song.discImg;
		if (npSongTitle) npSongTitle.textContent = song.title;
		if (npSongArtist) npSongArtist.textContent = song.artist;
		if (npLyricQuote) npLyricQuote.textContent = `“${song.memoryNote}”`;

		// 重设时间与进度条初始视觉
		if (npCurrentTime) npCurrentTime.textContent = "00:00";
		if (npProgressBar) npProgressBar.style.width = "0%";
		if (npTotalTime) npTotalTime.textContent = song.totalTimeStr || "--:--";

		if (!audioPlayer) return false;

		if (!song.src) {
			const formatNote = song.format
				? `${song.title} 是 ${song.format} 文件，浏览器暂不能直接播放。请转换为 MP3、WAV 或 OGG。`
				: `未找到${song.title}的本地音频文件`;
			showToast(formatNote);
			audioPlayer.pause();
			audioPlayer.removeAttribute("src");
			audioPlayer.load();
			updateHUDState(false);
			return false;
		}

		// 对音频文件相对路径进行 URI 转义（兼容空格、中文字符与特殊字符）
		const encodedSrc = encodeURI(song.src);
		const currentSrcAttr = audioPlayer.getAttribute("src");
		if (currentSrcAttr !== encodedSrc && currentSrcAttr !== song.src) {
			audioPlayer.src = encodedSrc;
			audioPlayer.load();
		}

		if (autoPlay) return playCurrent();
		updateHUDState(false);
		return true;
	}

	// 播放 / 暂停切换
	function togglePlay(targetSongId) {
		if (targetSongId && targetSongId !== currentSongId) {
			return loadSong(targetSongId, true);
		} else {
			if (!audioPlayer) return false;
			if (desiredPlaying || !audioPlayer.paused) {
				pauseCurrent();
			} else {
				if (!audioPlayer.src) {
					return loadSong(currentSongId, true);
				} else {
					return playCurrent();
				}
			}
		}
		return true;
	}

	// 真实音频事件监听
	if (audioPlayer) {
		audioPlayer.preload = "metadata";
		audioPlayer.addEventListener("timeupdate", function () {
			if (audioPlayer.duration && !isNaN(audioPlayer.duration) && audioPlayer.duration > 0) {
				const cur = audioPlayer.currentTime || 0;
				const dur = audioPlayer.duration;
				if (npCurrentTime) npCurrentTime.textContent = formatTime(cur);
				const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
				if (npProgressBar) npProgressBar.style.width = `${pct}%`;
				if (npLyricQuote) {
					npLyricQuote.style.setProperty("--playback-pct", `${pct}%`);
				}
			}
		});

		audioPlayer.addEventListener("loadedmetadata", function () {
			if (audioPlayer.duration && !isNaN(audioPlayer.duration)) {
				if (npTotalTime) npTotalTime.textContent = formatTime(audioPlayer.duration);
			}
		});

		audioPlayer.addEventListener("playing", function () {
			if (!desiredPlaying) { audioPlayer.pause(); return; }
			if (audioPlayer.paused || audioPlayer.readyState < 3) return;
			clearConnectionTimer(); updateHUDState(true);
		});
		audioPlayer.addEventListener("waiting", function () { if (desiredPlaying) { updateHUDState(false, "buffering"); watchConnection(playGeneration); } });

		audioPlayer.addEventListener("pause", function () {
			if (!audioPlayer.paused || playbackStatus === "error") return;
			desiredPlaying = false; ++playGeneration; clearConnectionTimer(); updateHUDState(false);
		});

		audioPlayer.addEventListener("ended", function () {
			// 曲目播放完毕后自动循环下一首
			const idx = songKeys.indexOf(currentSongId);
			const nextIdx = (idx + 1) % songKeys.length;
			loadSong(songKeys[nextIdx], true);
		});

		audioPlayer.addEventListener("error", function () {
			if (desiredPlaying) failPlayback(audioPlayer.error, playGeneration);
			else updateHUDState(false, "error");
		});
	}

	// 进度条点击跳转真实音频时间
	if (npProgressTrack) {
		npProgressTrack.addEventListener("click", function (e) {
			if (!audioPlayer || !audioPlayer.duration || isNaN(audioPlayer.duration)) return;
			const rect = npProgressTrack.getBoundingClientRect();
			const clickX = e.clientX - rect.left;
			const ratio = Math.max(0, Math.min(1, clickX / rect.width));
			audioPlayer.currentTime = ratio * audioPlayer.duration;
			if (audioPlayer.paused) {
				togglePlay();
			}
		});
	}

	// 顶部控制条播放按钮
	if (npPlayToggleBtn) {
		npPlayToggleBtn.addEventListener("click", function () {
			togglePlay();
		});
	}

	// 顶部手记按钮打开弹窗
	if (npOpenCardBtn) {
		npOpenCardBtn.addEventListener("click", function () {
			openLyricModal(currentSongId);
		});
	}

	// 唱片卡片列表点击：直接切换播放
	document.querySelectorAll(".vinyl-clean-card").forEach((card) => {
		const sId = card.getAttribute("data-song-id");
		card.addEventListener("click", function () {
			togglePlay(sId);
		});
	});

	// 打开手写歌词卡弹窗
	function openLyricModal(songId) {
		viewedModalSongId = songId || currentSongId;
		renderModalContent(viewedModalSongId);
		if (lyricModal) {
			lyricModal.classList.add("is-open");
			lyricModal.setAttribute("aria-hidden", "false");
			document.body.style.overflow = "hidden";
		}
	}

	// 渲染手账卡内容
	function renderModalContent(songId) {
		const song = VINYL_SONGS[songId];
		if (!song) return;

		if (modalDiscImg) modalDiscImg.src = song.discImg;
		if (modalSongTitle) modalSongTitle.textContent = song.title;
		if (modalSongArtist) modalSongArtist.textContent = song.artist;
		if (modalQuoteText) modalQuoteText.textContent = song.lyric;

		if (modalMemoryTags) {
			modalMemoryTags.innerHTML = song.memoryTags.map((tag) => `<span>${tag}</span>`).join("");
		}

		if (modalStoryText) modalStoryText.textContent = song.story;

		if (modalPlayBtn) {
			const isCurrentPlaying = (songId === currentSongId && audioPlayer && !audioPlayer.paused);
			if (songId === currentSongId && ["loading", "buffering"].includes(playbackStatus)) {
				modalPlayBtn.textContent = "■ 取消等待";
			} else if (isCurrentPlaying) {
				modalPlayBtn.textContent = "❚❚ 正在播放";
			} else if (songId === currentSongId) {
				modalPlayBtn.textContent = "▶ 继续播放";
			} else {
				modalPlayBtn.textContent = "▶ 设为当前播放";
			}
		}
	}

	// 关闭弹窗
	function closeLyricModal() {
		if (lyricModal) {
			lyricModal.classList.remove("is-open");
			lyricModal.setAttribute("aria-hidden", "true");
			document.body.style.overflow = "";
		}
	}

	if (lyricCardClose) lyricCardClose.addEventListener("click", closeLyricModal);
	if (lyricModalBackdrop) lyricModalBackdrop.addEventListener("click", closeLyricModal);

	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape" && lyricModal && lyricModal.classList.contains("is-open")) {
			closeLyricModal();
		}
	});

	if (modalPrevBtn) {
		modalPrevBtn.addEventListener("click", function () {
			const idx = songKeys.indexOf(viewedModalSongId);
			const prevIdx = (idx - 1 + songKeys.length) % songKeys.length;
			viewedModalSongId = songKeys[prevIdx];
			renderModalContent(viewedModalSongId);
		});
	}

	if (modalNextBtn) {
		modalNextBtn.addEventListener("click", function () {
			const idx = songKeys.indexOf(viewedModalSongId);
			const nextIdx = (idx + 1) % songKeys.length;
			viewedModalSongId = songKeys[nextIdx];
			renderModalContent(viewedModalSongId);
		});
	}

	if (modalPlayBtn) {
		modalPlayBtn.addEventListener("click", function () {
			if (viewedModalSongId === currentSongId) {
				togglePlay();
			} else {
				loadSong(viewedModalSongId, true);
			}
			renderModalContent(viewedModalSongId);
		});
	}

	// 初始装载第一首曲目（默认暂停状态，待用户交互后播放）
	loadSong(currentSongId, false);

	// 挂载公共接口，供卡带等外部模块联动控制播放
	window.VinylPlayer = {
		loadSong: loadSong,
		togglePlay: togglePlay,
		getCurrentSongId: () => currentSongId,
		getSong: (songId) => VINYL_SONGS[songId]
	};
}

/* ==========================================================================
   8. 翻页式私人阅读札记 (Reading Journal & Book Spines Shelf)
   ========================================================================== */
function initReadingJournal() {
	const readingSection = document.getElementById("reading");
	if (!readingSection) return;

	const journalBooks = [
		{
			id: "weicheng",
			title: "《围城》",
			author: "钱锺书 著",
			medium: "📖 实体书",
			readTime: "开学前后",
			readStatus: "已读",
			postReadStatus: "笑着破防",
			coordinate: "人间讽刺 / 围困",
			cover: "../img/demo.svg",
			handwrittenNote: "“城里的人想出去，城外的人想冲进来。”",
			stickerHtml: `
				<div class="artifact-ticket" title="出入城随心往返票根">
					<div class="ticket-head">TICKET · NO.1947</div>
					<div class="ticket-route">城内 ⇄ 城外</div>
					<div class="ticket-no">出入自由 · 自行破防</div>
				</div>
			`,
			quote: "在这里写下你自己的读书感想。",
			insight: "年少看方鸿渐觉得滑稽可笑，如今看却满是普通人无法逃脱的狼狈与犹疑。生活里的“围城”何止婚姻？那些未曾抵达的远方总是最好的，直到我们真正置身其中。",
			keywords: ["#人间讽刺", "#无形围困", "#清醒自省"],
			epilogue: "刻薄背后藏着对人性的极致体察。承认自己的平庸与局限，大概是与生活握手言和的第一步。",
			pageNo: "PAGE NO. 01 / 04"
		},
		{
			id: "eerguna",
			title: "《额尔古纳河右岸》",
			author: "迟子建 著",
			medium: "📖 实体书",
			readTime: "开学前",
			readStatus: "已读",
			postReadStatus: "后劲很大",
			coordinate: "土地记忆 / 消逝",
			cover: "../img/demo.svg",
			handwrittenNote: "“听见风穿过白桦林的声音。”",
			stickerHtml: `
				<div class="artifact-birch" title="白桦叶脉与河流足迹">
					<svg viewBox="0 0 48 40" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12 34 C14 26, 20 12, 34 6 C32 18, 22 26, 12 34 Z" stroke-width="1.2" fill="rgba(64, 92, 72, 0.08)" />
						<path d="M16 28 L24 20 M20 22 L28 16 M24 16 L31 12" stroke-width="0.9" />
						<path d="M6 37 Q18 33 28 37 T44 35" stroke-width="1" stroke-dasharray="2 2" opacity="0.6" />
						<circle cx="38" cy="18" r="1" fill="currentColor" opacity="0.4" />
						<circle cx="42" cy="15" r="0.9" fill="currentColor" opacity="0.4" />
					</svg>
					<span class="birch-caption">额尔古纳 · 白桦与雪</span>
				</div>
			`,
			quote: "在这里写下你自己的读书感想。",
			insight: "鄂温克人在大兴安岭林海中的百年流转，有一种沉静而浩瀚的生命力。风穿过白桦林的声音、驯鹿的喘息、萨满的歌谣，在钢筋水泥构筑的现代世界里，让人重新找回敬畏。",
			keywords: ["#土地记忆", "#生命消逝", "#自然敬畏"],
			epilogue: "生命如昼夜交替般坦然，死亡不是终结，只是回归了大地的怀抱。",
			pageNo: "PAGE NO. 02 / 04"
		},
		{
			id: "odyssey",
			title: "《奥德赛》",
			author: "荷马 著",
			medium: "📱 电子书",
			readTime: "阅读中",
			readStatus: "在读",
			postReadStatus: "在读中",
			coordinate: "远行归乡 / 命运",
			cover: "../img/demo.svg",
			handwrittenNote: "“漫长漂泊，只为确认归途的自己。”",
			stickerHtml: `
				<div class="artifact-odyssey" title="古希腊帆船与归航罗盘">
					<svg viewBox="0 0 48 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="33" cy="18" r="11" stroke-dasharray="2 2" stroke-width="0.9" opacity="0.4" />
						<path d="M33 7 L33 9 M33 27 L33 29 M22 18 L24 18 M42 18 L44 18" stroke-width="0.8" opacity="0.5" />
						<path d="M8 29 C12 31, 24 31, 28 29 L26 33 C18 34, 12 34, 10 33 Z" fill="rgba(54, 81, 107, 0.1)" />
						<path d="M18 29 L18 12 L25 21 L18 21" stroke-width="1.2" fill="rgba(54, 81, 107, 0.06)" />
						<path d="M5 34 Q10 32 16 34 T28 34 T40 33" stroke-width="0.9" stroke-dasharray="2 1.5" opacity="0.6" />
					</svg>
					<span class="odyssey-caption">ITHACA · 10 YRS</span>
				</div>
			`,
			quote: "在这里写下你自己的读书感想。",
			insight: "奥德修斯历经十载漂泊与海妖风暴，抗拒了永生诱惑，一心回到故土伊萨卡。每一个人的人生都是一场奥德赛，出发是为了求索世界，而归途是为了确认自己到底是谁。",
			keywords: ["#远行归乡", "#命运抗争", "#英雄意志"],
			epilogue: "所有的漂泊与风暴，最终都会化作写在自己命途上的年轮。",
			pageNo: "PAGE NO. 03 / 04"
		},
		{
			id: "santi",
			title: "《三体》",
			author: "刘慈欣 著",
			medium: "📱 电子书",
			readTime: "大一暑假",
			readStatus: "已读",
			postReadStatus: "夯爆了",
			coordinate: "宇宙文明 / 仰望",
			cover: "../img/demo.svg",
			handwrittenNote: "“宇宙很冷，但人类仍在仰望。”",
			stickerHtml: `
				<div class="artifact-santi" title="三体混沌星轨与宇宙坐标">
					<svg viewBox="0 0 50 40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
						<ellipse cx="25" cy="20" rx="19" ry="8" transform="rotate(-25 25 20)" stroke-dasharray="3 1.5" opacity="0.65" />
						<ellipse cx="25" cy="20" rx="19" ry="8" transform="rotate(35 25 20)" stroke-dasharray="2 2" opacity="0.5" />
						<ellipse cx="25" cy="20" rx="18" ry="7" transform="rotate(85 25 20)" stroke-dasharray="3 2" opacity="0.4" />
						<circle cx="16" cy="14" r="2.2" fill="currentColor" />
						<circle cx="34" cy="23" r="1.8" fill="currentColor" />
						<circle cx="26" cy="29" r="1.5" fill="currentColor" />
						<path d="M37 10 Q41 12 43 16" stroke-width="0.8" opacity="0.6" />
						<path d="M40 8 Q45 11 47 16" stroke-width="0.8" opacity="0.4" />
					</svg>
					<span class="santi-caption">1987A · 2200CE</span>
				</div>
			`,
			quote: "在这里写下你自己的读书感想。",
			insight: "它最震撼我的不是科幻设定，而是当文明被放进宇宙尺度后，人类的勇敢和恐惧都变得很小，又很亮。",
			keywords: ["#宇宙文明", "#仰望星空", "#冷峻理性"],
			epilogue: "合上书走出自习室，秋夜的风很凉，抬头看头顶浩瀚的星空，忽然觉得眼前的繁杂学业与烦恼都被稀释了。",
			pageNo: "PAGE NO. 04 / 04"
		}
	];

	let currentIndex = 0;
	let isFlipping = false;
	let pendingBookIndex = null;
	const reducedBookMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

	// DOM 节点绑定
	const pageRight = document.getElementById("pageRight");
	const bookCoverFrame = document.getElementById("bookCoverFrame");
	const journalCoverImg = document.getElementById("journalCoverImg");
	const journalHandwrittenNote = document.getElementById("journalHandwrittenNote");
	const journalReadMedium = document.getElementById("journalReadMedium");
	const journalReadTime = document.getElementById("journalReadTime");
	const journalReadStatus = document.getElementById("journalReadStatus");
	const journalPostReadStatus = document.getElementById("journalPostReadStatus");
	const journalCoordinateBadge = document.getElementById("journalCoordinateBadge");
	const journalBookSticker = document.getElementById("journalBookSticker");
	const spineCrease = document.querySelector(".notebook-spine-crease");
	const journalPageNo = document.getElementById("journalPageNo");
	const journalHeaderCoord = document.getElementById("journalHeaderCoord");
	const journalBookTitle = document.getElementById("journalBookTitle");
	const journalBookAuthor = document.getElementById("journalBookAuthor");
	const journalQuoteContent = document.getElementById("journalQuoteContent");
	const journalInsightContent = document.getElementById("journalInsightContent");
	const journalKeywordsList = document.getElementById("journalKeywordsList");
	const journalEpilogueContent = document.getElementById("journalEpilogueContent");
	const prevBookBtn = document.getElementById("prevBookBtn");
	const nextBookBtn = document.getElementById("nextBookBtn");
	const bookSpines = document.querySelectorAll(".book-spine");
	const shelfSlotDots = document.querySelectorAll(".shelf-slot-dot");
	const pageRightContent = document.getElementById("pageRightContent");

	function renderBook(index, direction) {
		const book = journalBooks[index];
		if (!book) return;

		// 底部书脊同步平滑升起 14px (立即触发，与翻页同步)
		bookSpines.forEach((spine, i) => {
			spine.classList.toggle("active", i === index);
		});

		// 书架横板刻度指示小绿点同步
		shelfSlotDots.forEach((dot, i) => {
			dot.classList.toggle("active", i === index);
		});

		if (reducedBookMotion.matches) {
			updateContent(book);
			isFlipping = false;
			return;
		}

		// 触发 800ms 纸张翻折动效与书脊折痕阴影联动
		if (direction && pageRight) {
			const animClass = direction === "next" ? "turning-page-forward" : "turning-page-backward";
			pageRight.classList.remove("turning-page-forward", "turning-page-backward");
			if (bookCoverFrame) bookCoverFrame.classList.remove("cover-fade-transition");
			if (spineCrease) spineCrease.classList.remove("flipping");

			// 强制触发重排
			void pageRight.offsetWidth;

			pageRight.classList.add(animClass);
			if (bookCoverFrame) bookCoverFrame.classList.add("cover-fade-transition");
			if (spineCrease) spineCrease.classList.add("flipping");

			// 翻页舒展落定阶段 (约 500ms 处) 切换文字内容并附带墨迹洇开动效（翻页后再出现下一本书的文字）
			setTimeout(() => {
				updateContent(book);
				if (pageRightContent) {
					pageRightContent.classList.remove("ink-bloom-in");
					void pageRightContent.offsetWidth;
					pageRightContent.classList.add("ink-bloom-in");
				}
			}, 500);

			// 800ms 动画平整落地后复位
			setTimeout(() => {
				pageRight.classList.remove("turning-page-forward", "turning-page-backward");
				if (bookCoverFrame) bookCoverFrame.classList.remove("cover-fade-transition");
				if (spineCrease) spineCrease.classList.remove("flipping");
				if (pageRightContent) pageRightContent.classList.remove("ink-bloom-in");
				isFlipping = false;
				if (pendingBookIndex !== null) {
					const next = pendingBookIndex;
					pendingBookIndex = null;
					goToBook(next);
				}
			}, 800);
		} else {
			updateContent(book);
			isFlipping = false;
		}
	}

	function updateContent(book) {
		if (journalCoverImg) {
			journalCoverImg.src = book.cover;
			journalCoverImg.alt = `${book.title} 封面`;
		}
		if (journalHandwrittenNote) journalHandwrittenNote.textContent = book.handwrittenNote;
		if (journalReadMedium) journalReadMedium.textContent = book.medium;
		if (journalReadTime) journalReadTime.textContent = book.readTime;
		if (journalReadStatus) journalReadStatus.textContent = book.readStatus;
		if (journalPostReadStatus) journalPostReadStatus.textContent = book.postReadStatus;
		if (journalCoordinateBadge) journalCoordinateBadge.textContent = book.coordinate;
		if (journalBookSticker) journalBookSticker.innerHTML = book.stickerHtml;

		if (journalPageNo) journalPageNo.textContent = book.pageNo;
		if (journalHeaderCoord) journalHeaderCoord.textContent = `【阅读坐标】 ${book.coordinate}`;
		if (journalBookTitle) journalBookTitle.textContent = book.title;
		if (journalBookAuthor) journalBookAuthor.textContent = book.author;
		if (journalQuoteContent) journalQuoteContent.textContent = book.quote;
		if (journalInsightContent) journalInsightContent.textContent = book.insight;
		if (journalEpilogueContent) journalEpilogueContent.textContent = book.epilogue;

		if (journalKeywordsList) {
			journalKeywordsList.innerHTML = book.keywords
				.map(kw => `<span class="keyword-tag">${kw}</span>`)
				.join("");
		}
	}

	function goToBook(index, direction) {
		if (isFlipping) {
			pendingBookIndex = index;
			return;
		}
		if (index === currentIndex) return;
		isFlipping = true;
		if (window.KeanSound) window.KeanSound.playBookTurn();
		const dir = direction || (index > currentIndex ? "next" : "prev");
		currentIndex = index;
		renderBook(currentIndex, dir);
	}

	// 绑定书脊抽拉点击事件
	bookSpines.forEach((spine, idx) => {
		spine.addEventListener("click", () => {
			goToBook(idx);
		});
	});

	// 绑定书架横杆小圆点点击
	shelfSlotDots.forEach((dot, idx) => {
		dot.addEventListener("click", () => {
			goToBook(idx);
		});
	});

	// 绑定左右翻页按钮
	if (prevBookBtn) {
		prevBookBtn.addEventListener("click", () => {
			const prevIndex = (currentIndex - 1 + journalBooks.length) % journalBooks.length;
			goToBook(prevIndex, "prev");
		});
	}

	if (nextBookBtn) {
		nextBookBtn.addEventListener("click", () => {
			const nextIndex = (currentIndex + 1) % journalBooks.length;
			goToBook(nextIndex, "next");
		});
	}

	// 初始化首屏书籍内容与书脊状态
	renderBook(0);
}

/* ==========================================================================
   兴趣营地 · 章节进入节奏与溅出聚合字体控制器 (Chapter Staged Reveal Controller)
   参考视频节奏：
   1. 拆分短标题文字为单个字符，预置柔和色影扩散基底
   2. 滚动进入视口时，文字笔画由轻微模糊渐变聚合成形，色影向外轻微扩散并收敛消退
   3. 建立 3 阶段入场：第 1 拍标题区聚合 -> 第 2 拍核心主画面显现 -> 第 3 拍卡片详细记录级联展开
   4. 单次触发，快速滚动即刻稳定为最高可读状态
   ========================================================================== */
function initCampChapterScrollReveal() {
	const sections = Array.from(document.querySelectorAll(".camp-section"));
	if (!sections.length) return;
	const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
	const states = sections.map((section) => {
		const heading = section.querySelector(".splash-heading");
		if (heading && !motionQuery.matches && window.innerWidth > 600) {
			const label = (heading.getAttribute("data-splash") || heading.textContent || "").trim();
			heading.setAttribute("aria-label", label);
			heading.textContent = "";
			Array.from(label).forEach((char, index) => {
				const span = document.createElement("span");
				span.className = "splash-char";
				span.setAttribute("aria-hidden", "true");
				span.style.setProperty("--char-delay", `${Math.round(index / Math.max(1, label.length - 1) * 120)}ms`);
				span.textContent = char;
				heading.appendChild(span);
			});
		}
		const state = {
			section,
			header: section.querySelector(".section-header-block"),
			visual: section.querySelector(".section-hero-visual"),
			details: section.querySelector(".section-content-body") || section.querySelector(".gallery-dock"),
			titleAt: 0,
			visualAt: 0,
			title: false,
			visualShown: false,
			detailsShown: false,
			visualQueued: false,
			detailsQueued: false,
			timers: []
		};
		section.classList.add("chapter-ready");
		return state;
	});

	function finish(state) {
		state.timers.forEach(clearTimeout);
		state.title = state.visualShown = state.detailsShown = true;
		state.section.classList.add("chapter-instant", "chapter-title-in", "chapter-visual-in", "chapter-details-in");
	}

	if (motionQuery.matches) {
		states.forEach(finish);
		return;
	}

	function enterTitle(state) {
		if (state.title) return;
		state.title = true;
		state.titleAt = performance.now();
		state.section.classList.add("chapter-title-in");
	}

	function enterVisual(state) {
		if (state.visualShown || state.visualQueued) return;
		enterTitle(state);
		state.visualQueued = true;
		state.visualAt = Math.max(performance.now(), state.titleAt + (window.innerWidth <= 600 ? 80 : 140));
		state.timers.push(setTimeout(() => {
			state.visualShown = true;
			state.section.classList.add("chapter-visual-in");
		}, Math.max(0, state.visualAt - performance.now())));
	}

	function enterDetails(state) {
		if (state.detailsShown || state.detailsQueued) return;
		enterVisual(state);
		state.detailsQueued = true;
		const at = Math.max(performance.now(), state.visualAt + (window.innerWidth <= 600 ? 70 : 110));
		state.timers.push(setTimeout(() => {
			state.detailsShown = true;
			state.section.classList.add("chapter-details-in");
		}, Math.max(0, at - performance.now())));
	}

	let scheduled = false;
	function inspect() {
		scheduled = false;
		const limit = window.innerHeight * 0.84;
		states.forEach((state) => {
			if (state.detailsShown) return;
			const sectionRect = state.section.getBoundingClientRect();
			if (sectionRect.bottom <= 0) { finish(state); return; }
			if (sectionRect.top >= window.innerHeight) return;
			const headerRect = state.header?.getBoundingClientRect();
			const visualRect = state.visual?.getBoundingClientRect();
			const detailsRect = state.details?.getBoundingClientRect();
			if ((headerRect && headerRect.bottom <= 0 && !state.title) ||
				(visualRect && visualRect.bottom <= 0 && !state.visualShown) ||
				(detailsRect && detailsRect.top <= 0 && !state.detailsShown)) {
				finish(state);
				return;
			}
			if (headerRect && headerRect.top < limit) enterTitle(state);
			if (visualRect && visualRect.top < limit) enterVisual(state);
			if (detailsRect && detailsRect.top < limit) enterDetails(state);
		});
	}
	function scheduleInspect() {
		if (!scheduled) {
			scheduled = true;
			requestAnimationFrame(inspect);
		}
	}
	window.addEventListener("scroll", scheduleInspect, { passive: true });
	window.addEventListener("resize", scheduleInspect);
	motionQuery.addEventListener("change", () => {
		if (motionQuery.matches) states.forEach(finish);
	});
	scheduleInspect();
}

/* ========================================================================== 
   特展二：《黑神话：悟空》天命长卷交互系统 (识破金鸣 · 陕北说书)
   ========================================================================== */
function initWukongShowcase() {
	const showcase = document.getElementById("wukongShowcase");
	if (!showcase) return;

	const deflectBtn = document.getElementById("wukongDeflectBtn");
	const slashFx = document.getElementById("wukongSlashFx");
	const storyBar = document.getElementById("wukongStoryBar");
	const storyPlayBtn = document.getElementById("storytellerPlayBtn");
	const storyAudio = document.getElementById("wukongStoryAudio");
	const storyStatusText = document.getElementById("storytellerStatusText");
	const revealTrack = document.getElementById("wukongRevealTrack");
	const storySheet = document.getElementById("wukongStorySheet");

	if (revealTrack && storySheet) {
		const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

		if (!prefersReducedMotion) {
			showcase.classList.add("has-scroll-experience");
			if ("IntersectionObserver" in window) {
				const revealObserver = new IntersectionObserver((entries) => {
					entries.forEach((entry) => {
						if (!entry.isIntersecting) return;
						entry.target.classList.add("is-in-view");
						revealObserver.unobserve(entry.target);
					});
				}, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });
				storySheet.querySelectorAll(".wukong-reveal-item").forEach((item) => revealObserver.observe(item));
			} else {
				storySheet.querySelectorAll(".wukong-reveal-item").forEach((item) => item.classList.add("is-in-view"));
			}

			let scrollFramePending = false;
			const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

			const updateScrollExperience = () => {
				scrollFramePending = false;
				const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
				const rect = revealTrack.getBoundingClientRect();
				const travel = Math.max(1, revealTrack.offsetHeight - viewportHeight);
				const distance = clamp(-rect.top, 0, travel);
				const coverProgress = clamp(distance / (travel * 0.45), 0, 1);
				const sheetOverlap = viewportHeight * (window.matchMedia("(max-width: 860px)").matches ? 0.8 : 0.75);
				const sheetStart = Math.max(0, travel - sheetOverlap);
				const sheetProgress = clamp((distance - sheetStart) / viewportHeight, 0, 1);
				const sceneProgress = clamp(distance / travel, 0, 1);

				showcase.style.setProperty("--wukong-cover-offset", `${(-102 * coverProgress).toFixed(2)}%`);
				showcase.style.setProperty("--wukong-title-opacity", coverProgress.toFixed(3));
				showcase.style.setProperty("--wukong-title-rise", `${(14 * (1 - coverProgress)).toFixed(1)}px`);
				showcase.style.setProperty("--wukong-parallax-y", `${(-18 * sceneProgress).toFixed(1)}px`);
				storySheet.classList.toggle("is-revealing", sheetProgress > 0.025);
			};

			const queueScrollUpdate = () => {
				if (scrollFramePending) return;
				scrollFramePending = true;
				window.requestAnimationFrame(updateScrollExperience);
			};

			window.addEventListener("scroll", queueScrollUpdate, { passive: true });
			window.addEventListener("resize", queueScrollUpdate, { passive: true });
			updateScrollExperience();
		}
	}

	// 1. 播放“见招拆招 · 识破”金铁鸣响音效 (Web Audio API)
	function playDeflectSound() {
		try {
			const AudioContext = window.AudioContext || window.webkitAudioContext;
			if (!AudioContext) return;
			const ctx = new AudioContext();
			const now = ctx.currentTime;

			// 高频清脆刀剑撞击 (Metal Clash)
			const oscHigh = ctx.createOscillator();
			const gainHigh = ctx.createGain();
			oscHigh.type = "triangle";
			oscHigh.frequency.setValueAtTime(2100, now);
			oscHigh.frequency.exponentialRampToValueAtTime(750, now + 0.12);

			gainHigh.gain.setValueAtTime(0.12, now);
			gainHigh.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
			oscHigh.connect(gainHigh);
			gainHigh.connect(ctx.destination);

			oscHigh.start(now);
			oscHigh.stop(now + 0.19);

			// 低频青铜古刹钟磬共鸣 (Bronze Bell / Resonant Hum)
			const oscLow = ctx.createOscillator();
			const gainLow = ctx.createGain();
			oscLow.type = "sine";
			oscLow.frequency.setValueAtTime(440, now + 0.02);
			oscLow.frequency.exponentialRampToValueAtTime(220, now + 0.65);

			gainLow.gain.setValueAtTime(0.09, now + 0.02);
			gainLow.gain.exponentialRampToValueAtTime(0.0005, now + 0.68);
			oscLow.connect(gainLow);
			gainLow.connect(ctx.destination);

			oscLow.start(now + 0.02);
			oscLow.stop(now + 0.7);
		} catch (e) {
			// 音频非阻断
		}
	}

	// 3. “查看游玩记录”锚点平滑滚动与金石音效
	const journalAnchor = document.getElementById("wukongJournalAnchor") || deflectBtn;
	if (journalAnchor) {
		journalAnchor.addEventListener("click", (e) => {
			e.preventDefault();
			playDeflectSound();
			if (storyBar) {
				storyBar.scrollIntoView({ behavior: "smooth", block: "center" });
			}
		});
	}

	// 4. 可交互章节导航（点击平滑滚动至对应章节，联动金石微鸣）
	const chapterNav = document.getElementById("wukongChapterNav");
	const chapterNavBtns = chapterNav ? chapterNav.querySelectorAll(".chapter-nav-btn") : [];
	chapterNavBtns.forEach((btn) => {
		btn.addEventListener("click", (e) => {
			e.preventDefault();
			const targetId = btn.getAttribute("data-target");
			if (!targetId) return;
			const targetEl = document.querySelector(targetId);
			if (targetEl) {
				playDeflectSound();
				targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
				chapterNavBtns.forEach((b) => b.classList.remove("is-active"));
				btn.classList.add("is-active");
			}
		});
	});

	// 5. 滚动监听与章节高亮联动 (Scroll-Spy)
	const chapterSections = [
		document.getElementById("wukongPartOrigin"),
		document.getElementById("wukongPartTrials"),
		document.getElementById("wukongPartDestiny")
	].filter(Boolean);

	if (chapterSections.length > 0 && "IntersectionObserver" in window) {
		const chapterObserver = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						const activeId = "#" + entry.target.id;
						chapterNavBtns.forEach((btn) => {
							if (btn.getAttribute("data-target") === activeId) {
								btn.classList.add("is-active");
							} else {
								btn.classList.remove("is-active");
							}
						});
					}
				});
			},
			{
				rootMargin: "-20% 0px -50% 0px",
				threshold: 0.1
			}
		);

		chapterSections.forEach((sec) => chapterObserver.observe(sec));
	}

	// 6. “这段旅程留下的三个词”记忆轴节点交互（点击查看真实说明）
	const timelineNodes = showcase.querySelectorAll(".timeline-node");
	const memoryPanels = showcase.querySelectorAll(".memory-detail-panel");

	timelineNodes.forEach((node) => {
		node.addEventListener("click", () => {
			const panelId = node.getAttribute("aria-controls");
			if (!panelId) return;

			playDeflectSound();

			// 更新节点选中状态
			timelineNodes.forEach((n) => {
				const isCurrent = n === node;
				n.classList.toggle("is-active", isCurrent);
				n.setAttribute("aria-selected", isCurrent ? "true" : "false");
			});

			// 切换对应说明面板
			memoryPanels.forEach((panel) => {
				if (panel.id === panelId) {
					panel.classList.add("is-active");
					panel.hidden = false;
				} else {
					panel.classList.remove("is-active");
					panel.hidden = true;
				}
			});
		});
	});

	// 7. “三弦说书 · 听风令”播放交互绑定
	if (storyPlayBtn && storyBar && storyAudio && storyAudio.getAttribute("src")) {
		function setPlayingState(playing) {
			if (playing) {
				storyBar.classList.add("is-active");
				storyPlayBtn.classList.add("is-playing");
				if (storyStatusText) storyStatusText.textContent = "🪕 说书悠扬 · 正在吟唱";
			} else {
				storyBar.classList.remove("is-active");
				storyPlayBtn.classList.remove("is-playing");
				if (storyStatusText) storyStatusText.textContent = "陕北说书 · 熊竹英";
			}
		}

		storyPlayBtn.addEventListener("click", () => {
			if (storyAudio && storyAudio.src) {
				if (storyAudio.paused) {
					// 暂停全局磁带音乐，避免声音重叠
					const globalAudio = document.getElementById("tapeAudio");
					if (globalAudio && !globalAudio.paused) globalAudio.pause();

					storyAudio.play().then(() => {
						setPlayingState(true);
					}).catch(() => {
						setPlayingState(false);
						if (storyStatusText) storyStatusText.textContent = "音频暂未加载，请稍后重试";
					});
				} else {
					storyAudio.pause();
					setPlayingState(false);
				}
			}
		});

		if (storyAudio) {
			storyAudio.addEventListener("ended", () => setPlayingState(false));
			storyAudio.addEventListener("pause", () => setPlayingState(false));
		}
	}
}

/* ========================================================================== 
   东方神话 · 筋斗云腾云直上交互系统 (Somersault Cloud Back-to-Top)
   ========================================================================== */

/**
 * 播放筋斗云破空腾飞音效 (Web Audio API 纯算法合成，零外部依赖)
 * 包含清脆通透的仙宫玉磬灵鸣 + 掠过云海的破空上行气流
 */
function playCloudAscendSound() {
	try {
		const AudioContext = window.AudioContext || window.webkitAudioContext;
		if (!AudioContext) return;
		const ctx = new AudioContext();
		if (ctx.state === "suspended") {
			ctx.resume();
		}
		const now = ctx.currentTime;

		// 1. 仙宫玉磬灵鸣 (Celestial Bell Chime)
		const oscChime = ctx.createOscillator();
		const gainChime = ctx.createGain();
		oscChime.type = "sine";
		oscChime.frequency.setValueAtTime(1174.66, now); // D6
		oscChime.frequency.exponentialRampToValueAtTime(880, now + 0.45); // A5

		gainChime.gain.setValueAtTime(0.12, now);
		gainChime.gain.exponentialRampToValueAtTime(0.0008, now + 0.65);

		oscChime.connect(gainChime);
		gainChime.connect(ctx.destination);
		oscChime.start(now);
		oscChime.stop(now + 0.68);

		// 2. 破空掠云气流轻啸 (Ascending Wind Whoosh)
		const oscWind = ctx.createOscillator();
		const gainWind = ctx.createGain();
		const filter = ctx.createBiquadFilter();

		oscWind.type = "triangle";
		oscWind.frequency.setValueAtTime(220, now + 0.04);
		oscWind.frequency.exponentialRampToValueAtTime(1320, now + 0.38);

		filter.type = "bandpass";
		filter.frequency.setValueAtTime(450, now);
		filter.frequency.exponentialRampToValueAtTime(1600, now + 0.38);
		filter.Q.setValueAtTime(2.2, now);

		gainWind.gain.setValueAtTime(0.001, now);
		gainWind.gain.linearRampToValueAtTime(0.08, now + 0.12);
		gainWind.gain.exponentialRampToValueAtTime(0.0005, now + 0.52);

		oscWind.connect(filter);
		filter.connect(gainWind);
		gainWind.connect(ctx.destination);

		oscWind.start(now + 0.04);
		oscWind.stop(now + 0.54);
	} catch (err) {
		// 音频非阻断
	}
}

/**
 * 初始化筋斗云返回顶部交互
 */
function initSomersaultCloud() {
	const btn = document.getElementById("somersaultCloudBtn");
	if (!btn) return;

	const progressBar = document.getElementById("cloudProgressBar");
	const percentText = document.getElementById("cloudPercentText");
	const circumference = 2 * Math.PI * 25; // ~157.08
	let isAscending = false;
	let scrollTicking = false;

	function updateScrollState() {
		const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
		const docHeight = document.documentElement.scrollHeight - window.innerHeight;
		const progressRatio = docHeight > 0 ? Math.min(Math.max(scrollTop / docHeight, 0), 1) : 0;

		// 智能显隐切换：距顶端超过 240px 浮现
		if (scrollTop > 240) {
			if (!isAscending) {
				btn.classList.add("is-visible");
			}
		} else {
			if (!isAscending) {
				btn.classList.remove("is-visible");
			}
		}

		// 动态充盈环形金光进度圈
		if (progressBar) {
			const offset = circumference * (1 - progressRatio);
			progressBar.style.strokeDashoffset = offset.toFixed(2);
		}

		// 悬浮印章提示中的当前百分比
		if (percentText) {
			percentText.textContent = Math.round(progressRatio * 100) + "%";
		}

		scrollTicking = false;
	}

	function onScroll() {
		if (!scrollTicking) {
			window.requestAnimationFrame(updateScrollState);
			scrollTicking = true;
		}
	}

	window.addEventListener("scroll", onScroll, { passive: true });
	window.addEventListener("resize", onScroll, { passive: true });
	updateScrollState();

	// 腾云直上触发逻辑
	function triggerAscent(e) {
		if (e) e.preventDefault();
		if (isAscending) return;

		isAscending = true;
		btn.classList.add("is-ascending");
		btn.classList.remove("is-visible");

		// 触发仙宫玉磬破云音韵
		playCloudAscendSound();

		// 平滑回滚至顶端
		const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		window.scrollTo({
			top: 0,
			behavior: prefersReducedMotion ? "auto" : "smooth"
		});

		// 飞行冲顶动效结束后（720ms）重置状态
		setTimeout(() => {
			btn.classList.remove("is-ascending");
			isAscending = false;
			updateScrollState();
		}, 720);
	}

	btn.addEventListener("click", triggerAscent);
	btn.addEventListener("keydown", (e) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			triggerAscent(e);
		}
	});
}
