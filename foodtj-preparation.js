
/* FoodTJ — Preparation & Courier
   Илова ба index.html, бе нест кардани кодҳои пешина.
*/
'use strict';

(function () {
  const $p = id => document.getElementById(id);

  const safe = value => String(value ?? '').replace(
    /[&<>"']/g,
    c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c]
  );

  const statusNames = {
    new: 'Фармоиши нав',
    accepted: 'Қабулшуда',
    preparing: 'Хӯрок тайёр мешавад',
    ready_for_pickup: 'Хӯрок тайёр аст',
    picked_up: 'Курьер гирифт',
    delivering: 'Дар роҳ',
    delivered: 'Расонида шуд',
    cancelled: 'Бекоршуда'
  };

  let refreshing = false;
  let lastReminder = new Set();

  function message(text, error = false) {
    const el = $p('notice');
    if (!el) {
      alert(text);
      return;
    }
    el.textContent = text;
    el.classList.remove('hidden');
    el.classList.toggle('error', error);
    el.classList.toggle('success', !error);
  }

  async function rpc(name, params) {
    const { data, error } = await sb.rpc(name, params);
    if (error) throw error;
    return data;
  }

  async function changeRestaurantStatus(id, status) {
    await rpc('foodtj_restaurant_update_order_status', {
      p_order_id: id,
      p_new_status: status
    });
  }

  function minutesLeft(date) {
    if (!date) return null;
    return Math.max(
      0,
      Math.ceil((new Date(date).getTime() - Date.now()) / 60000)
    );
  }

  function restaurantButtons(order) {
    const id = safe(order.id);
    const status = order.status;
    let html = '';

    if (status === 'new') {
      html += `
        <button data-prep-action="accept" data-id="${id}">
          Қабули фармоиш
        </button>
        <button class="danger"
          data-prep-action="cancel" data-id="${id}">
          Бекор кардан
        </button>
      `;
    }

    if (status === 'accepted') {
      html += `
        <button data-prep-action="start" data-id="${id}">
          Оғози тайёркунӣ
        </button>
      `;
    }

    if (status === 'accepted' || status === 'preparing') {
      html += `
        <label style="display:block;margin:10px 0">
          Вақти тайёршавӣ:
          <select data-prep-minutes="${id}">
            <option value="10">10 дақиқа</option>
            <option value="15">15 дақиқа</option>
            <option value="20">20 дақиқа</option>
            <option value="30">30 дақиқа</option>
            <option value="45">45 дақиқа</option>
            <option value="60">60 дақиқа</option>
          </select>
        </label>
        <button data-prep-action="set-time" data-id="${id}">
          Нигоҳ доштани вақт
        </button>
      `;
    }

    if (status === 'preparing') {
      const remaining = minutesLeft(order.estimated_ready_at);
      const canRequest = order.estimated_ready_at &&
        new Date(order.estimated_ready_at).getTime()
          <= Date.now() + 5 * 60000;

      html += `
        <p class="muted">
          ${remaining === null
            ? 'Аввал вақти тайёршавиро муайян кунед'
            : 'То омодашавӣ: ' + remaining + ' дақиқа'}
        </p>
      `;

      if (order.courier_requested_at) {
        html += `
          <p class="status">Курьер даъват шудааст</p>
        `;
      } else {
        html += `
          <button data-prep-action="request"
            data-id="${id}"
            ${canRequest ? '' : 'disabled'}>
            🛵 Курьер лозим аст
          </button>
        `;
      }

      html += `
        <button data-prep-action="ready" data-id="${id}">
          🍲 Хӯрок тайёр аст
        </button>
      `;
    }

    if (order.courier_id) {
      html += `
        <p class="status">
          ✅ Курьер фармоишро қабул кардааст
        </p>
      `;
    }

    return html;
  }

  async function loadPreparationOrders() {
    if (!currentUser || profile?.role !== 'restaurant') {
      return;
    }

    const container = $p('restaurantOrders');
    if (!container) return;

    const { data: restaurants, error: restError } =
      await sb.from('restaurants')
        .select('id,name')
        .eq('owner_id', currentUser.id);

    if (restError) throw restError;

    const ids = (restaurants || []).map(r => r.id);

    if (!ids.length) {
      container.innerHTML =
        '<div class="empty">Ҳоло ресторан надоред.</div>';
      return;
    }

    const { data: orders, error } =
      await sb.from('orders')
        .select('*')
        .in('restaurant_id', ids)
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) throw error;

    const restaurantNames = Object.fromEntries(
      restaurants.map(r => [r.id, r.name])
    );

    container.innerHTML = (orders || []).map(o => `
      <div class="card order-card">
        <h3>📦 Фармоиш #${safe(o.id.slice(0, 8))}</h3>
        <p>🍽️ ${safe(restaurantNames[o.restaurant_id])}</p>
        <p>Ҳолат:
          <strong>${safe(statusNames[o.status] || o.status)}</strong>
        </p>
        <p>Маблағ: ${safe(o.total)} сомонӣ</p>
        <p>Суроға: ${safe(o.delivery_address)}</p>
        <div class="stack">
          ${restaurantButtons(o)}
        </div>
      </div>
    `).join('') ||
      '<div class="empty">Фармоиш нест.</div>';

    for (const o of orders || []) {
      if (
        o.status === 'preparing' &&
        o.estimated_ready_at &&
        !o.courier_requested_at &&
        new Date(o.estimated_ready_at).getTime()
          <= Date.now() + 5 * 60000 &&
        !lastReminder.has(o.id)
      ) {
        lastReminder.add(o.id);
        message(
          '⏰ Фармоиш #' + o.id.slice(0, 8) +
          ': 5 дақиқа ё камтар мондааст. Курьерро даъват кунед!'
        );
      }
    }
  }

  async function loadNewCourierOrders() {
    if (!currentUser || profile?.role !== 'courier') return;

    const container = $p('courierOrders');
    if (!container) return;

    const available = await rpc('foodtj_available_orders', {});

    const { data: mine, error } =
      await sb.from('orders')
        .select('*')
        .eq('courier_id', currentUser.id)
        .in('status', [
          'preparing',
          'ready_for_pickup',
          'picked_up',
          'delivering'
        ])
        .order('created_at', { ascending: false });

    if (error) throw error;

    const availableHtml = (available || []).map(o => `
      <div class="card order-card">
        <h3>📦 #${safe(o.id.slice(0, 8))}</h3>
        <p>${safe(o.delivery_address)}</p>
        <p>${safe(statusNames[o.status] || o.status)}</p>
        <p>${safe(o.total)} сомонӣ</p>
        <button data-prep-action="claim"
          data-id="${safe(o.id)}">
          🛵 Қабул кардани фармоиш
        </button>
      </div>
    `).join('') ||
      '<div class="empty">Фармоиши дастрас нест.</div>';

    const mineHtml = (mine || []).map(o => {
      let button = '';

      if (o.status === 'preparing') {
        button = '<p>⏳ Хӯрок ҳоло тайёр мешавад.</p>';
      }

      if (o.status === 'ready_for_pickup') {
        button = `
          <button data-prep-action="picked_up"
            data-id="${safe(o.id)}">
            📦 Хӯрокро гирифтам
          </button>
        `;
      }

      if (o.status === 'picked_up') {
        button = `
          <button data-prep-action="delivering"
            data-id="${safe(o.id)}">
            🚗 Ба роҳ баромадам
          </button>
        `;
      }

      if (o.status === 'delivering') {
        button = `
          <button data-prep-action="delivered"
            data-id="${safe(o.id)}">
            ✅ Расонида шуд
          </button>
        `;
      }

      return `
        <div class="card order-card">
          <h3>📦 #${safe(o.id.slice(0, 8))}</h3>
          <p>${safe(o.delivery_address)}</p>
          <p>${safe(statusNames[o.status] || o.status)}</p>
          ${button}
        </div>
      `;
    }).join('') ||
      '<div class="empty">Фармоиши қабулшуда нест.</div>';

    container.innerHTML = `
      <h3>🛵 Фармоишҳои дастрас</h3>
      ${availableHtml}
      <h3 style="margin-top:22px">📦 Фармоишҳои ман</h3>
      ${mineHtml}
    `;
  }

  async function refreshPreparation() {
    if (refreshing || !currentUser) return;
    refreshing = true;

    try {
      if (profile?.role === 'restaurant') {
        await loadPreparationOrders();
      } else if (profile?.role === 'courier') {
        await loadNewCourierOrders();
      }
    } catch (error) {
      console.error('FoodTJ preparation:', error);
    } finally {
      refreshing = false;
    }
  }

  document.addEventListener('click', async event => {
    const btn = event.target.closest('[data-prep-action]');
    if (!btn) return;

    const action = btn.dataset.prepAction;
    const id = btn.dataset.id;

    btn.disabled = true;

    try {
      if (action === 'accept') {
        await changeRestaurantStatus(id, 'accepted');
      }

      if (action === 'cancel') {
        if (!confirm('Фармоиш бекор карда шавад?')) {
          return;
        }
        await changeRestaurantStatus(id, 'cancelled');
      }

      if (action === 'start') {
        await changeRestaurantStatus(id, 'preparing');
      }

      if (action === 'set-time') {
        const select = document.querySelector(
          '[data-prep-minutes="' + id + '"]'
        );

        await rpc('foodtj_set_preparation_time', {
          p_order_id: id,
          p_minutes: Number(select?.value || 15)
        });
      }

      if (action === 'request') {
        await rpc('foodtj_request_courier', {
          p_order_id: id
        });
      }

      if (action === 'ready') {
        await rpc('foodtj_mark_food_ready', {
          p_order_id: id
        });
      }

      if (action === 'claim') {
        await rpc('foodtj_claim_order', {
          p_order_id: id
        });
      }

      if (['picked_up', 'delivering', 'delivered'].includes(action)) {
        await rpc('foodtj_courier_update_order_status', {
          p_order_id: id,
          p_new_status: action
        });
      }

      message('✅ Амал бомуваффақият иҷро шуд.');
      await refreshPreparation();

    } catch (error) {
      console.error(error);
      message(error.message || 'Хатогӣ рух дод', true);
    } finally {
      btn.disabled = false;
    }
  });

  // Навсозии функсияҳои кӯҳна бе нест кардани онҳо.
  if (typeof loadCourierOrders === 'function') {
    loadCourierOrders = loadNewCourierOrders;
  }

  if (typeof loadOwnerData === 'function') {
    const originalLoadOwnerData = loadOwnerData;

    loadOwnerData = async function () {
      await originalLoadOwnerData();
      await loadPreparationOrders();
    };
  }

  setInterval(refreshPreparation, 30000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshPreparation();
  });

  setTimeout(refreshPreparation, 1500);

  console.log('FoodTJ preparation module loaded');
})();
