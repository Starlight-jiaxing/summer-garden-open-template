(function () {
	"use strict";

	const API_ROOT = "/api/guestbook";
	const supabase = window.GUESTBOOK_SUPABASE || {};
	const SUPABASE_URL = String(supabase.url || "").replace(/\/$/, "");
	const SUPABASE_KEY = String(supabase.anonKey || "");
	const hasSupabase = /^https:\/\/[^\s]+$/.test(SUPABASE_URL) && SUPABASE_KEY.length > 20;
	const CACHE_KEY = "personal_guestbook_notes_v3_cache";
	const QUEUE_KEY = "personal_guestbook_notes_v3_queue";
	const REACTION_KEY = "personal_guestbook_reactions_v1";
	const LEGACY_KEY = "personal_guestbook_notes_v2";
	const MIGRATION_KEY = "personal_guestbook_v2_migrated_to_server";
	const SITE_MIGRATION_KEY = "personal_guestbook_v3_migrated_to_site_api_v1";
	const SITE_MIGRATION_BACKUP_KEY = "personal_guestbook_v3_before_site_api_v1";
	const COLORS = new Set(["yellow", "green", "pink", "blue"]);
	const DEFAULT_NOTE = {
		id: "welcome-note",
		author: "站主",
		color: "green",
		content: "欢迎来到我的留言页。可以聊聊你看到这里的感受，也可以分享最近喜欢的歌、书、游戏或生活片段。",
		time: "置顶",
		createdAt: 0,
		owner: true,
		reactionCount: 0,
		replies: []
	};

	const board = document.getElementById("sticky-board");
	const form = document.getElementById("sticky-form");
	if (!board || !form) return;

	const feedback = document.getElementById("form-feedback");
	const contentInput = document.getElementById("note-content");
	const charCount = document.getElementById("note-char-count");
	const refreshButton = document.getElementById("refresh-notes-btn");
	const submitButton = form.querySelector('button[type="submit"]');
	const syncStatus = document.getElementById("sync-status");
	const syncWrap = syncStatus?.closest(".storage-note");
	const wallNoteCount = document.getElementById("wall-note-count");
	const wallReplyCount = document.getElementById("wall-reply-count");
	const wallTallyStatus = document.getElementById("wall-tally-status");
	const filterButtons = Array.from(document.querySelectorAll(".filter-btn"));
	const openThreads = new Set();
	const replyDrafts = new Map();
	let activeFilter = "newest";
	let notes = readJSON(CACHE_KEY, [DEFAULT_NOTE]);
	let online = false;
	let syncPromise = null;
	let syncTimer = 0;
	let activeWrites = 0;
	notes = (Array.isArray(notes) ? notes : [DEFAULT_NOTE]).filter(Boolean).map(normalizeNote);

	function readJSON(key, fallback) {
		try {
			const value = JSON.parse(localStorage.getItem(key) || "null");
			return value ?? fallback;
		} catch (error) {
			return fallback;
		}
	}

	function writeJSON(key, value) {
		try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) {}
	}

	function publishedCounts() {
		const publishedNotes = notes.filter(note => !note.pending);
		return {
			notes: publishedNotes.length,
			replies: publishedNotes.reduce((total, note) => total + note.replies.filter(reply => !reply.pending).length, 0)
		};
	}

	function escapeHTML(value) {
		const node = document.createElement("div");
		node.textContent = String(value ?? "");
		return node.innerHTML;
	}

	function createId(prefix) {
		return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	function formatTime(date = new Date()) {
		return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
	}

	function normalizeNote(note, index = 0) {
		return {
			id: String(note.id || createId("note")),
			clientId: String(note.clientId || (note.pending ? note.id : "") || ""),
			author: String(note.author || "未署名访客"),
			color: COLORS.has(note.color) ? note.color : "yellow",
			content: String(note.content || ""),
			time: note.id === DEFAULT_NOTE.id ? "置顶" : String(note.time || "曾经留下"),
			createdAt: Number.isFinite(Number(note.createdAt)) ? Number(note.createdAt) : Date.now() - index,
			owner: Boolean(note.owner),
			pending: Boolean(note.pending),
			reactionCount: Math.max(0, Number(note.reactionCount) || 0),
			replies: Array.isArray(note.replies) ? note.replies.map(reply => ({
				id: String(reply.id || createId("reply")),
				clientId: String(reply.clientId || (reply.pending ? reply.id : "") || ""),
				author: String(reply.author || "未署名访客"),
				content: String(reply.content || ""),
				time: String(reply.time || "曾经回复"),
				owner: Boolean(reply.owner),
				pending: Boolean(reply.pending)
			})) : []
		};
	}

	function isPermanentError(error) {
		return error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status);
	}

	async function fetchJSON(url, options = {}) {
		const controller = new AbortController();
		const timer = window.setTimeout(() => controller.abort(), 12000);
		try {
			const response = await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
			const body = await response.json().catch(() => ({}));
			if (!response.ok) {
				const error = new Error(body?.message || body?.error || body?.hint || `请求失败（${response.status}）`);
				error.status = response.status;
				throw error;
			}
			return body;
		} finally {
			window.clearTimeout(timer);
		}
	}

	function setSyncState(state, text) {
		syncWrap?.classList.remove("is-online", "is-offline", "is-syncing");
		syncWrap?.classList.add(`is-${state}`);
		if (syncStatus) syncStatus.textContent = text;
		if (wallTallyStatus) {
			const counts = publishedCounts();
			const format = value => new Intl.NumberFormat("zh-CN").format(value);
			wallTallyStatus.textContent = state === "online"
				? `公共墙已有 ${format(counts.notes)} 张公开纸条、${format(counts.replies)} 封公开回信。`
				: state === "offline"
					? `离线显示 ${format(counts.notes)} 张已同步纸条、${format(counts.replies)} 封回信；新暂存内容暂不公开。`
					: "正在读取已公开的纸条和回信…";
		}
	}

	function supabaseHeaders(extra = {}) {
		return {
			apikey: SUPABASE_KEY,
			Authorization: `Bearer ${SUPABASE_KEY}`,
			"Content-Type": "application/json",
			...extra
		};
	}

	function mapSupabaseNote(row) {
		return normalizeNote({
			id: row.id,
			clientId: row.client_id,
			author: row.author,
			color: row.color,
			content: row.content,
			owner: row.owner,
			reactionCount: row.reaction_count,
			time: row.created_at ? formatTime(new Date(row.created_at)) : "曾经留下",
			createdAt: row.created_at ? Date.parse(row.created_at) : 0,
			replies: (row.guestbook_replies || []).map(reply => ({
				id: reply.id,
				clientId: reply.client_id,
				author: reply.author,
				content: reply.content,
				owner: reply.owner,
				time: reply.created_at ? formatTime(new Date(reply.created_at)) : "曾经回复",
				pending: false
			}))
		});
	}

	async function supabaseFetchNotes() {
		const query = "guestbook_notes?select=id,client_id,author,color,content,owner,reaction_count,created_at,guestbook_replies(id,client_id,author,content,owner,created_at)&order=created_at.desc";
		const body = await fetchJSON(`${SUPABASE_URL}/rest/v1/${query}`, { headers: supabaseHeaders() });
		if (!Array.isArray(body)) throw new Error("留言数据格式异常，请稍后刷新。");
		return { notes: Array.isArray(body) ? body.map(mapSupabaseNote) : [] };
	}

	async function supabaseRequest(path = "", options = {}) {
		if (!path) return supabaseFetchNotes();
		const body = options.body ? JSON.parse(options.body) : {};
		let endpoint = "";
		let payload = body;
		let headers = supabaseHeaders({ Prefer: "resolution=ignore-duplicates,return=minimal" });

		if (path === "/notes") {
			endpoint = "/rest/v1/guestbook_notes?on_conflict=client_id";
			payload = { id: createId("note"), client_id: body.clientId, author: body.author, content: body.content, color: body.color || "yellow", owner: false };
		} else if (path.endsWith("/replies")) {
			const noteId = decodeURIComponent(path.split("/")[2]);
			endpoint = "/rest/v1/guestbook_replies?on_conflict=client_id";
			payload = { id: createId("reply"), client_id: body.clientId, note_id: noteId, author: body.author, content: body.content, owner: false };
		} else if (path.endsWith("/react")) {
			const noteId = decodeURIComponent(path.split("/")[2]);
			endpoint = "/rest/v1/rpc/increment_guestbook_reaction";
			payload = { target_note_id: noteId };
		} else {
			return supabaseFetchNotes();
		}

		await fetchJSON(`${SUPABASE_URL}${endpoint}`, {
			method: "POST",
			headers,
			body: JSON.stringify(payload)
		});
		try {
			return await supabaseFetchNotes();
		} catch (error) {
			error.writeConfirmed = true;
			throw error;
		}
	}

	async function request(path = "", options = {}) {
		if (hasSupabase) return supabaseRequest(path, options);
		const data = await fetchJSON(`${API_ROOT}${path}`, {
			...options,
			headers: { "Content-Type": "application/json", ...(options.headers || {}) }
		});
		if (!Array.isArray(data?.notes)) throw new Error("留言数据格式异常，请稍后刷新。");
		return data;
	}

	function cacheAndRender(nextNotes) {
		const incoming = (Array.isArray(nextNotes) ? nextNotes : []).map(normalizeNote);
		const storedIds = new Set(incoming.flatMap(note => [note.clientId, ...note.replies.map(reply => reply.clientId)]).filter(Boolean));
		const remaining = readJSON(QUEUE_KEY, []).filter(item => !storedIds.has(item.body?.clientId));
		writeJSON(QUEUE_KEY, remaining);
		const pendingIds = new Set(remaining.map(item => item.body?.clientId).filter(Boolean));
		// A cloud refresh must not erase letters still waiting in this device's outbox.
		notes.forEach(local => {
			const stored = incoming.find(note => note.id === local.id || (local.clientId && note.clientId === local.clientId));
			if (stored) {
				local.replies.filter(reply => reply.pending && pendingIds.has(reply.clientId) && !storedIds.has(reply.clientId))
					.forEach(reply => stored.replies.push(reply));
				if (openThreads.has(local.id)) openThreads.add(stored.id);
			} else if (local.pending && pendingIds.has(local.clientId)) incoming.push(local);
		});
		if (!incoming.some(note => note.id === DEFAULT_NOTE.id)) incoming.unshift(normalizeNote(DEFAULT_NOTE));
		if (JSON.stringify(notes) !== JSON.stringify(incoming)) {
			notes = incoming;
			writeJSON(CACHE_KEY, notes);
			render();
		}
	}

	function queueOperation(operation) {
		const queue = readJSON(QUEUE_KEY, []);
		if (!queue.some(item => item.body?.clientId === operation.body.clientId)) queue.push(operation);
		writeJSON(QUEUE_KEY, queue);
	}

	async function flushQueue(serverNotes) {
		const queue = readJSON(QUEUE_KEY, []);
		let latest = serverNotes;
		let lastError = null;
		for (const item of queue) {
			const stored = item.body?.clientId && latest.some(note => note.clientId === item.body.clientId || note.replies?.some(reply => reply.clientId === item.body.clientId));
			try {
				if (!stored) latest = (await request(item.path, { method: "POST", body: JSON.stringify(item.body) })).notes;
				// Remove only this operation; another tab may have appended a new letter.
				writeJSON(QUEUE_KEY, readJSON(QUEUE_KEY, []).filter(entry => JSON.stringify(entry) !== JSON.stringify(item)));
			} catch (error) {
				lastError = error;
				if (!isPermanentError(error)) break;
			}
		}
		return { notes: latest, error: lastError };
	}

	async function migrateLegacyLocalNotes() {
		if (readJSON(MIGRATION_KEY, false)) return;
		const legacy = readJSON(LEGACY_KEY, []);
		if (!Array.isArray(legacy) || !legacy.some(note => note && note.id !== DEFAULT_NOTE.id)) {
			writeJSON(MIGRATION_KEY, true);
			return;
		}
		for (const legacyNote of legacy) {
			if (!legacyNote || legacyNote.id === DEFAULT_NOTE.id || !legacyNote.content) continue;
			const clientId = `legacy-${String(legacyNote.id).slice(0, 65)}`;
			let created;
			try {
				created = await request("/notes", {
					method: "POST",
					body: JSON.stringify({
						clientId,
						author: legacyNote.author || "未署名访客",
						content: legacyNote.content,
						color: legacyNote.color || "yellow"
					})
				});
			} catch (error) {
				if (error.status === 410) continue;
				throw error;
			}
			const serverNote = created.notes.find(item => item.clientId === clientId);
			if (!serverNote) continue;
			for (const legacyReply of Array.isArray(legacyNote.replies) ? legacyNote.replies : []) {
				if (!legacyReply?.content) continue;
				await request(`/notes/${encodeURIComponent(serverNote.id)}/replies`, {
					method: "POST",
					body: JSON.stringify({
						clientId: `legacy-${String(legacyReply.id || createId("reply")).slice(0, 65)}`,
						author: legacyReply.author || "未署名访客",
						content: legacyReply.content
					})
				});
			}
		}
		writeJSON(MIGRATION_KEY, true);
		return true;
	}

	async function migrateCachedNotes() {
		if (hasSupabase || readJSON(SITE_MIGRATION_KEY, false)) return false;
		let cached = readJSON(SITE_MIGRATION_BACKUP_KEY, null);
		if (!Array.isArray(cached)) {
			cached = notes.filter(note => note.id !== DEFAULT_NOTE.id && !note.pending && note.content);
			writeJSON(SITE_MIGRATION_BACKUP_KEY, cached);
		}
		for (const note of cached) {
			const clientId = String(note.clientId || `cached-${note.id}`).slice(0, 80);
			let created;
			try {
				created = await request("/notes", {
					method: "POST",
					body: JSON.stringify({ clientId, author: note.author, content: note.content, color: note.color })
				});
			} catch (error) {
				if (error.status === 410) continue;
				throw error;
			}
			const stored = created.notes.find(item => item.clientId === clientId);
			if (!stored) throw new Error("先前纸条尚未保存，请稍后重试。");
			if (stored.id !== note.id) {
				const oldReplyPath = `/notes/${encodeURIComponent(note.id)}/replies`;
				writeJSON(QUEUE_KEY, readJSON(QUEUE_KEY, []).map(item => item.path === oldReplyPath
					? { ...item, path: `/notes/${encodeURIComponent(stored.id)}/replies` }
					: item));
			}
			for (const reply of note.replies || []) {
				if (reply.pending || !reply.content) continue;
				await request(`/notes/${encodeURIComponent(stored.id)}/replies`, {
					method: "POST",
					body: JSON.stringify({
						clientId: String(reply.clientId || `cached-${reply.id}`).slice(0, 80),
						author: reply.author,
						content: reply.content
					})
				});
			}
		}
		writeJSON(SITE_MIGRATION_KEY, true);
		return cached.length > 0;
	}

	function scheduleSync() {
		window.clearTimeout(syncTimer);
		syncTimer = window.setTimeout(() => {
			if (!document.hidden && navigator.onLine !== false) syncNotes(false);
			else scheduleSync();
		}, online ? 30000 : 15000);
	}

	function syncNotes(showProgress = true) {
		if (syncPromise) return syncPromise;
		if (activeWrites) { scheduleSync(); return Promise.resolve(false); }
		if (showProgress) setSyncState("syncing", "正在同步来信…");
		syncPromise = (async () => {
			try {
				let data = await request();
				let migrationError = null;
				try {
					let migrated = await migrateCachedNotes();
					if (await migrateLegacyLocalNotes()) migrated = true;
					if (migrated) data = await request();
				} catch (error) { migrationError = error; }
				const result = await flushQueue(data.notes);
				cacheAndRender(result.notes);
				const error = result.error || migrationError;
				online = !error;
				setSyncState(error ? "offline" : "online", error
					? "部分纸条尚未发布，内容仍暂存在此设备"
					: "已连接公共留言墙，所有访客共享");
				return !error;
			} catch (error) {
				online = false;
				setSyncState("offline", isPermanentError(error)
					? "留言墙暂不可用，请稍后重试"
					: "暂未连接留言墙，新纸条仅暂存在此设备");
				return false;
			} finally {
				syncPromise = null;
				scheduleSync();
			}
		})();
		return syncPromise;
	}

	function render() {
		const focused = document.activeElement;
		const focusedNote = focused?.closest(".sticky-note")?.dataset.noteId;
		const focusedName = focused?.getAttribute("name");
		const caret = focusedName ? focused.selectionStart : null;
		const counts = publishedCounts();
		const formatCount = value => new Intl.NumberFormat("zh-CN").format(value);
		if (wallNoteCount) wallNoteCount.textContent = formatCount(counts.notes);
		if (wallReplyCount) wallReplyCount.textContent = formatCount(counts.replies);
		if (wallTallyStatus && syncWrap?.classList.contains("is-online")) {
			wallTallyStatus.textContent = `公共墙已有 ${formatCount(counts.notes)} 张公开纸条、${formatCount(counts.replies)} 封公开回信。`;
		}
		board.querySelectorAll(".reply-form").forEach(replyForm => {
			const id = replyForm.closest(".sticky-note").dataset.noteId;
			replyDrafts.set(id, {
				author: replyForm.elements["reply-author"].value,
				content: replyForm.elements["reply-content"].value,
				feedback: replyForm.querySelector(".reply-feedback").textContent,
				busy: replyForm.querySelector('button[type="submit"]').disabled
			});
		});
		let visible = notes.slice();
		if (activeFilter === "replied") visible = visible.filter(note => note.replies.length > 0);
		visible.sort((a, b) => {
			if (a.owner !== b.owner) return a.owner ? -1 : 1;
			return activeFilter === "oldest" ? a.createdAt - b.createdAt : b.createdAt - a.createdAt;
		});

		board.innerHTML = "";
		if (!visible.length) {
			board.innerHTML = '<div class="board-empty"><strong>这里暂时没有符合条件的纸条。</strong><span>换个筛选看看，或者写下第一张。</span></div>';
			return;
		}

		const reacted = new Set(readJSON(REACTION_KEY, []));
		visible.forEach((note, index) => {
			const isOpen = openThreads.has(note.id);
			const threadId = `guestbook-replies-${index + 1}`;
			const publishedReplyCount = note.replies.filter(reply => !reply.pending).length;
			const hasReacted = reacted.has(note.id);
			const reactionLabel = hasReacted ? "已经对这张纸条共鸣" : `共鸣这张纸条${note.reactionCount ? `，已有 ${note.reactionCount} 人共鸣` : ""}`;
			const article = document.createElement("article");
			article.className = `sticky-note ${note.color}${isOpen ? " thread-open" : ""}`;
			article.style.setProperty("--note-rotate", `${[-1.1, .7, -.45, .9][index % 4]}deg`);
			article.dataset.noteId = note.id;
			const replies = note.replies.map(reply => `
				<div class="reply-slip">
					<div class="reply-head"><strong>${escapeHTML(reply.author)}</strong>${reply.owner ? '<span class="owner-seal">站主回信</span>' : ""}${reply.pending ? '<span class="pending-seal">待同步</span>' : ""}<time>${escapeHTML(reply.time)}</time></div>
					<p>${escapeHTML(reply.content)}</p>
				</div>`).join("");
			const createdDate = new Date(note.createdAt);
			const noteTime = note.owner
				? `<span>${escapeHTML(note.time)}</span>`
				: Number.isFinite(note.createdAt) && note.createdAt > 0 && Number.isFinite(createdDate.getTime())
					? `<time datetime="${createdDate.toISOString()}">${escapeHTML(note.time)}</time>`
					: `<time>${escapeHTML(note.time)}</time>`;

			article.innerHTML = `
				<div class="note-paper">
					<div class="note-author"><span>${escapeHTML(note.author)}</span>${note.owner ? '<span class="owner-seal">站主置顶</span>' : ""}${note.pending ? '<span class="pending-seal">待同步</span>' : ""}</div>
					<p class="note-content">${escapeHTML(note.content)}</p>
					<div class="note-meta">${noteTime}<div class="note-tools"><button type="button" class="stamp-btn" data-action="react" aria-label="${reactionLabel}" aria-pressed="${hasReacted}" ${hasReacted ? "disabled" : ""}>共鸣${note.reactionCount ? ` ${note.reactionCount}` : ""}</button><button type="button" class="reply-toggle" data-action="toggle" aria-expanded="${isOpen}" aria-controls="${threadId}" aria-label="${isOpen ? "收起" : "展开"}${escapeHTML(note.author)}的回信，${publishedReplyCount}封已公开">${isOpen ? "收起" : "回信"}${publishedReplyCount ? ` ${publishedReplyCount}` : ""}</button></div></div>
				</div>
				<div class="reply-thread" id="${threadId}" role="region" aria-label="${escapeHTML(note.author)}的回信往来" ${isOpen ? "" : "hidden"}>
					<div class="reply-thread-bar"><p class="reply-thread-heading"><strong>回信往来</strong><span>${publishedReplyCount} 封已公开</span></p><button type="button" class="reply-close" data-action="close-thread" aria-label="收起${escapeHTML(note.author)}的回信">收起回信</button></div>
					<div class="reply-stack">${replies || '<p class="reply-empty">还没有回信，你可以接着这张纸条说两句。</p>'}</div>
					<p class="reply-form-help">回信会公开展示给所有访客，请不要留下私人联系方式。</p>
					<form class="reply-form">
						<label><span>你的昵称</span><input name="reply-author" maxlength="24" autocomplete="nickname" required></label>
						<label class="reply-message"><span>写一封回信</span><textarea name="reply-content" maxlength="180" rows="2" required></textarea></label>
						<p class="reply-feedback" role="status" aria-live="polite"></p>
						<button type="submit">夹入回信</button>
					</form>
				</div>`;
			board.appendChild(article);
			const draft = replyDrafts.get(note.id);
			if (draft) {
				const replyForm = article.querySelector(".reply-form");
				replyForm.elements["reply-author"].value = draft.author;
				replyForm.elements["reply-content"].value = draft.content;
				replyForm.querySelector(".reply-feedback").textContent = draft.feedback;
				replyForm.querySelector('button[type="submit"]').disabled = draft.busy;
			}
		});
		if (focusedNote && focusedName) {
			const input = board.querySelector(`[data-note-id="${CSS.escape(focusedNote)}"] [name="${CSS.escape(focusedName)}"]`);
			input?.focus({ preventScroll: true });
			if (input && caret !== null) input.setSelectionRange(caret, caret);
		}
	}

	async function postOperation(path, body, optimisticUpdate) {
		activeWrites += 1;
		try {
			if (syncPromise) await syncPromise;
			const data = await request(path, { method: "POST", body: JSON.stringify(body) });
			online = true;
			cacheAndRender(data.notes);
			setSyncState("online", "已连接公共留言墙，所有访客共享");
			return { synced: true };
		} catch (error) {
			if (hasSupabase && body.clientId) {
				try {
					const data = await supabaseFetchNotes();
					const alreadyStored = data.notes.some(note => note.clientId === body.clientId || note.replies.some(reply => reply.clientId === body.clientId));
					if (alreadyStored) {
						online = true;
						cacheAndRender(data.notes);
						setSyncState("online", "留言已在云端，其他访客可以看到");
						return { synced: true };
					}
				} catch (verifyError) {}
			}
			if (error.writeConfirmed && !body.clientId) {
				optimisticUpdate();
				writeJSON(CACHE_KEY, notes);
				render();
				setSyncState("online", "共鸣已送达，留言墙稍后刷新");
				return { synced: true };
			}
			if (isPermanentError(error) || !body.clientId) {
				online = false;
				setSyncState("offline", "未发布成功，请检查内容后重试");
				return { synced: false, rejected: true, error };
			}
			online = false;
			optimisticUpdate();
			queueOperation({ path, body });
			writeJSON(CACHE_KEY, notes);
			render();
			setSyncState("offline", "尚未发布：仅保存在此设备，恢复连接后自动重试");
			return { synced: false, error };
		} finally {
			activeWrites -= 1;
			scheduleSync();
		}
	}

	form.addEventListener("submit", async event => {
		event.preventDefault();
		const authorInput = document.getElementById("note-author");
		const author = authorInput.value.trim();
		const content = contentInput.value.trim();
		const color = form.querySelector('input[name="note-color"]:checked')?.value || "yellow";
		if (!author || !content) {
			feedback.textContent = "请写下昵称和留言内容。";
			(!author ? authorInput : contentInput).focus();
			return;
		}

		const localId = createId("pending-note");
		const body = { author, content, color, clientId: localId };
		submitButton.disabled = true;
		submitButton.textContent = "正在投递…";
		feedback.textContent = "正在把纸条送到留言墙。";
		const result = await postOperation("/notes", body, () => {
			notes.unshift(normalizeNote({ ...body, id: localId, time: formatTime(), createdAt: Date.now(), pending: true, replies: [] }));
		});
		if (result.rejected) {
			feedback.textContent = result.error.message;
			submitButton.disabled = false;
			submitButton.textContent = "贴到墙上";
			return;
		}
		activeFilter = "newest";
		filterButtons.forEach(item => {
			const active = item.dataset.filter === activeFilter;
			item.classList.toggle("is-active", active);
			item.setAttribute("aria-pressed", String(active));
		});
		render();
		form.reset();
		contentInput.value = "";
		charCount.textContent = "0 / 280";
		feedback.textContent = result.synced ? "纸条已经贴到墙上，其他访客现在也能看到。" : "纸条仅暂存于此设备，其他访客暂时看不到；恢复连接后会自动重试。";
		submitButton.disabled = false;
		submitButton.textContent = "贴到墙上";
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
		render();
	}));

	board.addEventListener("click", async event => {
		const button = event.target.closest("button[data-action]");
		if (!button) return;
		const article = button.closest(".sticky-note");
		const noteId = article?.dataset.noteId;
		if (!noteId) return;

		if (button.dataset.action === "toggle" || button.dataset.action === "close-thread") {
			if (button.dataset.action === "close-thread" || openThreads.has(noteId)) openThreads.delete(noteId);
			else openThreads.add(noteId);
			render();
			if (openThreads.has(noteId)) board.querySelector(`[data-note-id="${CSS.escape(noteId)}"] textarea`)?.focus();
			else board.querySelector(`[data-note-id="${CSS.escape(noteId)}"] .reply-toggle`)?.focus();
			return;
		}

		if (button.dataset.action === "react") {
			const reacted = readJSON(REACTION_KEY, []);
			if (reacted.includes(noteId) || noteId.startsWith("pending-")) return;
			button.disabled = true;
			const result = await postOperation(`/notes/${encodeURIComponent(noteId)}/react`, {}, () => {
				const note = notes.find(item => item.id === noteId);
				if (note) note.reactionCount += 1;
			});
			if (result.synced) {
				writeJSON(REACTION_KEY, [...reacted, noteId]);
				render();
			} else button.disabled = false;
		}
	});

	board.addEventListener("submit", async event => {
		const replyForm = event.target.closest(".reply-form");
		if (!replyForm) return;
		event.preventDefault();
		const noteId = replyForm.closest(".sticky-note")?.dataset.noteId;
		const author = replyForm.elements["reply-author"].value.trim();
		const content = replyForm.elements["reply-content"].value.trim();
		const replyFeedback = replyForm.querySelector(".reply-feedback");
		const button = replyForm.querySelector('button[type="submit"]');
		if (!noteId || !author || !content) {
			replyFeedback.textContent = "请写下昵称和回信内容。";
			(!author ? replyForm.elements["reply-author"] : replyForm.elements["reply-content"]).focus();
			return;
		}
		if (noteId.startsWith("pending-")) {
			replyFeedback.textContent = "这张纸条还在等待同步，请稍后再回信。";
			return;
		}

		button.disabled = true;
		button.textContent = "正在夹入…";
		replyFeedback.textContent = "正在投递回信。";
		const body = { author, content, clientId: createId("pending-reply") };
		const result = await postOperation(`/notes/${encodeURIComponent(noteId)}/replies`, body, () => {
			const note = notes.find(item => item.id === noteId);
			if (note) note.replies.push({ id: createId("pending-reply"), ...body, time: formatTime(), owner: false, pending: true });
		});
		if (result.rejected) {
			const currentForm = board.querySelector(`[data-note-id="${CSS.escape(noteId)}"] .reply-form`) || replyForm;
			currentForm.querySelector(".reply-feedback").textContent = result.error.message;
			const currentButton = currentForm.querySelector('button[type="submit"]');
			currentButton.disabled = false;
			currentButton.textContent = "夹入回信";
			return;
		}
		const currentForm = board.querySelector(`[data-note-id="${CSS.escape(noteId)}"] .reply-form`);
		currentForm?.reset();
		if (currentForm) currentForm.querySelector('button[type="submit"]').disabled = false;
		replyDrafts.delete(noteId);
		openThreads.add(noteId);
		render();
		const current = board.querySelector(`[data-note-id="${CSS.escape(noteId)}"]`);
		const currentFeedback = current?.querySelector(".reply-feedback");
		if (currentFeedback) currentFeedback.textContent = result.synced ? "回信已经夹好，其他访客也能看到。" : "回信仅暂存于此设备，其他访客暂时看不到；恢复连接后会自动重试。";
	});

	refreshButton?.addEventListener("click", async () => {
		refreshButton.disabled = true;
		await syncNotes();
		refreshButton.disabled = false;
	});

	render();
	syncNotes();
	window.addEventListener("online", () => syncNotes());
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") syncNotes(false);
	});
})();
