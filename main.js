/* =============================================================
   Ksenia Baimakova — multilingual resume site
   Vanilla ES6, no dependencies
   ============================================================= */

(() => {
  "use strict";

  const SUPPORTED = ["ru", "de", "en"];
  const DEFAULT_LANG = "ru";
  const STORAGE_KEY = "kb-lang";

  const dataCache = {};
  let currentLang = null;
  let typewriterTimer = null;

  // ---------- helpers ----------
  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const getValue = (obj, path) =>
    path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);

  const detectLang = () => {
    const hash = (location.hash || "").replace("#", "").toLowerCase();
    if (SUPPORTED.includes(hash)) return hash;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED.includes(stored)) return stored;
    const browser = (navigator.language || "ru").slice(0, 2).toLowerCase();
    return SUPPORTED.includes(browser) ? browser : DEFAULT_LANG;
  };

  // ---------- data loading ----------
  async function loadLang(lang) {
    if (dataCache[lang]) return dataCache[lang];
    const url = new URL(`data/${lang}.json`, document.baseURI).href;
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load ${lang}.json (${res.status})`);
    const json = await res.json();
    dataCache[lang] = json;
    return json;
  }

  // ---------- rendering ----------
  function applyTextBindings(data) {
    $$("[data-key]").forEach(el => {
      const val = getValue(data, el.dataset.key);
      if (typeof val === "string") {
        // typewriter handled separately
        if (el.id === "typewriter") return;
        el.textContent = val;
      }
    });
    $$("[data-key-attr]").forEach(el => {
      const [path, attr] = el.dataset.keyAttr.split("|");
      const val = getValue(data, path);
      if (typeof val === "string" && attr) el.setAttribute(attr, val);
    });
  }

  function renderSkills(data) {
    const list = data.skills?.list || [];
    const track = $("#skillTicker");
    if (!track) return;
    // Duplicate the list once for seamless loop
    const itemsHtml = list.map(s => `<span class="ticker__item">${escapeHtml(s)}</span>`).join("");
    track.innerHTML = itemsHtml + itemsHtml;
  }

  function renderTimeline(data) {
    const items = data.experience?.items || [];
    const wrap = $("#timeline");
    if (!wrap) return;
    wrap.innerHTML = items.map((item, idx) => {
      const side = idx % 2 === 0 ? "left" : "right";
      const bullets = (item.bullets || []).map(b => `<li>${escapeHtml(b)}</li>`).join("");
      const meta = [item.location, item.industry].filter(Boolean)
        .map(m => `<span>${escapeHtml(m)}</span>`).join("");
      return `
        <article class="tl-card tl-card--${side}" tabindex="0" aria-expanded="false">
          <div class="tl-card__period">${escapeHtml(item.period || "")}</div>
          <h3 class="tl-card__company">${escapeHtml(item.company || "")}</h3>
          <div class="tl-card__role">${escapeHtml(item.role || "")}</div>
          ${meta ? `<div class="tl-card__meta">${meta}</div>` : ""}
          <ul class="tl-card__bullets">${bullets}</ul>
          <div class="tl-card__toggle" aria-hidden="true">
            <span class="tl-card__toggle-icon"></span>
            <span class="tl-card__toggle-text"></span>
          </div>
        </article>
      `;
    }).join("");

    // Attach toggle handlers
    $$(".tl-card", wrap).forEach(card => {
      const handler = () => {
        const open = card.classList.toggle("is-open");
        card.setAttribute("aria-expanded", String(open));
      };
      card.addEventListener("click", handler);
      card.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handler();
        }
      });
    });
  }

  function renderEducation(data) {
    const items = data.education?.items || [];
    const grid = $("#educationGrid");
    if (grid) {
      grid.innerHTML = items.map(item => `
        <article class="edu-card reveal">
          <div class="edu-card__period">${escapeHtml(item.period || "")}</div>
          <h3 class="edu-card__institution">${escapeHtml(item.institution || "")}</h3>
          <p class="edu-card__degree">${escapeHtml(item.degree || "")}</p>
        </article>
      `).join("");
    }
    const certsList = $("#certsList");
    if (certsList) {
      const certs = data.education?.certifications || [];
      certsList.innerHTML = certs.map(c => `<li>${escapeHtml(c)}</li>`).join("");
    }
  }

  function renderAchievements(data) {
    const items = data.achievements?.items || [];
    const grid = $("#achievementsGrid");
    if (grid) {
      grid.innerHTML = items.map(item => `
        <div class="ach reveal" data-target="${escapeHtml(item.number || "")}" data-suffix="${escapeHtml(item.suffix || "")}">
          <div class="ach__number">
            <span class="ach__count">0</span>
            <span class="ach__suffix">${escapeHtml(item.suffix || "")}</span>
          </div>
          <div class="ach__label">${escapeHtml(item.label || "")}</div>
        </div>
      `).join("");
    }
    const specialList = $("#specialList");
    if (specialList) {
      const specials = data.achievements?.special || [];
      specialList.innerHTML = specials.map(s => `<li>${escapeHtml(s)}</li>`).join("");
    }
  }

  function renderLanguages(data) {
    const items = data.languages?.items || [];
    const wrap = $("#languagesList");
    if (!wrap) return;
    wrap.innerHTML = items.map(item => `
      <div class="lang-row reveal" style="--target-width:${Number(item.percent) || 0}%">
        <div class="lang-row__head">
          <span class="lang-row__name">${escapeHtml(item.name || "")}</span>
          <span class="lang-row__level">${escapeHtml(item.level || "")}</span>
        </div>
        <div class="lang-row__bar"><span class="lang-row__fill"></span></div>
      </div>
    `).join("");
  }

  function renderContact(data) {
    const email = data.contact?.email || "";
    const phone = data.contact?.phone || "";
    const emailEl = $("#contactEmail");
    const phoneEl = $("#contactPhone");
    const ctaEl = $("#contactCta");
    if (emailEl) { emailEl.textContent = email; emailEl.href = `mailto:${email}`; }
    if (phoneEl) {
      phoneEl.textContent = phone;
      phoneEl.href = `tel:${phone.replace(/[^+\d]/g, "")}`;
    }
    if (ctaEl) ctaEl.href = `mailto:${email}`;
  }

  function renderAll(data) {
    const steps = [
      ["text", () => applyTextBindings(data)],
      ["skills", () => renderSkills(data)],
      ["timeline", () => renderTimeline(data)],
      ["education", () => renderEducation(data)],
      ["achievements", () => renderAchievements(data)],
      ["languages", () => renderLanguages(data)],
      ["contact", () => renderContact(data)],
      ["reveal", () => setupRevealObserver()],
    ];
    steps.forEach(([name, fn]) => {
      try { fn(); } catch (err) { console.error(`render error in ${name}:`, err); }
    });
    startTypewriter(data.hero?.title || "");
  }

  // ---------- typewriter ----------
  function startTypewriter(text) {
    const el = $("#typewriter");
    if (!el) return;
    if (typewriterTimer) clearInterval(typewriterTimer);
    el.textContent = "";
    let i = 0;
    typewriterTimer = setInterval(() => {
      i += 1;
      el.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(typewriterTimer);
        typewriterTimer = null;
      }
    }, 38);
  }

  // ---------- language switching ----------
  async function setLang(lang, { updateHash = true, saveStorage = true } = {}) {
    if (!SUPPORTED.includes(lang)) lang = DEFAULT_LANG;
    if (lang === currentLang) return;

    document.body.classList.add("is-lang-fading");

    let data;
    try {
      data = await loadLang(lang);
    } catch (err) {
      console.error(err);
      document.body.classList.remove("is-lang-fading");
      return;
    }

    // Wait one frame so fade-out is visible
    await new Promise(r => setTimeout(r, 160));

    currentLang = lang;
    document.documentElement.lang = data.meta?.lang || lang;
    if (data.meta?.title) document.title = data.meta.title;

    renderAll(data);

    // Update active button
    $$(".lang-switch__btn").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.lang === lang);
    });

    if (saveStorage) localStorage.setItem(STORAGE_KEY, lang);
    if (updateHash) {
      const newHash = `#${lang}`;
      if (location.hash !== newHash) {
        history.replaceState(null, "", `${location.pathname}${location.search}${newHash}`);
      }
    }

    requestAnimationFrame(() => {
      document.body.classList.remove("is-lang-fading");
    });
  }

  // ---------- nav, scroll, menu ----------
  function setupNav() {
    const nav = $("#nav");
    const onScroll = () => {
      nav.classList.toggle("is-scrolled", window.scrollY > 24);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const burger = $("#burger");
    const menu = $("#mobileMenu");
    burger.addEventListener("click", () => {
      const open = !burger.classList.contains("is-open");
      burger.classList.toggle("is-open", open);
      burger.setAttribute("aria-expanded", String(open));
      menu.classList.toggle("is-open", open);
      menu.setAttribute("aria-hidden", String(!open));
      document.body.style.overflow = open ? "hidden" : "";
    });
    $$("a", menu).forEach(a => a.addEventListener("click", () => {
      burger.classList.remove("is-open");
      burger.setAttribute("aria-expanded", "false");
      menu.classList.remove("is-open");
      menu.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }));
  }

  function setupLangSwitch() {
    $$(".lang-switch__btn").forEach(btn => {
      btn.addEventListener("click", () => setLang(btn.dataset.lang));
    });
    window.addEventListener("hashchange", () => {
      const hash = location.hash.replace("#", "").toLowerCase();
      if (SUPPORTED.includes(hash)) setLang(hash, { updateHash: false });
    });
  }

  // ---------- reveal & counters ----------
  let revealObserver;
  function setupRevealObserver() {
    if (!("IntersectionObserver" in window)) {
      $$(".reveal, .tl-card, .lang-row").forEach(el => el.classList.add("is-visible"));
      animateAllCounters();
      return;
    }
    if (revealObserver) revealObserver.disconnect();
    revealObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          // Stagger using sibling index inside parent
          const siblings = Array.from(el.parentElement?.children || []).filter(c => c.classList.contains("reveal") || c.classList.contains("tl-card") || c.classList.contains("lang-row"));
          const idx = siblings.indexOf(el);
          el.style.transitionDelay = `${Math.max(0, idx) * 80}ms`;
          el.classList.add("is-visible");
          if (el.classList.contains("ach")) animateCounter(el);
          obs.unobserve(el);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });

    $$(".reveal, .tl-card, .lang-row, .ach").forEach(el => revealObserver.observe(el));
  }

  function animateCounter(el) {
    const targetRaw = el.dataset.target || "0";
    const target = parseFloat(targetRaw.replace(/\s/g, ""));
    if (isNaN(target)) return;
    const countEl = $(".ach__count", el);
    if (!countEl) return;
    const duration = 1400;
    const start = performance.now();
    const isFloat = targetRaw.includes(".") || targetRaw.includes(",");
    const decimals = isFloat ? 1 : 0;

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = target * eased;
      countEl.textContent = formatNumber(v, decimals);
      if (t < 1) requestAnimationFrame(tick);
      else countEl.textContent = formatNumber(target, decimals);
    };
    requestAnimationFrame(tick);
  }

  function animateAllCounters() {
    $$(".ach").forEach(animateCounter);
  }

  function formatNumber(n, decimals) {
    if (decimals > 0) return n.toFixed(decimals);
    return Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
  }

  // ---------- cursor ----------
  function setupCursor() {
    if (window.matchMedia("(hover: none)").matches) return;
    const dot  = $(".cursor-dot");
    const ring = $(".cursor-ring");
    if (!dot || !ring) return;

    let mx = 0, my = 0, rx = 0, ry = 0;
    let active = false;

    window.addEventListener("mousemove", e => {
      mx = e.clientX; my = e.clientY;
      if (!active) {
        active = true;
        document.body.classList.add("cursor-active");
      }
      dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
    });
    window.addEventListener("mouseleave", () => {
      document.body.classList.remove("cursor-active");
      active = false;
    });

    const loop = () => {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
      requestAnimationFrame(loop);
    };
    loop();

    document.addEventListener("mouseover", e => {
      if (e.target.closest("a, button, .tl-card")) {
        document.body.classList.add("cursor-hover");
      }
    });
    document.addEventListener("mouseout", e => {
      if (e.target.closest("a, button, .tl-card")) {
        document.body.classList.remove("cursor-hover");
      }
    });
  }

  // ---------- download menu ----------
  function setupDownloadMenu() {
    const root = $("#download");
    const btn  = $("#downloadBtn");
    const menu = $("#downloadMenu");
    if (!root || !btn || !menu) return;
    menu.removeAttribute("hidden");
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const open = !root.classList.contains("is-open");
      root.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", e => {
      if (!root.contains(e.target)) {
        root.classList.remove("is-open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  // ---------- footer ----------
  function setupFooter() {
    const yr = $("#footerYear");
    if (yr) yr.textContent = `© ${new Date().getFullYear()}`;
  }

  // ---------- utility ----------
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ---------- init ----------
  document.addEventListener("DOMContentLoaded", async () => {
    setupNav();
    setupLangSwitch();
    setupCursor();
    setupDownloadMenu();
    setupFooter();
    await setLang(detectLang(), { updateHash: false });
  });

})();
