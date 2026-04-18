/* ************************************************************************** */
/*                                                                            */
/*                                                        ::::::::            */
/*   improv.js                                          :+:    :+:            */
/*                                                     +:+                    */
/*   By: fbes <fbes@student.codam.nl>                 +#+                     */
/*                                                   +#+                      */
/*   Created: 2021/11/13 00:37:55 by fbes          #+#    #+#                 */
/*   Updated: 2025/07/18 22:37:13 by fbes          ########   odam.nl         */
/*                                                                            */
/* ************************************************************************** */

const pageUrl = getRawPageURL();

/**
 * A list of regexp based improvements. The `guard` results are piped into
 * the improvement handler. These guards, as implied, make sure code is only
 * executed once the `guard` is set and returns a value which evaluates to
 * "true".
 *
 * @type {[{handler(...any), guard?(): any}]}
 */
const improvementsPerUrl = [
	{ handler: setGeneralImprovements },
	{
		guard: () => window.location.hash === '#haha',
		handler: setEasterEgg,
	},
	{
		guard: () => new RegExp(
			"^projects\\.intra\\.42\\.fr\\/("
				+ "projects\\/(?<slug>[a-zA-Z0-9-_]+)\\/projects_users\\/(?<project_id>\\d+)?"
				+ "|[0-9]+\\/(?<login>[a-z0-9-_]+)"
				+ "|(?<slugmine>[a-zA-Z0-9-_]+)/mine"
			+ ")\\/?$").exec(pageUrl),
		handler: setPageProjectsUsersImprovements,
	},
	{
		guard: () => /^projects\.intra\.42\.fr\/users\/(?<login>[a-z0-9-_]+)\/feedbacks\/?$/.exec(pageUrl),
		handler: setPageUserFeedbacksImprovements,
	},
	{
		guard: () => /^profile\.intra\.42\.fr\/events\/(?<event_id>[0-9]+)\/feedbacks\/?$/.exec(pageUrl),
		handler: setPageProjectsUsersImprovements,
	},
	{
		guard: () => /^profile\.intra\.42\.fr\/users\/(?<login>[a-z0-9-_]+)\/?$/.exec(pageUrl),
		handler: setPageUserImprovements,
	},
	{
		guard: () => /^projects\.intra\.42\.fr\/projects\/graph\/?$/.exec(pageUrl),
		handler: setPageHolyGraphImprovements,
	},
	{
		guard: () => /^companies\.intra\.42\.fr\/(?<lang>[a-z]+)\/administrations\/(?<administration_id>[0-9]+)\/?$/.exec(pageUrl),
		handler: setInternshipAdministrationImprovements,
	},
	{
		guard: () => /^profile\.intra\.42\.fr\/slots\/?$/.exec(pageUrl),
		handler: setPageSlotsImprovements,
	},
	{
		guard: () => /^profile\.intra\.42\.fr\/?(users\/(?<login>[a-z0-9-_]+)|home\/?)?$/.exec(pageUrl),
		handler: setPageEvaluationsImprovements,
	},
	{
		guard: () => /^profile\.intra\.42\.fr\/v3_early_access\/?$/.exec(pageUrl),
		handler: setEarlyAccessImprovements,
	},
	{ handler: setOptionalImprovements },
];

// Execute our improvements per page. If we have a validator, we execute that and pipe the results into our
// improvement handler.
improvementsPerUrl.forEach(improvement => {
	if (improvement.guard) {
		const pipe = improvement.guard();
		if (pipe) improvement.handler(pipe);
	} else {
		improvement.handler();
	}
});

// communication between background.js and this script
let improvPort = chrome.runtime.connect({ name: portName });
improvPort.onDisconnect.addListener(function() {
	iConsole.log("Disconnected from service worker");
});
improvPort.onMessage.addListener(function(msg) {
	switch (msg["action"]) {
		case "pong":
			iConsole.log("pong");
			break;
		case "resynced":
		case "prefers-color-scheme-change":
		case "options-changed":
			iConsole.log("Settings changed. Enabling settings that can be enabled. Settings that must be disabled, will disable after a refresh.");
			checkThemeSetting();
			setOptionalImprovements();
			if (typeof setCustomProfile != "undefined") {
				setCustomProfile();
			}
			break;
		case "error":
			iConsole.error(msg["message"]);
			break;
	}
});

