/**
 * 私域与社群双卡片弹窗交互逻辑
 * 支持：全站任意入口呼出、ESC退出、遮罩点击关闭、一键复制微信号、二维码下载保存、音效联动
 */
(function () {
	function initContactModal() {
		const modal = document.getElementById("contact-community-modal");
		if (!modal) return;

		const closeBtn = document.getElementById("contactModalCloseBtn");
		const copyBtn = document.getElementById("btnCopyWxid");
		const copyGroupBtn = document.getElementById("btnCopyGroupNumber");
		const tutorWxid = "html2007jx";
		const groupNumber = "1032176498";
		let toastElem = document.getElementById("contactToastBubble");

		if (!toastElem) {
			toastElem = document.createElement("div");
			toastElem.id = "contactToastBubble";
			toastElem.className = "contact-toast-bubble";
			toastElem.setAttribute("role", "status");
			document.body.appendChild(toastElem);
		}

		let toastTimer = null;
		function showToast(text) {
			toastElem.textContent = text;
			toastElem.classList.add("is-visible");
			if (toastTimer) clearTimeout(toastTimer);
			toastTimer = setTimeout(() => {
				toastElem.classList.remove("is-visible");
			}, 2800);
		}

		function openModal() {
			modal.classList.add("is-open");
			modal.setAttribute("aria-hidden", "false");
			document.body.style.overflow = "hidden";
			if (typeof window.playUiSound === "function") {
				try { window.playUiSound("pop"); } catch (e) {}
			}
		}

		function closeModal() {
			modal.classList.remove("is-open");
			modal.setAttribute("aria-hidden", "true");
			document.body.style.overflow = "";
		}

		// 点击关闭按钮或点击暗色磨砂遮罩背景关闭
		if (closeBtn) closeBtn.addEventListener("click", closeModal);
		modal.addEventListener("click", function (e) {
			// 点击磨砂半透明背景层自身时关闭
			if (e.target === modal || e.target.id === "contactModalBackdrop") {
				closeModal();
			}
		});

		document.addEventListener("keydown", function (e) {
			if (e.key === "Escape" && modal.classList.contains("is-open")) {
				closeModal();
			}
		});

		// 复制微信号逻辑
		if (copyBtn) {
			copyBtn.addEventListener("click", function (e) {
				e.preventDefault();
				e.stopPropagation();
				const originalHtml = copyBtn.innerHTML;

				function onSuccess() {
					copyBtn.innerHTML = '<span class="btn-icon">✓</span><span class="btn-text">已复制微信号</span>';
					showToast("✓ 已复制学长微信号！添加请备注【年级+科目】，感谢配合");
					setTimeout(() => {
						copyBtn.innerHTML = originalHtml;
					}, 2600);
				}

				if (navigator.clipboard && navigator.clipboard.writeText) {
					navigator.clipboard.writeText(tutorWxid).then(onSuccess).catch(() => {
						fallbackCopy();
					});
				} else {
					fallbackCopy();
				}

				function fallbackCopy() {
					const tempInput = document.createElement("input");
					tempInput.value = tutorWxid;
					document.body.appendChild(tempInput);
					tempInput.select();
					try {
						document.execCommand("copy");
						onSuccess();
					} catch (err) {
						showToast("微信号：" + tutorWxid + "（请长按复制）");
					}
					document.body.removeChild(tempInput);
				}
			});
		}

		// 复制互帮互助群号
		if (copyGroupBtn) {
			copyGroupBtn.addEventListener("click", function (e) {
				e.preventDefault();
				e.stopPropagation();
				const originalHtml = copyGroupBtn.innerHTML;

				function onSuccess() {
					copyGroupBtn.innerHTML = '<span class="btn-icon">✓</span><span class="btn-text">已复制群号</span>';
					showToast("✓ 已复制群号：" + groupNumber);
					setTimeout(() => {
						copyGroupBtn.innerHTML = originalHtml;
					}, 2600);
				}

				function fallbackCopy() {
					const tempInput = document.createElement("input");
					tempInput.value = groupNumber;
					document.body.appendChild(tempInput);
					tempInput.select();
					try {
						document.execCommand("copy");
						onSuccess();
					} catch (err) {
						showToast("群号：" + groupNumber + "（请长按复制）");
					}
					document.body.removeChild(tempInput);
				}

				if (navigator.clipboard && navigator.clipboard.writeText) {
					navigator.clipboard.writeText(groupNumber).then(onSuccess).catch(fallbackCopy);
				} else {
					fallbackCopy();
				}
			});
		}

		// 绑定全站所有带有 data-open-contact-modal 属性或特定选择器的按钮
		document.querySelectorAll("[data-open-contact-modal], #capsuleNavContact, #footerOpenContact, .btn-open-community-modal").forEach((btn) => {
			btn.addEventListener("click", function (e) {
				e.preventDefault();
				openModal();
			});
		});

		// 挂载到全局 window 对象供外部随时调用
		window.openContactModal = openModal;
		window.closeContactModal = closeModal;
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", initContactModal);
	} else {
		initContactModal();
	}
})();
