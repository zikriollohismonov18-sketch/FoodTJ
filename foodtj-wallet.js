
/* FoodTJ Wallet — ҳамёни электронӣ */
(() => {
  'use strict';

  const TABLE = 'foodtj_wallet_topup_requests';
  const $ = id => document.getElementById(id);

  const escapeHtml = value =>
    String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c]);

  function getClient() {
    const client =
      typeof sb !== 'undefined' ? sb :
      typeof supabaseClient !== 'undefined' ? supabaseClient :
      null;

    if (!client || typeof client.from !== 'function') {
      throw new Error('Пайвасти Supabase ёфт нашуд.');
    }

    return client;
  }

  const state = {
    user: null,
    role: null
  };

  function notice(message, error = false) {
    const el = $('ftj-wallet-message');
    if (!el) return;

    el.textContent = message;
    el.style.color = error ? '#ff6b6b' : '#b8ff45';
  }

  function mount() {
    if ($('ftj-wallet-addon')) return;

    const panel = document.createElement('section');
    panel.id = 'ftj-wallet-addon';

    panel.style.cssText = `
      max-width:1000px;
      margin:24px auto;
      padding:20px;
      border:1px solid #374151;
      border-radius:15px;
      background:#111827;
      color:white;
      font-family:Arial,sans-serif;
    `;

    panel.innerHTML = `
      <h2>💳 FoodTJ — Ҳамён</h2>

      <p id="ftj-wallet-message" role="status"></p>

      <div id="ftj-wallet-guest">
        Барои истифодаи ҳамён аввал ворид шавед.
      </div>

      <div id="ftj-wallet-user" hidden>
        <h3>Пур кардани ҳамён</h3>

        <form id="ftj-wallet-form"
          style="display:flex;flex-wrap:wrap;gap:12px">

          <label>
            Маблағ (сомонӣ)
            <input
              id="ftj-wallet-amount"
              type="number"
              min="20"
              max="5000"
              step="0.01"
              required
              style="padding:10px;color:black"
            >
          </label>

          <label>
            Усули пардохт
            <select id="ftj-wallet-method"
              style="padding:10px;color:black">

              <option value="alif">Alif Mobi</option>
              <option value="dushanbe_city">Dushanbe City</option>
              <option value="eskhata">Эсхата</option>
              <option value="cash">Пули нақд</option>

            </select>
          </label>

          <button type="submit">
            📤 Фиристодани дархост
          </button>
        </form>

        <p style="font-size:13px">
          Ин дархост пулро худкор намегузаронад.
          Аввал маблағро ба ҳисоби расмии FoodTJ
          пардохт кунед. Баъди санҷиши Admin
          ҳамёни шумо пур мешавад.
        </p>

        <h3>📋 Дархостҳои ман</h3>
        <div id="ftj-wallet-mine">
          Бор мешавад...
        </div>
      </div>

      <div id="ftj-wallet-admin" hidden>
        <h3>🛡️ Super Admin — Дархостҳои пуркунӣ</h3>

        <button id="ftj-wallet-reload" type="button">
          🔄 Навсозӣ
        </button>

        <div id="ftj-wallet-pending"
          style="margin-top:15px">
          Бор мешавад...
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    $('ftj-wallet-form').addEventListener(
      'submit',
      createRequest
    );

    $('ftj-wallet-reload').addEventListener(
      'click',
      refresh
    );

    $('ftj-wallet-pending').addEventListener(
      'click',
      reviewClick
    );
  }

  async function identify() {
    const client = getClient();

    const { data, error } = await client.auth.getUser();
    if (error) throw error;

    state.user = data.user;
    state.role = null;

    if (state.user) {
      const result = await client
        .from('profiles')
        .select('role')
        .eq('id', state.user.id)
        .maybeSingle();

      if (result.error) throw result.error;

      state.role = result.data?.role;
    }

    $('ftj-wallet-guest').hidden = !!state.user;
    $('ftj-wallet-user').hidden = !state.user;

    $('ftj-wallet-admin').hidden =
      !state.user || state.role !== 'admin';
  }

  async function createRequest(event) {
    event.preventDefault();

    const button = $('ftj-wallet-form')
      .querySelector('button');

    button.disabled = true;

    try {
      await identify();

      if (!state.user) {
        throw new Error('Аввал ворид шавед.');
      }

      const amount = Number(
        $('ftj-wallet-amount').value
      );

      const method = $('ftj-wallet-method').value;

      if (
        !Number.isFinite(amount) ||
        amount < 20 ||
        amount > 5000
      ) {
        throw new Error(
          'Маблағ бояд аз 20 то 5000 сомонӣ бошад.'
        );
      }

      const { error } = await getClient()
        .from(TABLE)
        .insert({
          user_id: state.user.id,
          amount: amount,
          method: method,
          status: 'pending'
        });

      if (error) throw error;

      notice(
        '✅ Дархост сабт шуд. Интизори тасдиқи пардохт.'
      );

      $('ftj-wallet-form').reset();

      await refresh();

    } catch (error) {
      notice(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function reviewClick(event) {
    const button = event.target.closest(
      'button[data-review]'
    );

    if (!button) return;

    const requestId = button.dataset.id;
    const decision = button.dataset.review;

    const note = prompt(
      decision === 'approved'
        ? 'Маълумоти тасдиқи пардохтро нависед:'
        : 'Сабаби рад кардани дархост:',
      ''
    );

    if (note === null) return;

    if (decision === 'approved') {
      const confirmed = confirm(
        'Оё пул воқеан ба ҳисоби FoodTJ ворид шудааст?'
      );

      if (!confirmed) return;
    }

    button.disabled = true;

    try {
      const { data, error } = await getClient().rpc(
        'foodtj_review_wallet_topup',
        {
          p_request_id: requestId,
          p_decision: decision,
          p_admin_note: note
        }
      );

      if (error) throw error;

      notice(
        decision === 'approved'
          ? '✅ Пардохт тасдиқ шуд. Ҳамён пур гардид.'
          : '❌ Дархост рад карда шуд.'
      );

      await refresh();

      return data;

    } catch (error) {
      notice(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function refresh() {
    try {
      await identify();

      if (!state.user) return;

      const client = getClient();

      const mine = await client
        .from(TABLE)
        .select('id,amount,method,status,created_at')
        .eq('user_id', state.user.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (mine.error) throw mine.error;

      $('ftj-wallet-mine').innerHTML =
        mine.data.length
          ? mine.data.map(r => `
              <div style="
                padding:10px;
                border-bottom:1px solid #374151
              ">
                <strong>${escapeHtml(r.amount)} TJS</strong>
                <p>Усул: ${escapeHtml(r.method)}</p>
                <p>Ҳолат: ${escapeHtml(r.status)}</p>
                <small>
                  ${escapeHtml(
                    new Date(r.created_at).toLocaleString()
                  )}
                </small>
              </div>
            `).join('')
          : 'Ҳоло дархост нест.';

      if (state.role === 'admin') {
        const pending = await client
          .from(TABLE)
          .select(
            'id,user_id,amount,method,status,created_at'
          )
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(100);

        if (pending.error) throw pending.error;

        $('ftj-wallet-pending').innerHTML =
          pending.data.length
            ? pending.data.map(r => `
                <div style="
                  padding:15px;
                  margin-bottom:10px;
                  border:1px solid #374151;
                  border-radius:10px
                ">
                  <h3>
                    💰 ${escapeHtml(r.amount)} TJS
                  </h3>

                  <p>
                    Усул: ${escapeHtml(r.method)}
                  </p>

                  <p style="overflow-wrap:anywhere">
                    Муштарӣ: ${escapeHtml(r.user_id)}
                  </p>

                  <p>
                    ${escapeHtml(
                      new Date(r.created_at).toLocaleString()
                    )}
                  </p>

                  <button
                    data-review="approved"
                    data-id="${escapeHtml(r.id)}">
                    ✅ Тасдиқ
                  </button>

                  <button
                    data-review="rejected"
                    data-id="${escapeHtml(r.id)}">
                    ❌ Рад
                  </button>
                </div>
              `).join('')
            : 'Ҳоло дархости интизор нест.';
      }

    } catch (error) {
      notice(error.message, true);
    }
  }

  function start() {
    mount();
    refresh();

    try {
      getClient().auth.onAuthStateChange(() => {
        setTimeout(refresh, 0);
      });
    } catch (error) {
      notice(error.message, true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