// reconnect every 4-5 minutes to keep service worker running in background
setInterval(function() {
	improvPort.disconnect();
	improvPort = chrome.runtime.connect({ name: portName });
}, 250000);


// widgets are draggable and customizable
const WIDGET_STORAGE_KEY = "improved-intra-widget-layout";
const WIDGET_ORDER_KEY = "improved-intra-widget-order";
const EDIT_MODE_KEY = "iil-layout-edit-mode";

const WIDGET_LABELS = ["Agenda", "Evaluations", "Logtime", "Expertises", "Projects", "Skills", "Last achievements"];

const INTRA_WIDGETS = [
    '[data-iil-widget="agenda"]',
    '[data-iil-widget="evaluations"]',
    '[data-iil-widget="logtime"]',
    '[data-iil-widget="expertises"]',
    '[data-iil-widget="projects"]',
    '[data-iil-widget="skills"]',
    '[data-iil-widget="last-achievements"]',
];

let editMode = false;
localStorage.setItem(EDIT_MODE_KEY, "0");
let dragged = null;
let lastSwapTarget = null;

function labelWidgets() {
    document.querySelectorAll('.container-fullsize > .row > .col-lg-4').forEach((col) => {
        const inner = col.firstElementChild;
        if (!inner) return;
        const heading = inner.querySelector('h2, h3, h4, .title')?.textContent?.trim()
            || inner.firstElementChild?.textContent?.trim().split('\n')[0].trim();
        const match = WIDGET_LABELS.find(label => heading?.startsWith(label));
        if (match) {
            col.setAttribute('data-iil-widget', match.toLowerCase().replace(' ', '-'));
        }
    });
}

function getSavedWidgets() {
    try {
        return JSON.parse(localStorage.getItem(WIDGET_STORAGE_KEY) || "[]");
    } catch (e) {
        return [];
    }
}

function saveHiddenWidgets(hiddenWidgets) {
    localStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(hiddenWidgets));
}

function getWidgetOrder() {
    try {
        return JSON.parse(localStorage.getItem(WIDGET_ORDER_KEY) || "[]");
    } catch (e) {
        return [];
    }
}

function saveWidgetOrder(order) {
    localStorage.setItem(WIDGET_ORDER_KEY, JSON.stringify(order));
}

function hideWidget(selector) {
    const hidden = getSavedWidgets();
    if (!hidden.includes(selector)) hidden.push(selector);
    saveHiddenWidgets(hidden);
    const widget = document.querySelector(selector);
    if (widget) widget.classList.add("widget-hidden");
    updateHiddenPills();
}

function showWidget(selector) {
    const hidden = getSavedWidgets().filter(s => s !== selector);
    saveHiddenWidgets(hidden);
    const widget = document.querySelector(selector);
    if (widget) widget.classList.remove("widget-hidden");
    updateHiddenPills();
}

function applyHiddenWidgets() {
    const hiddenWidgets = getSavedWidgets();
    INTRA_WIDGETS.forEach((selector) => {
        const widget = document.querySelector(selector);
        if (!widget) return;
        widget.classList.toggle("widget-hidden", hiddenWidgets.includes(selector));
    });
}

function applySavedWidgetOrder() {
    const container = document.querySelector('.container-fullsize > .row');
    if (!container) return;

    const order = getWidgetOrder();
    if (!order.length) return;

    order.forEach((selector) => {
        const el = document.querySelector(selector);
        if (el) container.appendChild(el);
    });
}

function getWidgetLabel(selector) {
    const widget = document.querySelector(selector);
    if (!widget) return selector;
    const heading = widget.querySelector('h2, h3, h4, .title')?.textContent?.trim().split('\n')[0].trim();
    return heading || selector;
}

function updateHiddenPills() {
    const pillsContainer = document.getElementById("iil-hidden-pills");
    if (!pillsContainer) return;

    const hidden = getSavedWidgets();
    pillsContainer.innerHTML = "";

    if (hidden.length === 0) {
        pillsContainer.style.display = "none";
        return;
    }

    pillsContainer.style.display = "flex";
    hidden.forEach((selector) => {
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "iil-hidden-pill";
        pill.innerHTML = `<span>+ ${getWidgetLabel(selector)}</span>`;
        pill.title = "Click to restore";
        pill.addEventListener("click", () => showWidget(selector));
        pillsContainer.appendChild(pill);
    });
}

