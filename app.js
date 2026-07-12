const ACCESS_KEY_STORAGE = 'nashdom_api_access_key';

function getAccessKey() {
  let key = localStorage.getItem(ACCESS_KEY_STORAGE) || '';

  if (!key) {
    key = window.prompt('Введите ключ доступа к НашДом CRM:') || '';
    key = key.trim();

    if (key) {
      localStorage.setItem(ACCESS_KEY_STORAGE, key);
    }
  }

  return key;
}

function resetAccessKey() {
  localStorage.removeItem(ACCESS_KEY_STORAGE);
  location.reload();
}

const CRM = {
  data: {
    houses: [],
    contacts: [],
    acceptedRequests: [],
    allRequests: []
  },
  state: {
    currentDoneRowNumber: null,
    currentPlanRowNumber: null,
    currentHoldRowNumber: null,
    currentEmergencyRowNumber: null,
    currentEditRowNumber: null,
    currentReopenRowNumber: null,
    currentDeleteRowNumber: null,
    journalFilter: 'all'
  }
};

document.addEventListener('DOMContentLoaded', function() {
  attachFormEvents();

  if (getAccessKey()) {
    loadData();
  } else {
    showStatus('Нужен ключ доступа', true);
  }
});

function apiCall(action, payload, onSuccess, onError) {
  const callbackName =
    'nashdomCallback_' +
    Date.now() +
    '_' +
    Math.floor(Math.random() * 100000);

  window[callbackName] = function(response) {
    cleanup();

    if (!response || !response.ok) {
      const message =
        response && response.error
          ? response.error
          : 'Неизвестная ошибка сервера';

      if (message === 'Доступ запрещён') {
        localStorage.removeItem(ACCESS_KEY_STORAGE);
        window.alert('Неверный ключ доступа. Введите его заново.');
        location.reload();
        return;
      }

      if (onError) onError(message);
      return;
    }

    if (onSuccess) onSuccess(response.result);
  };

  const script = document.createElement('script');
  script.id = callbackName;

  let url =
    API_URL +
    '?api=1' +
    '&action=' + encodeURIComponent(action) +
    '&callback=' + encodeURIComponent(callbackName) +
    '&token=' + encodeURIComponent(getAccessKey()) +
    '&t=' + Date.now();

  if (payload) {
    url +=
      '&payload=' +
      encodeURIComponent(JSON.stringify(payload));
  }

  script.src = url;

  script.onerror = function() {
    cleanup();

    if (onError) {
      onError('Не удалось подключиться к серверу');
    }
  };

  function cleanup() {
    delete window[callbackName];

    const oldScript = document.getElementById(callbackName);
    if (oldScript) oldScript.remove();
  }

  document.body.appendChild(script);
}

function loadData() {
  showStatus('Загружаю данные...');

  apiCall(
    'getAppData',
    null,
    function(data) {
      CRM.data = data || {
        houses: [],
        contacts: [],
        acceptedRequests: [],
        allRequests: []
      };

      fillHouseSelect();
      fillEditHouseSelect();
      renderDashboard();
      renderAcceptedRequests();
      runSearch();

      showStatus('');
    },
    function(error) {
      showStatus('Ошибка загрузки: ' + error, true);
    }
  );
}

function showView(viewName) {
  document.querySelectorAll('.view').forEach(function(view) {
    view.classList.remove('active');
  });

  const view =
    document.getElementById('view' + capitalize(viewName));

  if (view) view.classList.add('active');

  document
    .querySelectorAll('.bottom-nav button')
    .forEach(function(button) {
      button.classList.remove('active');
    });

  const navButton = document.querySelector(
    '.bottom-nav button[data-view="' + viewName + '"]'
  );

  if (navButton) navButton.classList.add('active');

  window.scrollTo(0, 0);
}

function fillHouseSelect() {
  const select = document.getElementById('house');
  if (!select) return;

  const currentValue = select.value;

  select.innerHTML = '';

  (CRM.data.houses || []).forEach(function(house) {
    const option = document.createElement('option');
    option.value = house;
    option.textContent = house;
    select.appendChild(option);
  });

  if (currentValue) {
    select.value = currentValue;
  }
}


