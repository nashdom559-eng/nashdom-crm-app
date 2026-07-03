document.addEventListener('DOMContentLoaded', loadData);

function loadData() {
  showStatus('Загружаю заявки...');

  const callbackName = 'nashdomCallback_' + Date.now();

  window[callbackName] = function(response) {
    delete window[callbackName];

    const script = document.getElementById(callbackName);
    if (script) script.remove();

    if (!response || !response.ok) {
      showStatus('Ошибка: ' + (response?.error || 'неизвестная ошибка'), true);
      return;
    }

    renderRequests(response.result.acceptedRequests || []);
  };

  const script = document.createElement('script');
  script.id = callbackName;
  script.src =
    API_URL +
    '?api=1' +
    '&action=getAppData' +
    '&callback=' + encodeURIComponent(callbackName) +
    '&t=' + Date.now();

  script.onerror = function() {
    showStatus('Не удалось подключиться к серверу', true);
  };

  document.body.appendChild(script);
}

function renderRequests(requests) {
  const container = document.getElementById('requests');

  if (!requests.length) {
    container.innerHTML = '<div class="empty">Активных заявок нет</div>';
    showStatus('Данные загружены');
    return;
  }

  container.innerHTML = requests.map(function(req) {
    return `
      <div class="request-card">
        <div class="request-top">
          <strong>🏠 ${escapeHtml(req.house)} · кв. ${escapeHtml(req.flat)}</strong>
          <span>${escapeHtml(req.id)}</span>
        </div>

        <div class="person">
          👤 ${escapeHtml(req.name || 'ФИО не указано')}
        </div>

        <div class="phone">
          📞 ${escapeHtml(req.phone || 'Телефон не указан')}
        </div>

        <div class="description">
          ${escapeHtml(req.description)}
        </div>

        <div class="footer">
          <span>${escapeHtml(req.status)}</span>
          <span>${escapeHtml(req.planDate || '')}</span>
        </div>
      </div>
    `;
  }).join('');

  showStatus('Загружено заявок: ' + requests.length);
}

function showStatus(message, isError) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = isError ? 'status error' : 'status';
}

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}