function addHideButtons() {
    INTRA_WIDGETS.forEach((selector) => {
        const widget = document.querySelector(selector);
        if (!widget || widget.querySelector('.iil-hide-btn')) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "iil-hide-btn";
        btn.title = "Hide widget";
        btn.innerHTML = "✕";
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            hideWidget(selector);
        });
        widget.style.position = "relative";
        widget.appendChild(btn);
    });
}

function removeHideButtons() {
    document.querySelectorAll('.iil-hide-btn').forEach(btn => btn.remove());
}

function resetLayout() {
    localStorage.removeItem(WIDGET_STORAGE_KEY);
    localStorage.removeItem(WIDGET_ORDER_KEY);
    localStorage.removeItem(EDIT_MODE_KEY);
    location.reload();
}

function createLayoutButtons() {
    if (document.getElementById("iil-layout-controls")) return;

    const target = document.querySelector(".profile-item .profile-item-top");
    if (!target) return;

    const controls = document.createElement("div");
    controls.id = "iil-layout-controls";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.title = "Edit layout";
    editBtn.className = "iil-layout-btn";
    editBtn.innerHTML = '<span class="iil-layout-btn-icon">✎</span><span>Edit layout</span>';

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.title = "Reset to default layout";
    resetBtn.className = "iil-layout-btn iil-layout-btn-reset";
    resetBtn.innerHTML = '<span class="iil-layout-btn-icon">↺</span><span>Default</span>';
    resetBtn.addEventListener("click", () => {
        if (confirm("Reset layout to default?")) resetLayout();
    });

    const pillsContainer = document.createElement("div");
    pillsContainer.id = "iil-hidden-pills";
    pillsContainer.style.display = "none";

    controls.appendChild(editBtn);
    controls.appendChild(resetBtn);
    controls.appendChild(pillsContainer);
    target.insertAdjacentElement("afterend", controls);
}

function makeWidgetsDraggable(enabled) {
    INTRA_WIDGETS.forEach((selector) => {
        const widget = document.querySelector(selector);
        if (!widget) return;
        widget.draggable = enabled;
        widget.classList.toggle("widget-draggable", enabled);
    });
}

function setEditMode(enabled) {
    editMode = enabled;

    const controls = document.getElementById("iil-layout-controls");
    if (!controls) return;

    const editBtn = controls.querySelector(".iil-layout-btn:not(.iil-layout-btn-reset)");
    if (!editBtn) return;

    editBtn.innerHTML = enabled
        ? '<span class="iil-layout-btn-icon">✓</span><span>Done</span>'
        : '<span class="iil-layout-btn-icon">✎</span><span>Edit layout</span>';

    const resetBtn = controls.querySelector(".iil-layout-btn-reset");
    if (resetBtn) resetBtn.style.display = enabled ? "inline-flex" : "none";

    const pillsContainer = document.getElementById("iil-hidden-pills");
    if (pillsContainer) pillsContainer.style.display = enabled && getSavedWidgets().length ? "flex" : "none";

    if (enabled) {
        addHideButtons();
        updateHiddenPills();
    } else {
        removeHideButtons();
        applyHiddenWidgets();
        applySavedWidgetOrder();
    }

    makeWidgetsDraggable(enabled);
    localStorage.setItem(EDIT_MODE_KEY, enabled ? "1" : "0");
}

function initLayoutControls() {
    const controls = document.getElementById("iil-layout-controls");
    if (!controls) return;

    const editBtn = controls.querySelector(".iil-layout-btn:not(.iil-layout-btn-reset)");
    if (!editBtn) return;

    editBtn.addEventListener("click", () => {
        setEditMode(!editMode);
    });
}

function getHoveredWidget(x, y) {
    return INTRA_WIDGETS.map(sel => document.querySelector(sel))
        .filter(el => el && !el.classList.contains("dragging") && !el.classList.contains("widget-hidden"))
        .find(el => {
            const box = el.getBoundingClientRect();
            return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
        }) || null;
}