function setupFastRequestFlow() {
  const house = document.getElementById('house');
  const flat = document.getElementById('flat');
  const description = document.getElementById('description');

  if (house && !house.dataset.fastFlowReady) {
    house.dataset.fastFlowReady = '1';

    house.addEventListener('change', function() {
      window.setTimeout(function() {
        if (flat) {
          flat.focus();
          try {
            flat.setSelectionRange(flat.value.length, flat.value.length);
          } catch (e) {}
        }
      }, 120);
    });
  }

  if (flat && !flat.dataset.fastFlowReady) {
    flat.dataset.fastFlowReady = '1';

    flat.addEventListener('keydown', function(event) {
      if (event.key === 'Enter') {
        event.preventDefault();

        if (description) {
          description.focus();
        }
      }
    });
  }
}

function fillEditHouseSelect() {
  const select = document.getElementById('editHouse');
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = '';

  (CRM.data.houses || []).forEach(function(house) {
    const option = document.createElement('option');
    option.value = house;
    option.textContent = house;
    select.appendChild(option);
  });

  if (currentValue) select.value = currentValue;
}

function saveRequest() {
  const btn = document.getElementById('saveBtn');

  const data = {
    house: getValue('house'),
    flat: getValue('flat'),
    description: getValue('description'),
    name: getValue('name'),
    phone: getValue('phone'),
    planDate: getValue('planDate'),
    isEmergency: getChecked('isEmergency')
  };

  if (!data.house) {
    return showStatus('Выбери дом', true);
  }

  if (!data.flat) {
    return showStatus('Заполни квартиру', true);
  }

  if (!data.description) {
    return showStatus('Заполни заявку', true);
  }

  btn.disabled = true;
  btn.textContent = 'Сохраняю...';

  apiCall(
    'addRequest',
    data,
    function(result) {
      showStatus(result.message || 'Заявка сохранена');

      clearNewRequestForm();

      btn.disabled = false;
      btn.textContent = '✓ Сохранено';

      loadData();

      setTimeout(function() {
        btn.textContent = 'Сохранить заявку';
      }, 1000);
    },
    function(error) {
      showStatus('Ошибка сохранения: ' + error, true);

      btn.disabled = false;
      btn.textContent = 'Сохранить заявку';
    }
  );
}

function renderDashboard() {
  const statsBox = document.getElementById('dashboardStats');
  const todayBox = document.getElementById('todayRequests');

  if (!statsBox || !todayBox) return;

  const active = CRM.data.acceptedRequests || [];
  const all = CRM.data.allRequests || [];

  const emergencies = active.filter(function(req) {
    return req.isEmergency;
  });

  const regularActive = active.filter(function(req) {
    return !req.isEmergency;
  });

  const overdue = regularActive.filter(isOverdue);

  const todayPlanned = regularActive.filter(function(req) {
    return isTodayPlanned(req) && !isOverdue(req);
  });

  const waiting = regularActive.filter(function(req) {
    return req.status === 'Ожидает';
  });

  const otherActive = regularActive.filter(function(req) {
    return (
      req.status !== 'Ожидает' &&
      !isOverdue(req) &&
      !isTodayPlanned(req)
    );
  });

  const doneToday = all.filter(function(req) {
    return (
      req.status === 'Выполнено' &&
      isTodayIso(req.rawDoneDate)
    );
  });

  statsBox.innerHTML = `
    <div class="stat-card danger">
      <strong>${overdue.length}</strong>
      <span>Просрочено</span>
    </div>

    <div class="stat-card warning">
      <strong>${todayPlanned.length}</strong>
      <span>Сегодня</span>
    </div>

    <div class="stat-card primary">
      <strong>${active.length}</strong>
      <span>Активных</span>
    </div>

    <div class="stat-card success">
      <strong>${doneToday.length}</strong>
      <span>Выполнено</span>
    </div>
  `;

  const sections = [
    {
      title: '🚨 Текущие аварии',
      items: sortActiveRequests(emergencies)
    },
    {
      title: '🔴 Просрочено',
      items: sortActiveRequests(overdue)
    },
    {
      title: '🟡 Сегодня',
      items: sortActiveRequests(todayPlanned)
    },
    {
      title: '⏳ Ожидают',
      items: sortActiveRequests(waiting)
    },
    {
      title: '📋 Остальные активные',
      items: sortActiveRequests(otherActive).slice(0, 10)
    }
  ];

  const html = sections
    .filter(function(section) {
      return section.items.length > 0;
    })
    .map(function(section) {
      return `
        <div class="journal-title">${section.title}</div>

        ${section.items
          .map(function(req) {
            return renderRequestCard(req, true);
          })
          .join('')}
      `;
    })
    .join('');

  todayBox.innerHTML =
    html ||
    '<div class="empty-box">На сегодня задач нет</div>';
}

