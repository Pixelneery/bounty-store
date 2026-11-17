(function () {
  const state = {
    config: null,
    products: [],
    catalog: {},
    basket: {},
    activeMethod: "card",
  };

  const fmt = (n) => `${state.config?.currencySymbol || "$"}${n.toFixed(2)}`;

  const fmtNumber = (n) => Number(n).toLocaleString("en-US");

  const BOX_ICON = `<svg class="icon" aria-hidden="true"><use href="#i-box"/></svg>`;
  const STAR_ICON = `<svg class="icon" aria-hidden="true"><use href="#i-star"/></svg>`;

  function spawnEmbers() {
    const container = document.getElementById("embers");
    if (!container) return;
    const colors = ["#d9a44f", "#c62f3e", "#f0c574"];
    const count = window.innerWidth < 600 ? 18 : 32;
    for (let i = 0; i < count; i++) {
      const ember = document.createElement("span");
      const color = colors[i % colors.length];
      ember.className = "ember";
      ember.style.setProperty("--x", `${Math.random() * 100}%`);
      ember.style.setProperty("--size", `${1 + Math.random() * 2}px`);
      ember.style.setProperty("--ember", color);
      ember.style.setProperty("--drift", `${Math.random() * 80 - 40}px`);
      ember.style.setProperty("--dur", `${10 + Math.random() * 14}s`);
      ember.style.setProperty("--delay", `${Math.random() * 12}s`);
      ember.style.setProperty("--opacity", `${0.2 + Math.random() * 0.45}`);
      container.appendChild(ember);
    }
  }

  function initHeader() {
    const header = document.getElementById("siteHeader");
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  function initMobileNav() {
    const nav = document.getElementById("mobileNav");
    const toggle = document.getElementById("menuToggle");
    const open = () => {
      nav.classList.add("is-open");
      nav.setAttribute("aria-hidden", "false");
      toggle.setAttribute("aria-expanded", "true");
      document.body.classList.add("menu-open");
    };
    const close = () => {
      nav.classList.remove("is-open");
      nav.setAttribute("aria-hidden", "true");
      toggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("menu-open");
    };

    toggle.addEventListener("click", () => {
      nav.classList.contains("is-open") ? close() : open();
    });
    document.querySelectorAll("[data-menu-close]").forEach((el) => {
      el.addEventListener("click", close);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    state.closeMobileNav = close;
  }

  function showView(view) {
    ["home", "packages", "ranks", "crates"].forEach((name) => {
      document.getElementById(`view-${name}`).hidden = name !== view;
    });
    document.querySelectorAll(".nav__link[data-view]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-view") === view);
    });
    if (state.closeMobileNav) state.closeMobileNav();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function loadData() {
    const [config, products, ranks, crates, leaderboard] = await Promise.all([
      fetch("/api/config").then((r) => r.json()),
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/ranks").then((r) => r.json()),
      fetch("/api/crates").then((r) => r.json()),
      fetch("/api/leaderboard").then((r) => r.json()),
    ]);

    state.config = config;
    state.products = products;
    state.ranks = ranks;
    state.crates = crates;

    document.title = config.storeName;
    document.getElementById("storeLogo").alt = config.storeName;
    document.getElementById("tagline").textContent = config.tagline;
    document.getElementById("storeNameHeader").textContent = `${config.storeName} · Ruby Store`;
    document.getElementById("discordLink").href = config.supportUrl;
    document.getElementById("navDiscordLink").href = config.supportUrl;
    document.getElementById("mobileDiscordLink").href = config.supportUrl;
    document.getElementById("footerDiscordLink").href = config.supportUrl;
    document.getElementById("faqDiscordLink").href = config.supportUrl;
    document.querySelectorAll("[data-discord]").forEach((link) => {
      link.href = config.supportUrl;
    });

    renderProducts();
    renderRanks();
    renderCrates();
    renderPayTabs();
    renderLeaderboard(leaderboard);
    renderFaq(document.getElementById("storeFaq"), config.faq || []);
    loadDiscordCount();
  }

  async function loadDiscordCount() {
    const el = document.getElementById("discordCount");
    const guildId = state.config.discordGuildId;
    if (!guildId) {
      el.textContent = state.config.discordMemberFallback ?? "—";
      return;
    }
    try {
      const resp = await fetch(`https://discord.com/api/guilds/${guildId}/widget.json`);
      if (!resp.ok) throw new Error("widget disabled");
      const data = await resp.json();
      el.textContent = data.presence_count;
    } catch (e) {
      el.textContent = state.config.discordMemberFallback ?? "—";
    }
  }

  function cardMedia(item) {
    return item.image
      ? `<img class="card__image" src="/img/${item.image}" alt="${item.name}" />`
      : `<div class="card__icon">${BOX_ICON}</div>`;
  }

  function attachImageFallback(card) {
    const img = card.querySelector(".card__image");
    if (!img) return;
    img.addEventListener(
      "error",
      () => {
        const fallback = document.createElement("div");
        fallback.className = "card__icon";
        fallback.innerHTML = BOX_ICON;
        img.replaceWith(fallback);
      },
      { once: true }
    );
  }

  function bindCatalogGrid(grid) {
    grid.addEventListener("click", (e) => {
      const addEl = e.target.closest("[data-add]");
      if (addEl) {
        addToBasket(addEl.getAttribute("data-add"));
        return;
      }
      const detailEl = e.target.closest("[data-detail]");
      if (detailEl) {
        openDetail(detailEl.getAttribute("data-detail"), detailEl.getAttribute("data-id"));
      }
    });
    grid.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const card = e.target.closest(".rank-card[data-detail]");
      if (!card || e.target !== card) return;
      e.preventDefault();
      openDetail(card.getAttribute("data-detail"), card.getAttribute("data-id"));
    });
  }

  function renderProducts() {
    const grid = document.getElementById("packages");
    grid.innerHTML = "";
    state.products.forEach((p) => {
      state.catalog[p.id] = p;
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `
        <div class="card__top">
          <span class="mono">Ruby package</span>
          ${p.badge ? `<span class="card__badge">${p.badge}</span>` : ""}
        </div>
        ${cardMedia(p)}
        <h3 class="card__name">${p.name}</h3>
        <div class="card__price-row">
          ${p.originalPrice ? `<span class="card__original">${fmt(p.originalPrice)}</span>` : ""}
          <span class="card__price">${fmt(p.price)}</span>
        </div>
        <button class="btn btn--primary btn--block" type="button" data-add="${p.id}">Add to basket</button>
      `;
      attachImageFallback(card);
      grid.appendChild(card);
    });
    bindCatalogGrid(grid);
  }

  function renderRanks() {
    const grid = document.getElementById("ranks");
    grid.innerHTML = "";
    (state.ranks || []).forEach((r, index) => {
      const card = document.createElement("article");
      card.className = "card rank-card card--clickable";
      card.setAttribute("data-detail", "rank");
      card.setAttribute("data-id", r.id);
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `View ${r.name} perks`);
      card.innerHTML = `
        <div class="card__top">
          <span class="mono">Guild rank</span>
          <span class="tag">Tier ${String(index + 1).padStart(2, "0")}</span>
        </div>
        <div class="card__icon">${STAR_ICON}</div>
        <h3 class="card__name">${r.name}</h3>
        <p class="rank-card__note">Unlocked in-game with rubies.</p>
        <div class="rank-card__price-row">
          <span class="rank-card__price">${fmtNumber(r.ingamePrice)}</span>
          <span class="ruby-mark" aria-hidden="true">♦</span>
        </div>
        <div class="rank-card__foot">
          <span>View perks</span>
          <svg class="icon" aria-hidden="true"><use href="#i-arrow-right"/></svg>
        </div>
      `;
      grid.appendChild(card);
    });
    bindCatalogGrid(grid);
  }

  function renderCrates() {
    const grid = document.getElementById("crates");
    grid.innerHTML = "";
    (state.crates || []).forEach((c) => {
      state.catalog[c.id] = c;
      const card = document.createElement("article");
      card.className = "card card--clickable";
      card.setAttribute("data-detail", "crate");
      card.setAttribute("data-id", c.id);
      card.innerHTML = `
        <div class="card__top">
          <span class="mono">Crate key</span>
          <span class="tag">Vault</span>
        </div>
        ${cardMedia(c)}
        <h3 class="card__name">${c.name}</h3>
        <div class="card__price-row">
          <span class="card__price">${fmt(c.price)}</span>
        </div>
        <div class="card__actions">
          <button class="btn btn--ghost btn--sm" type="button" data-detail="crate" data-id="${c.id}">Contents</button>
          <button class="btn btn--primary btn--sm" type="button" data-add="${c.id}">Add to basket</button>
        </div>
      `;
      attachImageFallback(card);
      grid.appendChild(card);
    });
    bindCatalogGrid(grid);
  }

  function renderLeaderboard(entries) {
    const section = document.getElementById("leaderboardSection");
    const list = document.getElementById("leaderboard");
    if (!entries || entries.length === 0) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    list.innerHTML = entries
      .map(
        (e, i) => `
      <div class="leaderboard-row">
        <span class="leaderboard-row__rank">#${i + 1}</span>
        <span class="leaderboard-row__name">${e.playerName}</span>
        <span class="leaderboard-row__total">${fmt(e.total)}</span>
      </div>`
      )
      .join("");
  }

  function renderFaq(container, items) {
    if (!container) return;
    container.innerHTML = items
      .map(
        (item, i) => `
      <div class="faq-item">
        <button class="faq-q" type="button" aria-expanded="false">
          <span class="faq-q__num">${String(i + 1).padStart(2, "0")}</span>
          <span class="faq-q__text">${item.q}</span>
          <span class="faq-q__icon" aria-hidden="true"></span>
        </button>
        <div class="faq-a">
          <div class="faq-a__inner">${item.a}</div>
        </div>
      </div>`
      )
      .join("");

    container.querySelectorAll(".faq-q").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = btn.closest(".faq-item");
        const answer = item.querySelector(".faq-a");
        const isOpen = item.classList.toggle("is-open");
        btn.setAttribute("aria-expanded", String(isOpen));
        answer.style.maxHeight = isOpen ? `${answer.scrollHeight}px` : "0px";
      });
    });
  }

  function addToBasket(id) {
    const product = state.catalog[id];
    if (!product) return;
    if (!state.basket[id]) state.basket[id] = { product, quantity: 0 };
    state.basket[id].quantity += 1;
    renderBasket();
    openDrawer();
  }

  function changeQty(id, delta) {
    const entry = state.basket[id];
    if (!entry) return;
    entry.quantity += delta;
    if (entry.quantity <= 0) delete state.basket[id];
    renderBasket();
  }

  function basketItems() {
    return Object.values(state.basket);
  }

  function basketTotal() {
    return basketItems().reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  }

  function renderBasket() {
    const count = basketItems().reduce((sum, i) => sum + i.quantity, 0);
    document.getElementById("basketCount").textContent = count;

    const list = document.getElementById("drawerItems");
    const items = basketItems();
    if (items.length === 0) {
      list.innerHTML = `<div class="empty-basket">Your basket is empty. Add a contract to get started.</div>`;
    } else {
      list.innerHTML = items
        .map(
          (i) => `
        <div class="drawer-item">
          <span class="drawer-item__name">${i.product.name}</span>
          <div class="drawer-item__controls">
            <button class="qty-btn" type="button" data-qty="${i.product.id}" data-delta="-1">−</button>
            <span>${i.quantity}</span>
            <button class="qty-btn" type="button" data-qty="${i.product.id}" data-delta="1">+</button>
          </div>
          <span class="drawer-item__price">${fmt(i.product.price * i.quantity)}</span>
        </div>`
        )
        .join("");
    }

    document.getElementById("drawerTotal").textContent = fmt(basketTotal());
    document.getElementById("checkoutBtn").disabled = items.length === 0;
  }

  function openDrawer() {
    document.getElementById("drawer").classList.add("open");
    document.getElementById("drawerOverlay").classList.add("open");
  }

  function closeDrawer() {
    document.getElementById("drawer").classList.remove("open");
    document.getElementById("drawerOverlay").classList.remove("open");
  }

  function openModal() {
    closeDetail();
    closeDrawer();
    const playerNameEl = document.getElementById("playerName");
    const skinInput = document.getElementById("skinUsername");
    if (!playerNameEl.value && skinInput.value) playerNameEl.value = skinInput.value;
    document.getElementById("checkoutModal").classList.add("open");
    document.getElementById("modalOverlay").classList.add("open");
  }

  function closeModal() {
    document.getElementById("checkoutModal").classList.remove("open");
    document.getElementById("modalOverlay").classList.remove("open");
  }

  let detailProductId = null;

  function openDetail(type, id) {
    const collection = type === "rank" ? state.ranks || [] : state.crates || [];
    const item = collection.find((entry) => entry.id === id);
    if (!item) return;

    closeModal();
    closeDrawer();

    const isRank = type === "rank";
    const perks = Array.isArray(item.perks) ? item.perks : [];

    document.getElementById("detailKicker").textContent = isRank ? "Guild rank" : "Crate key";
    document.getElementById("detailTitle").textContent = item.name;
    document.getElementById("detailPerks").innerHTML = perks.length
      ? perks.map((perk) => `<li>${perk}</li>`).join("")
      : `<li>No details configured yet.</li>`;
    document.getElementById("detailPriceLabel").textContent = isRank ? "In-game price" : "Price";
    document.getElementById("detailPrice").innerHTML = isRank
      ? `${fmtNumber(item.ingamePrice)} <span class="ruby-mark" aria-hidden="true">♦</span>`
      : fmt(item.price);
    document.getElementById("detailNote").textContent = isRank
      ? "Ranks are purchased in-game with rubies."
      : "Keys are delivered in-game after payment confirms.";

    const action = document.getElementById("detailAction");
    action.hidden = isRank;
    detailProductId = isRank ? null : item.id;

    document.getElementById("detailModal").classList.add("open");
    document.getElementById("detailOverlay").classList.add("open");
  }

  function closeDetail() {
    document.getElementById("detailModal").classList.remove("open");
    document.getElementById("detailOverlay").classList.remove("open");
  }

  function showError(msg) {
    const el = document.getElementById("checkoutError");
    el.textContent = msg;
    el.hidden = false;
  }

  function clearError() {
    document.getElementById("checkoutError").hidden = true;
  }

  function renderPayTabs() {
    const methods = state.config.paymentMethods || ["card"];
    const labels = { card: "Card" };
    const tabs = document.getElementById("payTabs");

    if (methods.length <= 1) {
      tabs.hidden = true;
      state.activeMethod = methods[0] || "card";
      updateActiveTab();
      return;
    }

    tabs.hidden = false;
    tabs.innerHTML = methods
      .map((m) => `<button class="pay-tab" type="button" data-method="${m}">${labels[m] || m}</button>`)
      .join("");
    state.activeMethod = methods[0];
    updateActiveTab();
    tabs.addEventListener("click", (e) => {
      const m = e.target.getAttribute("data-method");
      if (!m) return;
      state.activeMethod = m;
      updateActiveTab();
    });
  }

  function updateActiveTab() {
    document.querySelectorAll(".pay-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-method") === state.activeMethod);
    });
    document.getElementById("panel-card").hidden = state.activeMethod !== "card";
  }

  function checkoutItems() {
    return basketItems().map((i) => ({
      id: i.product.id,
      name: i.product.name,
      price: i.product.price,
      rubies: i.product.rubies,
      command: i.product.command,
      quantity: i.quantity,
    }));
  }

  function getPlayerName() {
    return document.getElementById("playerName").value.trim();
  }

  function isGift() {
    return document.getElementById("giftToggle").checked;
  }

  function getRecipientName() {
    return document.getElementById("recipientName").value.trim();
  }

  async function payWithCard() {
    clearError();
    const playerName = getPlayerName();
    if (!playerName) return showError("Enter your Minecraft username first.");

    let recipientName;
    if (isGift()) {
      recipientName = getRecipientName();
      if (!recipientName) return showError("Enter the recipient's Minecraft username.");
    }

    const btn = document.getElementById("payCard");
    btn.disabled = true;
    btn.textContent = "Redirecting…";
    try {
      const resp = await fetch("/api/payments/stripe/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: checkoutItems(), playerName, recipientName }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Could not start checkout");
      window.location.href = data.url;
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = "Pay with card";
    }
  }

  function updateSkinPreview(name) {
    const img = document.getElementById("skinAvatar");
    const placeholder = document.getElementById("skinPlaceholder");
    if (!name || name.length < 3) {
      img.hidden = true;
      placeholder.hidden = false;
      return;
    }
    img.src = `https://mc-heads.net/avatar/${encodeURIComponent(name)}/256`;
    img.hidden = false;
    placeholder.hidden = true;
  }

  function rollBounty() {
    const amount = Math.round((1500 + Math.random() * 23500) / 50) * 50;
    document.getElementById("bountyAmount").textContent = fmtNumber(amount);
  }

  document.addEventListener("DOMContentLoaded", () => {
    spawnEmbers();
    initHeader();
    initMobileNav();
    loadData();

    const initialView = new URLSearchParams(window.location.search).get("view");
    if (["home", "packages", "ranks", "crates"].includes(initialView)) {
      showView(initialView);
    }

    document.querySelectorAll("[data-view]").forEach((el) => {
      el.addEventListener("click", () => showView(el.getAttribute("data-view")));
    });

    document.getElementById("brandLink").addEventListener("click", () => showView("home"));
    document.getElementById("browseStoreBtn").addEventListener("click", () => showView("packages"));
    document.getElementById("footerBasketBtn").addEventListener("click", openDrawer);

    document.getElementById("basketBtn").addEventListener("click", openDrawer);
    document.getElementById("closeDrawer").addEventListener("click", closeDrawer);
    document.getElementById("drawerOverlay").addEventListener("click", closeDrawer);
    document.getElementById("closeModal").addEventListener("click", closeModal);
    document.getElementById("modalOverlay").addEventListener("click", closeModal);
    document.getElementById("closeDetail").addEventListener("click", closeDetail);
    document.getElementById("detailOverlay").addEventListener("click", closeDetail);
    document.getElementById("detailAction").addEventListener("click", () => {
      if (!detailProductId) return;
      const id = detailProductId;
      closeDetail();
      addToBasket(id);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      closeDetail();
      closeModal();
    });
    document.getElementById("checkoutBtn").addEventListener("click", openModal);
    document.getElementById("payCard").addEventListener("click", payWithCard);

    document.getElementById("giftToggle").addEventListener("change", (e) => {
      document.getElementById("recipientField").hidden = !e.target.checked;
    });

    document.getElementById("drawerItems").addEventListener("click", (e) => {
      const id = e.target.getAttribute("data-qty");
      if (!id) return;
      changeQty(id, Number(e.target.getAttribute("data-delta")));
    });

    const skinInput = document.getElementById("skinUsername");
    const saved = localStorage.getItem("bountymine_username") || "";
    let lastBountyName = saved;
    skinInput.value = saved;
    updateSkinPreview(saved);
    rollBounty();
    let skinDebounce;
    skinInput.addEventListener("input", (e) => {
      clearTimeout(skinDebounce);
      const name = e.target.value.trim();
      skinDebounce = setTimeout(() => {
        updateSkinPreview(name);
        if (name) localStorage.setItem("bountymine_username", name);
        if (name !== lastBountyName) {
          lastBountyName = name;
          rollBounty();
        }
      }, 400);
    });
  });
})();