function swapElements(a, b) {
    const parentA = a.parentNode;
    const siblingA = a.nextSibling === b ? a : a.nextSibling;
    b.parentNode.insertBefore(a, b);
    parentA.insertBefore(b, siblingA);
}

function enableWidgetDragging() {
    const container = document.querySelector('.container-fullsize > .row');
    if (!container) return;

    INTRA_WIDGETS.forEach((selector) => {
        const widget = document.querySelector(selector);
        if (!widget) return;

        widget.addEventListener("dragstart", (e) => {
            if (!editMode) {
                e.preventDefault();
                return;
            }
            dragged = widget;
            setTimeout(() => widget.classList.add("dragging"), 0);
        });

        widget.addEventListener("dragend", () => {
            widget.classList.remove("dragging");
            document.querySelectorAll('.drag-target').forEach(el => el.classList.remove('drag-target'));
            dragged = null;
            lastSwapTarget = null;

            const order = [...container.querySelectorAll(INTRA_WIDGETS.join(","))]
                .map((el) => INTRA_WIDGETS.find((sel) => document.querySelector(sel) === el))
                .filter(Boolean);

            saveWidgetOrder(order);
        });
    });

    container.addEventListener("dragover", (e) => {
        if (!editMode || !dragged) return;
        e.preventDefault();

        const hovered = getHoveredWidget(e.clientX, e.clientY);

        document.querySelectorAll('.drag-target').forEach(el => el.classList.remove('drag-target'));
        if (hovered && hovered !== dragged) hovered.classList.add('drag-target');

        if (hovered && hovered !== dragged && hovered !== lastSwapTarget) {
            lastSwapTarget = hovered;
            swapElements(dragged, hovered);
        }
    });

    container.addEventListener("dragleave", (e) => {
        if (!e.relatedTarget || !container.contains(e.relatedTarget)) {
            lastSwapTarget = null;
        }
    });
}

function initWidgetLayout() {
    labelWidgets();
    createLayoutButtons();
    applyHiddenWidgets();
    applySavedWidgetOrder();
    initLayoutControls();
    enableWidgetDragging();
    setEditMode(editMode);
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", initWidgetLayout);
} else {
    initWidgetLayout();
}

// ── Social links box ──
const SOCIAL_STORAGE_KEY = "iil-social-links";

const PLATFORMS = {
    discord: {
        label: "Discord",
        modes: ["username", "server"],
        modeLabels: ["Username", "Server invite"],
        placeholder: { username: "e.g. coldone42", server: "https://discord.gg/..." },
        validate: (val, mode) => mode === "username" ? true : val.startsWith("https://discord.gg/"),
        toHref: (val, mode) => mode === "username" ? null : val,
        display: (val, mode) => mode === "username" ? val : "Discord Server",
    },
    github: {
        label: "GitHub",
        modes: null,
        placeholder: { default: "https://github.com/username" },
        validate: (val) => val.startsWith("https://github.com/"),
        toHref: (val) => val,
        display: (val) => val.replace("https://github.com/", ""),
    },
    linkedin: {
        label: "LinkedIn",
        modes: null,
        placeholder: { default: "https://linkedin.com/in/username" },
        validate: (val) => val.startsWith("https://linkedin.com/in/"),
        toHref: (val) => val,
        display: (val) => val.replace("https://linkedin.com/in/", ""),
    },
};

function getSocialLinks() {
    try { return JSON.parse(localStorage.getItem(SOCIAL_STORAGE_KEY) || "{}"); }
    catch { return {}; }
}

function saveSocialLinks(links) {
    localStorage.setItem(SOCIAL_STORAGE_KEY, JSON.stringify(links));
}