function renderAcceptedRequests() {
  const container =
    document.getElementById('acceptedRequests');

  if (!container) return;

  const requests = sortActiveRequests(
    CRM.data.acceptedRequests || []
  );

  if (!requests.length) {
    container.innerHTML =
      '<div class="empty-box">Активных заявок нет</div>';

    return;
  }

  container.innerHTML = requests
    .map(function(req) {
      return renderRequestCard(req, true);
    })
    .join('');
}

function renderRequestCard(req, showActions) {
  const statusClass = getRequestCardClass(req);

  const flat = req.flat
    ? ' кв. ' + escapeHtml(req.flat)
    : '';

  const name = req.name
    ? '<div class="request-person">👤 ' +
      escapeHtml(req.name) +
      '</div>'
    : '<div class="request-person muted">👤 ФИО не указано</div>';

  const phone = req.phone
    ? '<a class="phone-link" href="tel:' +
      escapeHtml(req.phone) +
      '">📞 ' +
      escapeHtml(formatPhone(req.phone)) +
      '</a>'
    : '<span class="request-meta">📞 телефон не указан</span>';

  const plan = req.planDate
    ? '<div class="request-plan">' +
      getPlanLabel(req) +
      '</div>'
    : '';

  const emergencyBadge = req.isEmergency
    ? '<div class="emergency-badge">🚨 Аварийная заявка</div>'
    : '';

  const emergencyTimeline = req.isEmergency
    ? renderEmergencyTimeline(req.emergencyTimeline || [])
    : '';

  const waitingInfo =
    req.status === 'Ожидает' && req.comment
      ? `
        <div class="waiting-box">
          <div>⏳ Ожидает</div>
          <div class="done-comment">
            ${escapeHtml(req.comment)}
          </div>
        </div>
      `
      : '';

  const doneInfo =
    req.status === 'Выполнено'
      ? `
        <div class="done-box">
          <div>
            ✅ Выполнено: ${escapeHtml(req.doneDate || '')}
          </div>

          ${
            req.comment
              ? '<div class="done-comment">💬 ' +
                escapeHtml(req.comment) +
                '</div>'
              : ''
          }
        </div>
      `
      : '';

  const actions =
    showActions && req.status !== 'Выполнено'
      ? req.isEmergency
        ? `
          <div class="emergency-actions">
            <button
              class="emergency-btn"
              onclick="openEmergencyModal(${Number(req.rowNumber)})"
            >
              🚨 Записать этап аварии
            </button>

            <div class="card-actions two-columns">
              <button
                class="plan-btn"
                onclick="openPlanModal(
                  ${Number(req.rowNumber)},
                  '${escapeJs(req.rawPlanDate || '')}'
                )"
              >
                ${getPlanButtonText(req)}
              </button>

              <button
                class="hold-btn"
                onclick="openHoldModal(${Number(req.rowNumber)})"
              >
                ⏳ Ожидает
              </button>
            </div>
          </div>
        `
        : `
          <div class="card-actions">
            <button
              class="plan-btn"
              onclick="openPlanModal(
                ${Number(req.rowNumber)},
                '${escapeJs(req.rawPlanDate || '')}'
              )"
            >
              ${getPlanButtonText(req)}
            </button>

            <button
              class="hold-btn"
              onclick="openHoldModal(${Number(req.rowNumber)})"
            >
              ⏳ Ожидает
            </button>

            <button
              class="small-btn"
              onclick="openDoneModal(${Number(req.rowNumber)})"
            >
              ✓ Выполнено
            </button>
          </div>
        `
      : '';

  return `
    <div class="request-card ${statusClass}">
      <div class="request-top">
        <div class="request-address">
          🏠 ${escapeHtml(req.house)}${flat}
        </div>

        <div class="request-id">
          ${escapeHtml(req.id)}
        </div>
      </div>

      ${emergencyBadge}
      ${name}

      <div class="request-meta">
        ${phone}
      </div>

      ${plan}

      <div class="request-desc">
        ${escapeHtml(req.description)}
      </div>

      <div class="request-footer">
        <span class="badge">
          ${escapeHtml(req.status || 'Принято')}
        </span>

        <span class="request-date">
          ${escapeHtml(req.date || '')}
        </span>
      </div>

      ${waitingInfo}
      ${emergencyTimeline}
      ${doneInfo}
      ${actions}
      ${renderManagementActions(req)}
    </div>
  `;
}

