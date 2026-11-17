(function () {
  function spawnEmbers() {
    const container = document.getElementById("embers");
    if (!container) return;
    const colors = ["#d9a44f", "#c62f3e", "#f0c574"];
    for (let i = 0; i < 24; i++) {
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

  async function checkOrder() {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("order");
    const detailsEl = document.getElementById("orderDetails");
    const msgEl = document.getElementById("successMsg");
    if (!orderId) return;

    try {
      const resp = await fetch(`/api/payments/stripe/order/${orderId}`);
      if (!resp.ok) return;
      const order = await resp.json();
      detailsEl.textContent = `Order #${order.id.slice(0, 8)} · Status: ${order.status}`;
      if (order.status === "fulfilled") {
        msgEl.textContent = "Your rubies have been delivered. Enjoy the hunt.";
      } else if (order.status === "paid") {
        msgEl.textContent = "Payment confirmed. Delivering your rubies now.";
      }
    } catch (e) {
      return;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    spawnEmbers();
    checkOrder();
  });
})();
