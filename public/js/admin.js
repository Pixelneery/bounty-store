(function () {
  const FORMS = { products: "productForm", ranks: "rankForm", crates: "crateForm" };
  const LABELS = { products: "Add package", ranks: "Add rank", crates: "Add key" };
  const NOUNS = { products: "package", ranks: "rank", crates: "crate key" };

  const state = {
    data: null,
    tab: "products",
  };

  const $ = (selector) => document.querySelector(selector);

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[char];
    });
  }

  async function api(path, options = {}) {
    const request = { credentials: "same-origin", ...options };
    if (request.body && typeof request.body !== "string") {
      request.headers = { "Content-Type": "application/json", ...(request.headers || {}) };
      request.body = JSON.stringify(request.body);
    }

    const response = await fetch(path, request);
    let data = null;
    try {
      data = await response.json();
    } catch (err) {
      data = null;
    }

    if (!response.ok) {
      const error = new Error((data && data.error) || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function setMessage(element, text, ok) {
    if (!element) return;
    element.textContent = text;
    element.hidden = !text;
    element.className = `msg ${ok ? "ok" : "error"}`;
  }

  function clearMessage(element) {
    if (!element) return;
    element.textContent = "";
    element.hidden = true;
  }

  function showLogin() {
    $("#loginPanel").hidden = false;
    $("#dashboard").hidden = true;
    $("#logoutBtn").hidden = true;
  }

  function showDashboard() {
    $("#loginPanel").hidden = true;
    $("#dashboard").hidden = false;
    $("#logoutBtn").hidden = false;
  }

  function money(value) {
    const symbol = (state.data && state.data.currencySymbol) || "$";
    return `${symbol}${Number(value || 0).toFixed(2)}`;
  }

  function render() {
    const data = state.data;
    if (!data) return;

    const productsBody = $("#productsBody");
    productsBody.innerHTML =
      data.products
        .map(
          (product) => `
        <tr>
          <td>${escapeHtml(product.name)}<br><code>${escapeHtml(product.id)}</code></td>
          <td>${escapeHtml(product.rubies)}</td>
          <td>${money(product.price)}</td>
          <td>${product.badge ? escapeHtml(product.badge) : "—"}</td>
          <td><code>${product.image ? escapeHtml(product.image) : "—"}</code></td>
          <td>
            <div class="row-actions">
              <button type="button" class="small secondary" data-action="edit" data-type="products" data-id="${escapeHtml(product.id)}">Edit</button>
              <button type="button" class="small danger" data-action="delete" data-type="products" data-id="${escapeHtml(product.id)}">Delete</button>
            </div>
          </td>
        </tr>`
        )
        .join("") || `<tr><td colspan="6">No packages yet.</td></tr>`;

    const ranksBody = $("#ranksBody");
    ranksBody.innerHTML =
      data.ranks
        .map(
          (rank) => `
        <tr>
          <td>${escapeHtml(rank.name)}<br><code>${escapeHtml(rank.id)}</code></td>
          <td>${escapeHtml(rank.ingamePrice)} ♦</td>
          <td>${Array.isArray(rank.perks) ? rank.perks.length : 0}</td>
          <td>
            <div class="row-actions">
              <button type="button" class="small secondary" data-action="edit" data-type="ranks" data-id="${escapeHtml(rank.id)}">Edit</button>
              <button type="button" class="small danger" data-action="delete" data-type="ranks" data-id="${escapeHtml(rank.id)}">Delete</button>
            </div>
          </td>
        </tr>`
        )
        .join("") || `<tr><td colspan="4">No ranks yet.</td></tr>`;

    const cratesBody = $("#cratesBody");
    cratesBody.innerHTML =
      data.crates
        .map(
          (crate) => `
        <tr>
          <td>${escapeHtml(crate.name)}<br><code>${escapeHtml(crate.id)}</code></td>
          <td>${money(crate.price)}</td>
          <td><code>${escapeHtml(crate.command)}</code></td>
          <td>${Array.isArray(crate.perks) ? crate.perks.length : 0}</td>
          <td>
            <div class="row-actions">
              <button type="button" class="small secondary" data-action="edit" data-type="crates" data-id="${escapeHtml(crate.id)}">Edit</button>
              <button type="button" class="small danger" data-action="delete" data-type="crates" data-id="${escapeHtml(crate.id)}">Delete</button>
            </div>
          </td>
        </tr>`
        )
        .join("") || `<tr><td colspan="5">No crate keys yet.</td></tr>`;

    $("#commandsForm").elements.rubies.value = (data.commands && data.commands.rubies) || "";
  }

  async function loadData() {
    try {
      state.data = await api("/api/admin/data");
      render();
    } catch (error) {
      if (error.status === 401) {
        showLogin();
      } else {
        alert(error.message);
      }
    }
  }

  function resetForm(type) {
    const form = document.getElementById(FORMS[type]);
    if (!form) return;
    form.reset();
    form.elements.editingId.value = "";
    form.querySelector("[data-submit]").textContent = LABELS[type];
    form.querySelector("[data-cancel]").hidden = true;
    clearMessage(form.querySelector("[data-msg]"));
  }

  function editItem(type, id) {
    const item = state.data[type].find((entry) => entry.id === id);
    if (!item) return;
    const form = document.getElementById(FORMS[type]);
    form.elements.editingId.value = item.id;

    if (type === "products") {
      form.elements.name.value = item.name;
      form.elements.rubies.value = item.rubies;
      form.elements.price.value = item.price;
      form.elements.originalPrice.value = item.originalPrice ?? "";
      form.elements.badge.value = item.badge ?? "";
      form.elements.image.value = item.image ?? "";
    } else if (type === "ranks") {
      form.elements.name.value = item.name;
      form.elements.ingamePrice.value = item.ingamePrice;
      form.elements.perks.value = (item.perks || []).join("\n");
    } else {
      form.elements.name.value = item.name;
      form.elements.price.value = item.price;
      form.elements.command.value = item.command;
      form.elements.perks.value = (item.perks || []).join("\n");
    }

    form.querySelector("[data-submit]").textContent = "Update";
    form.querySelector("[data-cancel]").hidden = false;
    clearMessage(form.querySelector("[data-msg]"));
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function saveItem(form, type, id, payload) {
    const message = form.querySelector("[data-msg]");
    try {
      const endpoint = `/api/admin/${type}${id ? `/${encodeURIComponent(id)}` : ""}`;
      await api(endpoint, { method: id ? "PUT" : "POST", body: payload });
      resetForm(type);
      await loadData();
      setMessage(message, id ? "Saved." : "Added.", true);
    } catch (error) {
      if (error.status === 401) return showLogin();
      setMessage(message, error.message, false);
    }
  }

  async function deleteItem(type, id) {
    if (!confirm(`Delete this ${NOUNS[type]}?`)) return;
    try {
      await api(`/api/admin/${type}/${encodeURIComponent(id)}`, { method: "DELETE" });
      const form = document.getElementById(FORMS[type]);
      if (form.elements.editingId.value === id) resetForm(type);
      await loadData();
    } catch (error) {
      if (error.status === 401) return showLogin();
      alert(error.message);
    }
  }

  function perksFrom(value) {
    return String(value)
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = $("#loginMsg");
    clearMessage(message);
    try {
      await api("/api/admin/login", {
        method: "POST",
        body: {
          login: $("#loginUser").value,
          password: $("#loginPass").value,
        },
      });
      $("#loginPass").value = "";
      showDashboard();
      await loadData();
    } catch (error) {
      setMessage(message, error.message, false);
    }
  });

  $("#logoutBtn").addEventListener("click", async () => {
    try {
      await api("/api/admin/logout", { method: "POST" });
    } catch (error) {
      // Ignore logout errors; the local view is cleared either way.
    }
    state.data = null;
    showLogin();
  });

  document.getElementById("productForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    saveItem(form, "products", form.elements.editingId.value, {
      name: form.elements.name.value,
      rubies: form.elements.rubies.value,
      price: form.elements.price.value,
      originalPrice: form.elements.originalPrice.value,
      badge: form.elements.badge.value,
      image: form.elements.image.value,
    });
  });

  document.getElementById("rankForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    saveItem(form, "ranks", form.elements.editingId.value, {
      name: form.elements.name.value,
      ingamePrice: form.elements.ingamePrice.value,
      perks: perksFrom(form.elements.perks.value),
    });
  });

  document.getElementById("crateForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    saveItem(form, "crates", form.elements.editingId.value, {
      name: form.elements.name.value,
      price: form.elements.price.value,
      command: form.elements.command.value,
      perks: perksFrom(form.elements.perks.value),
    });
  });

  document.getElementById("commandsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = form.querySelector("[data-msg]");
    try {
      state.data.commands = await api("/api/admin/commands", {
        method: "PUT",
        body: { rubies: form.elements.rubies.value },
      });
      setMessage(message, "Saved.", true);
    } catch (error) {
      if (error.status === 401) return showLogin();
      setMessage(message, error.message, false);
    }
  });

  document.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      const { action, type, id } = actionButton.dataset;
      if (action === "edit") editItem(type, id);
      if (action === "delete") deleteItem(type, id);
      return;
    }

    const cancelButton = event.target.closest("[data-cancel]");
    if (cancelButton) {
      resetForm(cancelButton.closest("form").dataset.type);
    }
  });

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.tab;
      document.querySelectorAll("[data-tab]").forEach((tab) => {
        tab.classList.toggle("active", tab === button);
      });
      document.querySelectorAll("[data-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.panel !== state.tab;
      });
    });
  });

  async function init() {
    try {
      await api("/api/admin/session");
      showDashboard();
      await loadData();
    } catch (error) {
      showLogin();
    }
  }

  init();
})();