function renderManagementActions(req) {
  const editButton = `
    <button class="manage-btn edit-btn" onclick="openEditModal(${Number(req.rowNumber)})">
      ✏️ Редактировать
    </button>
  `;

  if (req.status === 'Выполнено') {
    return `
      <div class="management-actions">
        ${editButton}
        <button class="manage-btn reopen-btn" onclick="openReopenModal(${Number(req.rowNumber)})">
          ↩ Возобновить
        </button>
        <button class="manage-btn delete-btn" onclick="openDeleteModal(${Number(req.rowNumber)}, '${escapeJs(req.id || '')}')">
          🗑 Удалить
        </button>
      </div>
    `;
  }

  return `
    <div class="management-actions">
      ${editButton}
    </div>
  `;
}

function setJournalFilter(filter) {
  CRM.state.journalFilter = filter;

  document
    .querySelectorAll('.journal-filters button')
    .forEach(function(btn) {
      btn.classList.remove('active');
    });

  const activeBtn = document.querySelector(
    '.journal-filters button[data-filter="' +
      filter +
      '"]'
  );

  if (activeBtn) activeBtn.classList.add('active');

  runSearch();
}

function getFilteredJournalRequests() {
  const filter = CRM.state.journalFilter || 'all';
  const all = CRM.data.allRequests || [];

  if (filter === 'active') {
    return all.filter(function(req) {
      return (
        req.status !== 'Выполнено' &&
        req.status !== 'Ожидает'
      );
    });
  }

  if (filter === 'waiting') {
    return all.filter(function(req) {
      return req.status === 'Ожидает';
    });
  }

  if (filter === 'done') {
    return all.filter(function(req) {
      return req.status === 'Выполнено';
    });
  }

  return all;
}

function runSearch() {
  const container =
    document.getElementById('searchResults');

  if (!container) return;

  const query =
    getValue('searchInput').toLowerCase();

  const source = getFilteredJournalRequests();

  if (!query) {
    renderSearchResults(source.slice(0, 40));
    return;
  }

  const results = source.filter(function(req) {
    const text = [
      req.id,
      req.date,
      req.house,
      req.flat,
      req.name,
      req.phone,
      req.description,
      req.status,
      req.planDate,
      req.doneDate,
      req.comment
    ]
      .join(' ')
      .toLowerCase();

    return text.indexOf(query) !== -1;
  });

  renderSearchResults(results);
}

function renderSearchResults(results) {
  const container =
    document.getElementById('searchResults');

  if (!container) return;

  if (!results || !results.length) {
    container.innerHTML =
      '<div class="empty-box">Ничего не найдено</div>';

    return;
  }

  container.innerHTML =
    '<div class="journal-title">' +
    getJournalTitle() +
    '</div>' +
    results
      .map(function(req) {
        return renderRequestCard(
          req,
          req.status !== 'Выполнено'
        );
      })
      .join('');
}

function getJournalTitle() {
  const filter = CRM.state.journalFilter || 'all';

  if (filter === 'active') return 'Активные заявки';
  if (filter === 'waiting') return 'Заявки в ожидании';
  if (filter === 'done') return 'Выполненные заявки';

  return 'Все заявки';
}



function findRequestByRow(rowNumber) {
  return (CRM.data.allRequests || []).find(function(req) {
    return Number(req.rowNumber) === Number(rowNumber);
  }) || null;
}

function openEditModal(rowNumber) {
  const req = findRequestByRow(rowNumber);
  if (!req) return;

  CRM.state.currentEditRowNumber = rowNumber;

  setValue('editHouse', req.house || '');
  setValue('editFlat', req.flat || '');
  setValue('editDescription', req.description || '');
  setValue('editName', req.name || '');
  setValue('editPhone', req.phone || '');
  setValue('editPlanDate', req.rawPlanDate || '');
  setChecked('editIsEmergency', Boolean(req.isEmergency));

  const modal = document.getElementById('editModal');
  if (modal) modal.classList.add('active');
}

function closeEditModal() {
  CRM.state.currentEditRowNumber = null;

  const modal = document.getElementById('editModal');
  if (modal) modal.classList.remove('active');
}

