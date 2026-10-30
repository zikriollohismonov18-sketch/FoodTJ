
/*
 FoodTJ Wallet
 Пур кардани ҳамён ва тасдиқи Admin
*/

(function () {
  "use strict";

  const TOPUPS = "foodtj_wallet_topup_requests";
  const ACCOUNTS = "foodtj_wallet_accounts";
  const TRANSACTIONS = "foodtj_wallet_transactions";

  const $ = id => document.getElementById(id);

  const safe = value =>
    String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);

  function client() {
    if (typeof sb !== "undefined" && sb?.auth) return sb;

    if (
      typeof supabaseClient !== "undefined" &&
      supabaseClient?.auth
    ) {
      return supabaseClient;
    }

    throw new Error("Supabase пайваст нест.");
  }

  let user = null;
  let role = null;

  function notify(text, isError = false) {
    const el = $("foodtjWalletNotice");

    if (el) {
      el.textContent = text;
      el.style.color = isError ? "#ff6262" : "#b8ff45";
    } else {
      alert(text);
    }
  }

  function createPanel() {
    if ($("foodtjWalletPanel")) return;

    const section = document.createElement("section");
    section.id = "foodtjWalletPanel";

    section.style.cssText = `
      max-width:1000px;
      margin:25px auto;
      padding:20px;
      border-radius:16px;
      background:#111922;
      border:1px solid #263442;
      color:#f5f7fa;
      font-family:Arial,sans-serif;
    `;

    section.innerHTML = `
      <h2>💳 FoodTJ Wallet</h2>

      <p id="foodtjWalletNotice" role="status"></p>

      <div id="foodtjWalletGuest">
        Барои истифодаи ҳамён ворид шавед.
      </div>

      <div id="foodtjWalletUser" hidden>

        <h3>Бақияи ҳамён</h3>

        <h2 id="foodtjWalletBalance">
          0.00 сомонӣ
        </h2>

        <h3>Пур кардани ҳамён</h3>

        <form id="foodtjWalletForm">

          <label>
            Маблағ (сомонӣ)
            <input
              id="foodtjWalletAmount"
              type="number"
              min="20"
              max="5000"
              step="0.01"
              value="20"
              required
              style="padding:12px;margin:8px;color:black"
            >
          </label>

          <label>
            Усули пардохт
            <select
              id="foodtjWalletMethod"
              style="padding:12px;margin:8px;color:black"
            >
              <option value="alif">Alif Mobi</option>
              <option value="dushanbe_city">
                Dushanbe City
              </option>
              <option value="eskhata">Эсхата</option>
              <option value="cash">Пули нақд</option>
            </select>
          </label>

          <button type="submit">
            💰 Дархости пуркунӣ
          </button>

        </form>

        <p style="font-size:13px;color:#99a6b5">
          Дархост худ аз худ маблағ намегузаронад.
          Баъди гирифтани пардохти воқеӣ Admin
          дархостро тасдиқ мекунад.
        </p>

        <h3>Таърихи дархостҳо</h3>

        <div id="foodtjWalletRequests"></div>

        <h3>Таърихи амалиётҳо</h3>

        <div id="foodtjWalletTransactions"></div>

      </div>

      <div id="foodtjWalletAdmin" hidden>

        <hr style="margin:25px 0">

        <h2>🛡️ Super Admin — Wallet</h2>

        <button
          id="foodtjWalletRefresh"
          type="button"
        >
          🔄 Навсозӣ
        </button>

        <h3>Дархостҳои интизор</h3>

        <div id="foodtjWalletPending"></div>

      </div>
    `;

    document.body.appendChild(section);

    $("foodtjWalletForm").addEventListener(
      "submit",
      submitTopup
    );

    $("foodtjWalletRefresh").addEventListener(
      "click",
      refresh
    );

    $("foodtjWalletPending").addEventListener(
      "click",
      handleAdminClick
    );
  }

  async function loadUser() {
    const { data, error } = await client().auth.getUser();

    if (error) throw error;

    user = data.user;
    role = null;

    if (user) {
      const result = await client()
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (result.error) throw result.error;

      role = result.data?.role || null;
    }

    $("foodtjWalletGuest").hidden = !!user;
    $("foodtjWalletUser").hidden = !user;
    $("foodtjWalletAdmin").hidden =
      !user || role !== "admin";
  }

  async function submitTopup(event) {
    event.preventDefault();

    const button = event.submitter ||
      $("foodtjWalletForm").querySelector("button");

    button.disabled = true;

    try {
      await loadUser();

      if (!user) {
        throw new Error("Аввал ба аккаунт ворид шавед.");
      }

      const amount = Number(
        $("foodtjWalletAmount").value
      );

      const method = $("foodtjWalletMethod").value;

      if (
        !Number.isFinite(amount) ||
        amount < 20 ||
        amount > 5000
      ) {
        throw new Error(
          "Маблағ бояд аз 20 то 5000 сомонӣ бошад."
        );
      }

      const { error } = await client()
        .from(TOPUPS)
        .insert({
          user_id: user.id,
          amount,
          method,
          status: "pending"
        });

      if (error) throw error;

      notify(
        "✅ Дархости " + amount +
        " сомонӣ фиристода шуд."
      );

      await refresh();

    } catch (error) {
      console.error(error);
      notify(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function loadBalance() {
    const { data, error } = await client()
      .from(ACCOUNTS)
      .select("balance,currency")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    const balance = Number(data?.balance || 0);

    $("foodtjWalletBalance").textContent =
      balance.toFixed(2) + " сомонӣ";
  }

  async function loadRequests() {
    const { data, error } = await client()
      .from(TOPUPS)
      .select(
        "id,amount,method,status,created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;

    $("foodtjWalletRequests").innerHTML =
      data.length
        ? data.map(r => `
          <div style="
            padding:12px;
            margin:8px 0;
            border:1px solid #263442;
            border-radius:10px
          ">
            <strong>${safe(r.amount)} сомонӣ</strong>
            <p>Усул: ${safe(r.method)}</p>
            <p>Ҳолат: ${safe(r.status)}</p>
          </div>
        `).join("")
        : "<p>Ҳоло дархост нест.</p>";
  }

  async function loadTransactions() {
    const { data, error } = await client()
      .from(TRANSACTIONS)
      .select(
        "amount,transaction_type,status,created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;

    $("foodtjWalletTransactions").innerHTML =
      data.length
        ? data.map(t => `
          <div style="
            padding:10px;
            border-bottom:1px solid #263442
          ">
            ${safe(t.transaction_type)}
            — ${safe(t.amount)} сомонӣ
            (${safe(t.status)})
          </div>
        `).join("")
        : "<p>Ҳоло амалиёт нест.</p>";
  }

  async function loadAdminRequests() {
    if (role !== "admin") return;

    const { data, error } = await client()
      .from(TOPUPS)
      .select(
        "id,user_id,amount,method,status,created_at"
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) throw error;

    $("foodtjWalletPending").innerHTML =
      data.length
        ? data.map(r => `
          <div style="
            padding:15px;
            margin:10px 0;
            border:1px solid #263442;
            border-radius:12px
          ">
            <h3>💰 ${safe(r.amount)} сомонӣ</h3>

            <p>Усул: ${safe(r.method)}</p>

            <p style="overflow-wrap:anywhere">
              User ID: ${safe(r.user_id)}
            </p>

            <button
              data-wallet-id="${safe(r.id)}"
              data-wallet-action="approved"
            >
              ✅ Тасдиқ
            </button>

            <button
              data-wallet-id="${safe(r.id)}"
              data-wallet-action="rejected"
            >
              ❌ Рад
            </button>
          </div>
        `).join("")
        : "<p>Дархости интизор нест.</p>";
  }

  async function handleAdminClick(event) {
    const button = event.target.closest(
      "button[data-wallet-action]"
    );

    if (!button) return;

    const id = button.dataset.walletId;
    const decision = button.dataset.walletAction;

    const note = prompt(
      decision === "approved"
        ? "Маълумоти тасдиқи пардохт:"
        : "Сабаби рад кардани дархост:",
      ""
    );

    if (note === null) return;

    if (decision === "approved") {
      const confirmed = confirm(
        "Оё маблағ воқеан ба ҳисоби FoodTJ ворид шудааст?"
      );

      if (!confirmed) return;
    }

    button.disabled = true;

    try {
      const { error } = await client().rpc(
        "foodtj_review_wallet_topup",
        {
          p_request_id: id,
          p_decision: decision,
          p_admin_note: note
        }
      );

      if (error) throw error;

      notify(
        decision === "approved"
          ? "✅ Пардохт тасдиқ шуд."
          : "Дархост рад карда шуд."
      );

      await refresh();

    } catch (error) {
      notify(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function refresh() {
    try {
      await loadUser();

      if (!user) return;

      await loadBalance();
      await loadRequests();
      await loadTransactions();
      await loadAdminRequests();

    } catch (error) {
      console.error("FoodTJ Wallet:", error);
      notify(error.message, true);
    }
  }

  function start() {
    createPanel();
    refresh();

    try {
      client().auth.onAuthStateChange(() => {
        setTimeout(refresh, 0);
      });
    } catch (error) {
      notify(error.message, true);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      start
    );
  } else {
    start();
  }

})();