function createSocialBox() {
    const target = document.querySelector(".profile-item .user-header-box.infos");
    if (!target) return;
    if (document.getElementById("iil-social-box")) return;

    const links = getSocialLinks();

    const box = document.createElement("div");
    box.id = "iil-social-box";
    box.className = "user-header-box infos";
    box.style.width = "100%";
    box.style.minHeight = "180px";
    box.style.display = "flex";
    box.style.flexDirection = "column";
    box.style.justifyContent = "center";

    function render(editing) {
        if (editing) {
            box.innerHTML = `
                <div style="position:absolute;right:0;display:flex;gap:12px">
                    <button class="iil-social-hbtn" id="iil-social-confirm" title="Save">✓</button>
                    <button class="iil-social-hbtn" id="iil-social-cancel" title="Cancel">✕</button>
                </div>
                <div id="iil-social-links">
                    ${Object.entries(PLATFORMS).map(([key, p]) => {
                        const saved = links[key] || {};
                        const mode = saved.mode || (p.modes ? p.modes[0] : "default");
                        const val = saved.val || "";
                        return `
                        <div class="iil-social-row iil-social-edit-row" data-key="${key}">
                            <span class="iil-social-platform-label">${p.label}</span>
                            ${p.modes ? `
                                <select class="iil-social-mode-select" data-key="${key}">
                                    ${p.modes.map(m => `<option value="${m}" ${mode === m ? "selected" : ""}>${p.modeLabels[p.modes.indexOf(m)]}</option>`).join("")}
                                </select>
                            ` : ""}
                            <input class="iil-social-input-val" data-key="${key}" placeholder="${p.placeholder[mode] || p.placeholder.default}" value="${val}"/>
                        </div>`;
                    }).join("")}
                </div>
            `;

            // update placeholder on mode change
            box.querySelectorAll(".iil-social-mode-select").forEach(sel => {
                sel.addEventListener("change", () => {
                    const key = sel.dataset.key;
                    const input = box.querySelector(`.iil-social-input-val[data-key="${key}"]`);
                    input.placeholder = PLATFORMS[key].placeholder[sel.value] || "";
                    input.value = "";
                });
            });

            box.querySelector("#iil-social-confirm").addEventListener("click", () => {
                const updated = {};
                let error = null;
                Object.keys(PLATFORMS).forEach(key => {
                    const p = PLATFORMS[key];
                    const val = box.querySelector(`.iil-social-input-val[data-key="${key}"]`).value.trim();
                    const modeSel = box.querySelector(`.iil-social-mode-select[data-key="${key}"]`);
                    const mode = modeSel ? modeSel.value : "default";
                    if (val && !p.validate(val, mode)) {
                        error = `Invalid ${p.label} link.`;
                    }
                    updated[key] = { val, mode };
                });
                if (error) { alert(error); return; }
                saveSocialLinks(updated);
                Object.assign(links, updated);
                render(false);
            });

            box.querySelector("#iil-social-cancel").addEventListener("click", () => render(false));

        } else {
            box.innerHTML = `
                <div id="iil-social-header">
                    <span id="iil-social-title">Links</span>
                    <button class="iil-social-hbtn" id="iil-social-edit-btn" title="Edit">✎</button>
                </div>
                <div id="iil-social-links">
                    ${Object.entries(PLATFORMS).map(([key, p]) => {
                        const saved = links[key] || {};
                        const val = saved.val || "";
                        const mode = saved.mode || (p.modes ? p.modes[0] : "default");
                        const href = val ? p.toHref(val, mode) : null;
                        const display = val ? p.display(val, mode) : null;
                        return val ? `
                            ${href
                                ? `<a class="iil-social-row iil-social-link" href="${href}" target="_blank" rel="noopener">
                                        <span class="iil-social-platform-tag">${p.label}</span>
                                        <span class="iil-social-link-label">${display}</span>
                                        <span class="iil-social-link-arrow">↗</span>
                                   </a>`
                                : `<div class="iil-social-row iil-social-nolink">
                                        <span class="iil-social-platform-tag">${p.label}</span>
                                        <span class="iil-social-link-label">${display}</span>
                                   </div>`
                            }
                        ` : `
                            <div class="iil-social-row iil-social-empty">
                                <span class="iil-social-platform-tag">${p.label}</span>
                                <span>—</span>
                            </div>
                        `;
                    }).join("")}
                </div>
            `;
            box.querySelector("#iil-social-edit-btn").addEventListener("click", () => render(true));
        }
    }

    render(false);
    target.replaceWith(box);
}


function initSocialBox() {
    if (/^profile\.intra\.42\.fr\/?($|home)/.test(pageUrl)) {
        if (document.readyState === "loading") {
            window.addEventListener("DOMContentLoaded", createSocialBox);
        } else {
            createSocialBox();
        }
    }
}

initSocialBox();