function confirmEditRequest() {
  const rowNumber = CRM.state.currentEditRowNumber;
  if (!rowNumber) return;

  const data = {
    rowNumber: rowNumber,
    house: getValue('editHouse'),
    flat: getValue('editFlat'),
    description: getValue('editDescription'),
    name: getValue('editName'),
    phone: getValue('editPhone'),
    planDate: getValue('editPlanDate'),
    isEmergency: getChecked('editIsEmergency')
  };

  if (!data.house || !data.flat || !data.description) {
    showStatus('Дом, квартира и описание обязательны', true);
    return;
  }

  apiCall(
    'updateRequest',
    data,
    function(result) {
      closeEditModal();
      showStatus(result.message || 'Заявка обновлена');
      loadData();
    },
    function(error) {
      showStatus('Ошибка: ' + error, true);
    }
  );
}

function openReopenModal(rowNumber) {
  CRM.state.currentReopenRowNumber = rowNumber;
  setValue('reopenComment', '');

  const modal = document.getElementById('reopenModal');
  if (modal) modal.classList.add('active');
}

function closeReopenModal() {
  CRM.state.currentReopenRowNumber = null;

  const modal = document.getElementById('reopenModal');
  if (modal) modal.classList.remove('active');
}

function confirmReopenRequest() {
  const rowNumber = CRM.state.currentReopenRowNumber;
  if (!rowNumber) return;

  apiCall(
    'reopenRequest',
    {
      rowNumber: rowNumber,
      comment: getValue('reopenComment')
    },
    function(result) {
      closeReopenModal();
      showStatus(result.message || 'Заявка возобновлена');
      loadData();
    },
    function(error) {
      showStatus('Ошибка: ' + error, true);
    }
  );
}

function openDeleteModal(rowNumber, requestId) {
  CRM.state.currentDeleteRowNumber = rowNumber;

  const text = document.getElementById('deleteRequestText');
  if (text) {
    text.textContent = 'Удалить заявку ' + requestId + ' и всю её хронологию?';
  }

  const modal = document.getElementById('deleteModal');
  if (modal) modal.classList.add('active');
}

function closeDeleteModal() {
  CRM.state.currentDeleteRowNumber = null;

  const modal = document.getElementById('deleteModal');
  if (modal) modal.classList.remove('active');
}

function confirmDeleteRequest() {
  const rowNumber = CRM.state.currentDeleteRowNumber;
  if (!rowNumber) return;

  apiCall(
    'deleteRequest',
    { rowNumber: rowNumber },
    function(result) {
      closeDeleteModal();
      showStatus(result.message || 'Заявка удалена');
      loadData();
    },
    function(error) {
      showStatus('Ошибка: ' + error, true);
    }
  );
}

function renderEmergencyTimeline(events) {
  if (!events || !events.length) {
    return '<div class="emergency-timeline empty-timeline">Хронология пока пустая</div>';
  }

  const visible = events.slice(-8);

  return `
    <div class="emergency-timeline">
      <div class="timeline-title">Хронология аварии</div>
      ${visible.map(function(event) {
        return `
          <div class="timeline-item">
            <div class="timeline-date">${escapeHtml(event.date || '')}</div>
            <div class="timeline-stage">${escapeHtml(event.stage || '')}</div>
            ${event.comment
              ? '<div class="timeline-comment">' + escapeHtml(event.comment) + '</div>'
              : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function openEmergencyModal(rowNumber) {
  CRM.state.currentEmergencyRowNumber = rowNumber;
  setValue('emergencyStage', 'ARRIVED');
  setValue('emergencyComment', '');

  const modal = document.getElementById('emergencyModal');
  if (modal) modal.classList.add('active');
}

function closeEmergencyModal() {
  CRM.state.currentEmergencyRowNumber = null;

  const modal = document.getElementById('emergencyModal');
  if (modal) modal.classList.remove('active');
}

function confirmEmergencyEvent() {
  const rowNumber = CRM.state.currentEmergencyRowNumber;
  if (!rowNumber) return;

  apiCall(
    'addEmergencyEvent',
    {
      rowNumber: rowNumber,
      stage: getValue('emergencyStage'),
      comment: getValue('emergencyComment')
    },
    function(result) {
      closeEmergencyModal();
      showStatus(result.message || 'Этап аварии записан');
      loadData();
    },
    function(error) {
      showStatus('Ошибка: ' + error, true);
    }
  );
}

function openPlanModal(rowNumber, currentValue) {
  CRM.state.currentPlanRowNumber = rowNumber;

  setValue('planModalDate', currentValue || '');

  document
    .getElementById('planModal')
    .classList.add('active');
}

function closePlanModal() {
  CRM.state.currentPlanRowNumber = null;

  document
    .getElementById('planModal')
    .classList.remove('active');
}

function confirmPlanRequest() {
  const rowNumber =
    CRM.state.currentPlanRowNumber;

  if (!rowNumber) return;

  const planDate = getValue('planModalDate');

  apiCall(
    'updateRequestPlan',
    {
      rowNumber: rowNumber,
      planDate: planDate
    },
    function(result) {
      closePlanModal();
      showStatus(result.message || 'Дата сохранена');
      loadData();
    },
    function(error) {
      showStatus('Ошибка: ' + error, true);
    }
  );
}

function openHoldModal(rowNumber) {
  CRM.state.currentHoldRowNumber = rowNumber;

  setValue('holdComment', '');
  setValue('holdAction', '');
  setValue('holdReminder', '');

  document
    .getElementById('holdModal')
    .classList.add('active');
}

function closeHoldModal() {
  CRM.state.currentHoldRowNumber = null;

  document
    .getElementById('holdModal')
    .classList.remove('active');
}

function confirmHoldRequest() {
  const rowNumber =
    CRM.state.currentHoldRowNumber;

  if (!rowNumber) return;

  apiCall(
    'holdRequest',
    {
      rowNumber: rowNumber,
      comment: getValue('holdComment'),
      action: getValue('holdAction'),
      reminder: getValue('holdReminder')
    },
    function(result) {
      closeHoldModal();

      showStatus(
        result.message || 'Заявка переведена в ожидание'
      );

      loadData();
    },
    function(error) {
      showStatus('Ошибка: ' + error, true);
    }
  );
}

function openDoneModal(rowNumber) {
  CRM.state.currentDoneRowNumber = rowNumber;

  setValue('doneComment', '');

  document
    .getElementById('doneModal')
    .classList.add('active');
}

function closeDoneModal() {
  CRM.state.currentDoneRowNumber = null;

  document
    .getElementById('doneModal')
    .classList.remove('active');
}

function confirmDoneRequest() {
  const rowNumber =
    CRM.state.currentDoneRowNumber;

  if (!rowNumber) return;

  apiCall(
    'closeRequest',
    {
      rowNumber: rowNumber,
      comment: getValue('doneComment')
    },
    function(result) {
      closeDoneModal();

      showStatus(
        result.message || 'Заявка выполнена'
      );

      loadData();
    },
    function(error) {
      showStatus('Ошибка: ' + error, true);
    }
  );
}

function attachFormEvents() {
  const house = document.getElementById('house');
  const flat = document.getElementById('flat');

  if (house) house.onchange = handleFlatChange;
  if (flat) flat.oninput = handleFlatChange;
}

function handleFlatChange() {
  updateFlatHistory();
  updateContactSuggestions();
}

function updateFlatHistory() {
  const house = getValue('house');
  const flat = getValue('flat');
  const box = document.getElementById('flatHistory');

  if (!box) return;

  if (!house || !flat) {
    hideBox(box);
    return;
  }

  const history = (CRM.data.allRequests || []).filter(
    function(item) {
      return (
        item.house === house &&
        String(item.flat).trim() === flat.trim()
      );
    }
  );

  if (!history.length) {
    hideBox(box);
    return;
  }

  box.style.display = 'block';

  box.innerHTML =
    '<div class="flat-history-title">' +
    '📚 История квартиры (' +
    history.length +
    ')' +
    '</div>' +
    history
      .slice(0, 5)
      .map(function(item) {
        return `
          <div class="flat-history-item">
            <div class="flat-history-date">
              ${escapeHtml(item.date)}
            </div>

            <div>
              <strong>${escapeHtml(item.status || '')}</strong> ·
              ${escapeHtml(item.description)}
            </div>
            ${item.comment ? `<div class="flat-history-note">💬 ${escapeHtml(item.comment)}</div>` : ''}
            ${item.holdComment ? `<div class="flat-history-note">⏳ ${escapeHtml(item.holdComment)}</div>` : ''}
          </div>
        `;
      })
      .join('');
}

function updateContactSuggestions() {
  const house = getValue('house');
  const flat = getValue('flat');
  const box =
    document.getElementById('contactSuggestions');

  if (!box) return;

  if (!house || !flat) {
    hideBox(box);
    return;
  }

  const matches = (CRM.data.contacts || []).filter(
    function(contact) {
      return (
        contact.house === house &&
        String(contact.flat).trim() === flat.trim()
      );
    }
  );

  if (!matches.length) {
    hideBox(box);
    return;
  }

  if (matches.length === 1) {
    fillContact(matches[0]);
    hideBox(box);
    return;
  }

  window.currentContactMatches = matches;

  box.style.display = 'block';

  box.innerHTML =
    '<div class="contact-title">👤 Найдены контакты</div>' +
    matches
      .map(function(contact, index) {
        return `
          <button
            type="button"
            class="contact-btn"
            onclick="selectContact(${index})"
          >
            ${escapeHtml(contact.name || 'Без имени')}
            <br>
            📞 ${escapeHtml(formatPhone(contact.phone || ''))}
          </button>
        `;
      })
      .join('');
}

function selectContact(index) {
  const contact =
    window.currentContactMatches[index];

  if (!contact) return;

  fillContact(contact);

  hideBox(
    document.getElementById('contactSuggestions')
  );
}

function fillContact(contact) {
  if (contact.name) setValue('name', contact.name);
  if (contact.phone) setValue('phone', contact.phone);
}

function clearNewRequestForm() {
  setValue('flat', '');
  setValue('description', '');
  setValue('name', '');
  setValue('phone', '');
  setValue('planDate', '');
  setChecked('isEmergency', false);

  hideBox(document.getElementById('flatHistory'));

  hideBox(
    document.getElementById('contactSuggestions')
  );
}

function sortActiveRequests(requests) {
  return requests.slice().sort(function(a, b) {
    const aDate = getDateTime(a.rawPlanDate);
    const bDate = getDateTime(b.rawPlanDate);

    if (aDate && bDate) return aDate - bDate;
    if (aDate) return -1;
    if (bDate) return 1;

    return (
      getDateTime(b.rawDate) -
      getDateTime(a.rawDate)
    );
  });
}

function isTodayPlanned(req) {
  return isTodayIso(req.rawPlanDate);
}

function isOverdue(req) {
  if (
    !req.rawPlanDate ||
    req.status === 'Выполнено'
  ) {
    return false;
  }

  const date = getDateTime(req.rawPlanDate);

  if (!date) return false;

  return (
    date < new Date() &&
    !isTodayIso(req.rawPlanDate)
  );
}

function getRequestCardClass(req) {
  if (req.isEmergency) return 'is-emergency';
  if (req.status === 'Ожидает') return 'is-waiting';
  if (isOverdue(req)) return 'is-overdue';
  if (isTodayPlanned(req)) return 'is-today';

  return '';
}

function getPlanButtonText(req) {
  if (!req.planDate) return '📅 Назначить';
  if (isTodayPlanned(req)) return '🟡 Сегодня';
  if (isOverdue(req)) return '🔴 Просрочено';

  return '📅 Изменить';
}

function getPlanLabel(req) {
  if (!req.planDate) return '';

  if (req.status === 'Ожидает') {
    return (
      '📌 Напомнить: ' +
      escapeHtml(req.planDate)
    );
  }

  if (isOverdue(req)) {
    return (
      '🔴 Просрочено: ' +
      escapeHtml(req.planDate)
    );
  }

  if (isTodayPlanned(req)) {
    return (
      '🟡 Сегодня: ' +
      escapeHtml(req.planDate)
    );
  }

  return '📅 План: ' + escapeHtml(req.planDate);
}

function isTodayIso(value) {
  const date = getDateTime(value);

  if (!date) return false;

  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function getDateTime(value) {
  if (!value) return null;

  const date = new Date(value);

  if (isNaN(date.getTime())) return null;

  return date;
}

function showStatus(message, isError) {
  const status = document.getElementById('status');

  if (!status) return;

  if (!message) {
    status.textContent = '';
    status.style.display = 'none';
    return;
  }

  status.style.display = 'block';
  status.textContent = message;
  status.className = isError
    ? 'status error'
    : 'status';
}

function hideBox(box) {
  if (!box) return;

  box.style.display = 'none';
  box.innerHTML = '';
}

function getValue(id) {
  const el = document.getElementById(id);

  return el
    ? String(el.value || '').trim()
    : '';
}

function setValue(id, value) {
  const el = document.getElementById(id);

  if (el) el.value = value;
}

function getChecked(id) {
  const el = document.getElementById(id);
  return Boolean(el && el.checked);
}

function setChecked(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = Boolean(value);
}

function capitalize(text) {
  return (
    text.charAt(0).toUpperCase() +
    text.slice(1)
  );
}

function formatPhone(phone) {
  phone = String(phone || '').replace(/\D/g, '');

  if (phone.length === 11) {
    return phone.replace(
      /(\d)(\d{3})(\d{3})(\d{2})(\d{2})/,
      '$1 ($2) $3-$4-$5'
    );
  }

  return phone;
}


function phoneForCall(phone) {
  let digits = String(phone || '').replace(/\D/g, '');

  if (digits.length === 11 && digits.startsWith('8')) {
    digits = '7' + digits.slice(1);
  } else if (digits.length === 10) {
    digits = '7' + digits;
  }

  return digits ? '+' + digits : '';
}

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeJs(text) {
  return String(text || '')
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '');
}

document.addEventListener('DOMContentLoaded', setupFastRequestFlow);


let voiceRecognition = null;
let voiceListening = false;
let voiceBaseText = '';

function getSpeechRecognitionClass() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function setupVoiceInput() {
  const Recognition = getSpeechRecognitionClass();
  const button = document.getElementById('voiceBtn');

  if (!button) return;

  if (!Recognition) {
    button.disabled = true;
    button.textContent = '🎙 Голос недоступен';
    setVoiceStatus('На этом устройстве браузерный голосовой ввод не поддерживается.', true);
    return;
  }

  voiceRecognition = new Recognition();
  voiceRecognition.lang = 'ru-RU';
  voiceRecognition.interimResults = true;
  voiceRecognition.continuous = false;
  voiceRecognition.maxAlternatives = 1;

  voiceRecognition.onstart = function() {
    voiceListening = true;
    updateVoiceButton();
    setVoiceStatus('Слушаю… говори заявку.');
  };

  voiceRecognition.onresult = function(event) {
    let finalText = '';
    let interimText = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0].transcript;

      if (event.results[i].isFinal) {
        finalText += text;
      } else {
        interimText += text;
      }
    }

    const description = document.getElementById('description');
    if (!description) return;

    const spokenText = (finalText || interimText).trim();
    const separator = voiceBaseText && spokenText ? ' ' : '';
    description.value = voiceBaseText + separator + spokenText;
  };

  voiceRecognition.onerror = function(event) {
    voiceListening = false;
    updateVoiceButton();

    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      setVoiceStatus('Нет доступа к микрофону. Разреши микрофон для приложения.', true);
    } else if (event.error === 'no-speech') {
      setVoiceStatus('Речь не услышал. Нажми микрофон и попробуй ещё раз.', true);
    } else {
      setVoiceStatus('Ошибка голосового ввода: ' + event.error, true);
    }
  };

  voiceRecognition.onend = function() {
    voiceListening = false;
    updateVoiceButton();

    const description = document.getElementById('description');
    if (description && description.value.trim()) {
      setVoiceStatus('Готово. Текст можно поправить вручную.');
    } else {
      setVoiceStatus('');
    }
  };
}

function toggleVoiceInput() {
  if (!voiceRecognition) {
    setupVoiceInput();
  }

  if (!voiceRecognition) return;

  if (voiceListening) {
    voiceRecognition.stop();
    return;
  }

  const description = document.getElementById('description');
  voiceBaseText = description ? description.value.trim() : '';

  try {
    voiceRecognition.start();
  } catch (error) {
    setVoiceStatus('Микрофон уже запускается. Попробуй ещё раз через секунду.', true);
  }
}

function updateVoiceButton() {
  const button = document.getElementById('voiceBtn');
  if (!button) return;

  button.classList.toggle('listening', voiceListening);
  button.textContent = voiceListening ? '⏹ Остановить' : '🎙 Говорить';
}

function setVoiceStatus(text, isError) {
  const box = document.getElementById('voiceStatus');
  if (!box) return;

  box.textContent = text || '';
  box.classList.toggle('error', Boolean(isError));
  box.style.display = text ? 'block' : 'none';
}

document.addEventListener('DOMContentLoaded', setupVoiceInput);

