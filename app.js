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
    houseProfiles: {},
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
    currentDispatchRowNumber: null,
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
      setupHousesView();
      setupOtherAddressesView();
      setupWalkthroughView();
      renderDashboard();
      renderResidentInbox();
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

  if (viewName === 'houses') {
    setupHousesView();
  }

  if (viewName === 'other') {
    setupOtherAddressesView();
  }

  if (viewName === 'walk') {
    setupWalkthroughView();
  }

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

  const otherOption = document.createElement('option');
  otherOption.value = '__OTHER__';
  otherOption.textContent = 'Другой адрес';
  select.appendChild(otherOption);

  if (currentValue) {
    const known = Array.from(select.options).some(function(option) {
      return option.value === currentValue;
    });

    select.value = known ? currentValue : '__OTHER__';

    if (!known && currentValue !== '__OTHER__') {
      setValue('otherAddress', currentValue);
    }
  }

  handleHouseChange();
}


function setupFastRequestFlow() {
  const house = document.getElementById('house');
  const flat = document.getElementById('flat');
  const description = document.getElementById('description');

  if (house && !house.dataset.fastFlowReady) {
    house.dataset.fastFlowReady = '1';

    house.addEventListener('change', function() {
      window.setTimeout(function() {
        if (house.value === '__OTHER__') {
          const otherAddress = document.getElementById('otherAddress');
          if (otherAddress) otherAddress.focus();
          return;
        }

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


function getHouseProfile(house) {
  const profiles = CRM.data.houseProfiles || {};
  return profiles[house] || { entrances: 5, itp: 1, extras: [] };
}

function buildHouseLocationOptions(house) {
  const profile = getHouseProfile(house);
  const options = [];

  for (let i = 1; i <= Number(profile.entrances || 0); i++) {
    options.push('Подъезд ' + i);
  }

  options.push('Подвал');

  for (let i = 1; i <= Number(profile.itp || 0); i++) {
    options.push(Number(profile.itp) > 1 ? 'ИТП №' + i : 'ИТП');
  }

  options.push('Электрощитовая', 'Узел учёта', 'Кровля', 'Чердак', 'Двор', 'Фасад');
  (profile.extras || []).forEach(item => options.push(item));

  return Array.from(new Set(options.filter(Boolean)));
}

function fillLocationSelect(selectId, house) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const current = select.value;
  const options = buildHouseLocationOptions(house);
  select.innerHTML = '<option value="">— Выберите —</option>' +
    options.map(item => '<option value="' + escapeHtml(item) + '">' + escapeHtml(item) + '</option>').join('') +
    '<option value="Другое">Другое</option>';
  if (options.includes(current) || current === 'Другое') select.value = current;
}

function handleHouseChange() {
  toggleOtherAddressField();
  const house = getSelectedHouseValue();
  fillLocationSelect('commonLocation', house);
}

function handleWalkHouseChange() {
  toggleWalkOtherAddress();
  const house = getWalkHouseValue();
  fillLocationSelect('walkLocation', house);
}

function setRecordType(type) {
  const allowed = ['resident', 'common', 'planned'];
  const nextType = allowed.includes(type) ? type : 'resident';
  setValue('recordType', nextType);
  document.querySelectorAll('.record-type-btn').forEach(function(button) { button.classList.toggle('active', button.dataset.recordType === nextType); });
  const residentFields=document.getElementById('residentFields'); const commonFields=document.getElementById('commonFields'); const residentContacts=document.getElementById('residentContactFields'); const emergencyBlock=document.getElementById('emergencyBlock'); const descriptionLabel=document.getElementById('descriptionLabel'); const planDateLabel=document.getElementById('planDateLabel'); const description=document.getElementById('description');
  const contactNameLabel=document.getElementById('contactNameLabel'); const contactPhoneLabel=document.getElementById('contactPhoneLabel'); const commonContactHint=document.getElementById('commonContactHint');
  if(residentFields) residentFields.hidden=nextType!=='resident'; if(commonFields) commonFields.hidden=nextType==='resident'; if(residentContacts) residentContacts.hidden=nextType==='planned'; if(emergencyBlock) emergencyBlock.hidden=nextType==='planned';
  if(contactNameLabel) contactNameLabel.textContent=nextType==='common'?'4. Кто сообщил / как обращаться':'4. ФИО / как обращаться';
  if(contactPhoneLabel) contactPhoneLabel.textContent=nextType==='common'?'5. Телефон сообщившего':'5. Телефон';
  if(commonContactHint) commonContactHint.hidden=nextType!=='common';
  if(descriptionLabel) descriptionLabel.textContent=nextType==='planned'?'3. Что нужно сделать':nextType==='common'?'3. Неисправность / задача':'3. Заявка';
  if(planDateLabel) planDateLabel.textContent=nextType==='planned'?'4. Срок выполнения':'6. Плановый визит';
  if(description) description.placeholder=nextType==='planned'?'Например: заменить манометр на обратке':nextType==='common'?'Например: подтекает сальник насоса отопления':'Например: течёт стояк';
  if(nextType==='planned') setChecked('isEmergency',false);
}
function toggleCustomLocation(){const s=document.getElementById('commonLocation');const c=document.getElementById('customLocation');if(!s||!c)return;c.hidden=s.value!=='Другое';if(c.hidden)c.value='';else c.focus();}
function getCommonLocationValue(){const selected=getValue('commonLocation');const custom=getValue('customLocation');const details=getValue('commonLocationDetails');const location=selected==='Другое'?custom:selected;return [location,details].filter(Boolean).join(' — ');}
function getRecordTypeLabel(req){if(req.category==='Плановая работа')return '🛠 Плановая работа';if(req.category==='Общее имущество')return '🏢 Общее имущество';return '';}
function isCommonPropertyRequest(req){return req.category==='Общее имущество'||req.category==='Плановая работа';}


function toggleOtherAddressField() {
  const select = document.getElementById('house');
  const input = document.getElementById('otherAddress');
  const flat = document.getElementById('flat');
  const flatLabel = document.getElementById('flatLabel');

  if (!select || !input) return;

  const isOther = select.value === '__OTHER__';
  input.hidden = !isOther;

  if (flatLabel) {
    flatLabel.textContent = isOther
      ? '2. Помещение / квартира'
      : '2. Квартира';
  }

  if (flat) {
    flat.inputMode = isOther ? 'text' : 'numeric';
    flat.placeholder = isOther
      ? 'Например: офис 3, магазин, кв. 27'
      : 'Например: 63';
  }

  if (isOther) {
    window.setTimeout(function() {
      input.focus();
    }, 80);
  }
}

function getSelectedHouseValue() {
  const selected = getValue('house');

  if (selected === '__OTHER__') {
    return getValue('otherAddress');
  }

  return selected;
}

function isOtherAddressRequest(req) {
  const houses = CRM && CRM.data && Array.isArray(CRM.data.houses)
    ? CRM.data.houses
    : [];

  return Boolean(req && req.house && !houses.includes(String(req.house)));
}

function toggleWalkOtherAddress() {
  const select = document.getElementById('walkHouse');
  const input = document.getElementById('walkOtherAddress');

  if (!select || !input) return;

  input.hidden = select.value !== '__OTHER__';

  if (!input.hidden) {
    window.setTimeout(function() {
      input.focus();
    }, 80);
  }
}

function getWalkHouseValue() {
  const selected = getValue('walkHouse');

  if (selected === '__OTHER__') {
    return getValue('walkOtherAddress');
  }

  return selected;
}


function getSelectedFiles(inputId) {
  const input = document.getElementById(inputId);
  return input ? Array.from(input.files || []).slice(0, 3) : [];
}

function compressPhoto(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onerror = function() { reject(new Error('Не удалось прочитать фото')); };
    reader.onload = function() {
      const image = new Image();
      image.onerror = function() { reject(new Error('Не удалось открыть фото')); };
      image.onload = function() {
        const maxSide = 1280;
        let width = image.width;
        let height = image.height;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(image, 0, 0, width, height);
        resolve({
          dataUrl: canvas.toDataURL('image/jpeg', 0.72),
          fileName: String(file.name || 'photo.jpg').replace(/\.[^.]+$/, '') + '.jpg'
        });
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function apiCallPromise(action, payload) {
  return new Promise(function(resolve, reject) {
    apiCall(action, payload, resolve, function(error) {
      reject(new Error(error || 'Ошибка сервера'));
    });
  });
}

function getPhotoCountFromData(data, rowNumber, requestId, kind) {
  const requests = data && Array.isArray(data.allRequests)
    ? data.allRequests
    : [];

  const request = requests.find(function(item) {
    if (rowNumber && Number(item.rowNumber) === Number(rowNumber)) return true;
    if (requestId && String(item.id || '') === String(requestId)) return true;
    return false;
  });

  if (!request) return 0;

  const list = kind === 'after'
    ? request.photosAfter
    : request.photosBefore;

  return Array.isArray(list) ? list.length : 0;
}

async function waitForPhotoConfirmation(options) {
  const attempts = 20;
  const delayMs = 3000;

  for (let attempt = 0; attempt < attempts; attempt++) {
    await new Promise(function(resolve) {
      setTimeout(resolve, delayMs);
    });

    try {
      const data = await apiCallPromise('getAppData', null);
      const count = getPhotoCountFromData(
        data,
        options.rowNumber,
        options.requestId,
        options.kind
      );

      if (count >= options.expectedCount) {
        return {
          confirmed: true,
          count: count
        };
      }
    } catch (error) {
      // Временная ошибка проверки не означает, что загрузка провалилась.
    }
  }

  throw new Error(
    'Фото отправлено, но приложение не смогло подтвердить загрузку. ' +
    'Обнови список заявок через несколько секунд.'
  );
}

function uploadPhotoPayload(payload, expectedCount) {
  return new Promise(function(resolve, reject) {
    const uploadId =
      'photo_' +
      Date.now() +
      '_' +
      Math.floor(Math.random() * 100000);

    const iframe = document.createElement('iframe');
    iframe.name = uploadId;
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = API_URL;
    form.target = uploadId;
    form.style.display = 'none';

    const values = Object.assign({}, payload, {
      action: 'uploadPhoto',
      uploadId: uploadId
    });

    Object.keys(values).forEach(function(key) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = values[key] == null ? '' : String(values[key]);
      form.appendChild(input);
    });

    document.body.appendChild(form);

    let finished = false;
    let messageTimer;

    function cleanup() {
      clearTimeout(messageTimer);
      window.removeEventListener('message', onMessage);

      if (form.isConnected) form.remove();
      if (iframe.isConnected) iframe.remove();
    }

    function finishSuccess(result) {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(result || { confirmed: true });
    }

    function finishError(error) {
      if (finished) return;
      finished = true;
      cleanup();
      reject(error);
    }

    function onMessage(event) {
      const message = event.data;

      if (
        !message ||
        message.source !== 'nashdom-photo-upload' ||
        !message.payload ||
        message.payload.uploadId !== uploadId
      ) {
        return;
      }

      const response = message.payload;

      if (response.ok) {
        finishSuccess(response.result);
      } else {
        finishError(
          new Error(response.error || 'Ошибка загрузки фото')
        );
      }
    }

    window.addEventListener('message', onMessage);

    // Ответ через iframe иногда не доходит до установленной PWA.
    // Поэтому параллельно проверяем появление ссылки в самой заявке.
    waitForPhotoConfirmation({
      rowNumber: payload.rowNumber,
      requestId: payload.requestId,
      kind: payload.kind,
      expectedCount: expectedCount
    })
      .then(finishSuccess)
      .catch(finishError);

    // Таймер нужен только для очистки зависшего iframe.
    // Ошибку по нему не показываем: результат определяет проверка заявки.
    messageTimer = setTimeout(function() {
      if (form.isConnected) form.remove();
      if (iframe.isConnected) iframe.remove();
    }, 20000);

    form.submit();
  });
}

async function uploadRequestPhotos(
  files,
  rowNumber,
  requestId,
  kind
) {
  const existingRequest = (CRM.data.allRequests || []).find(function(item) {
    if (rowNumber && Number(item.rowNumber) === Number(rowNumber)) return true;
    if (requestId && String(item.id || '') === String(requestId)) return true;
    return false;
  });

  const existingList = existingRequest
    ? kind === 'after'
      ? existingRequest.photosAfter
      : existingRequest.photosBefore
    : [];

  const baseCount = Array.isArray(existingList)
    ? existingList.length
    : 0;

  const selected = files.slice(0, 3);

  for (let index = 0; index < selected.length; index++) {
    const compressed = await compressPhoto(selected[index]);

    await uploadPhotoPayload(
      {
        token: getAccessKey(),
        rowNumber: rowNumber,
        requestId: requestId || '',
        kind: kind,
        fileName: compressed.fileName,
        dataUrl: compressed.dataUrl
      },
      baseCount + index + 1
    );
  }
}

function renderPhotoGallery(items, title) {
  if (!Array.isArray(items) || !items.length) return '';
  return '<div class="photo-gallery-block"><div class="photo-gallery-title">' + title + '</div><div class="photo-gallery">' +
    items.map(function(photo) {
      const src = photo.thumb || photo.url || '';
      const href = photo.url || src;
      return '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener"><img src="' + escapeHtml(src) + '" alt="Фото заявки"></a>';
    }).join('') + '</div></div>';
}

function saveRequest() {
  const btn = document.getElementById('saveBtn');
  const recordType = getValue('recordType') || 'resident';
  const isResident = recordType === 'resident';
  const isPlanned = recordType === 'planned';
  const selectedHouse = getValue('house');
  const houseValue = getSelectedHouseValue();

  const data = {
    house: houseValue,
    flat: isResident ? getValue('flat') : getCommonLocationValue(),
    description: getValue('description'),
    name: isPlanned ? getValue('recordSource') : (getValue('name') || (isResident ? '' : getValue('recordSource'))),
    phone: isPlanned ? '' : getValue('phone'),
    planDate: getValue('planDate'),
    isEmergency: isPlanned ? false : getChecked('isEmergency'),
    category:
      recordType === 'common'
        ? 'Общее имущество'
        : recordType === 'planned'
          ? 'Плановая работа'
          : '',
    source:
      selectedHouse === '__OTHER__'
        ? 'Разовый адрес'
        : recordType === 'common'
          ? 'Вручную / Общее имущество / ' + getValue('recordSource')
          : recordType === 'planned'
            ? 'Вручную / Плановая работа'
            : 'Вручную'
  };

  if (!data.house) {
    return showStatus(
      selectedHouse === '__OTHER__'
        ? 'Введи адрес'
        : 'Выбери дом',
      true
    );
  }

  if (!data.flat) {
    return showStatus(
      isResident
        ? selectedHouse === '__OTHER__'
          ? 'Укажи помещение, квартиру или объект'
          : 'Заполни квартиру'
        : 'Укажи место или объект',
      true
    );
  }

  if (!data.description) {
    return showStatus(
      isPlanned ? 'Опиши плановую работу' : 'Заполни заявку',
      true
    );
  }

  if (isPlanned && !data.planDate) {
    return showStatus('Укажи срок плановой работы', true);
  }

  btn.disabled = true;
  btn.textContent = 'Сохраняю...';

  apiCall(
    'addRequest',
    data,
    async function(result) {
      const photos = getSelectedFiles('beforePhotos');
      if (photos.length) {
        btn.textContent = 'Загружаю фото...';
        try {
          await uploadRequestPhotos(
            photos,
            result.rowNumber,
            result.id,
            'before'
          );
          showStatus('Заявка и фото сохранены');
        } catch (error) {
          alert(error.message);
        }
      }
      showStatus(result.message || 'Запись сохранена');
      clearNewRequestForm();
      setRecordType('resident');

      btn.disabled = false;
      btn.textContent = '✓ Сохранено';

      loadData();

      setTimeout(function() {
        btn.textContent = 'Сохранить';
      }, 1000);
    },
    function(error) {
      showStatus('Ошибка сохранения: ' + error, true);
      btn.disabled = false;
      btn.textContent = 'Сохранить';
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
        <section class="dashboard-section">
          <div class="journal-title">${section.title}</div>
          <div class="dashboard-section-list">
            ${section.items
              .map(function(req) {
                return renderRequestCard(req, true);
              })
              .join('')}
          </div>
        </section>
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

  const commonRequest = isCommonPropertyRequest(req);

  const flat = req.flat
    ? commonRequest
      ? ' · ' + escapeHtml(req.flat)
      : ' кв. ' + escapeHtml(req.flat)
    : '';

  const recordTypeBadge = getRecordTypeLabel(req)
    ? '<div class="record-type-badge">' + getRecordTypeLabel(req) + '</div>'
    : '';

  const name = req.name
    ? '<div class="request-person">' + (commonRequest ? '🔎 ' : '👤 ') + escapeHtml(req.name) + '</div>'
    : commonRequest ? '' : '<div class="request-person muted">👤 ФИО не указано</div>';

  const phone = req.phone
    ? '<a class="phone-link" href="tel:' + escapeHtml(req.phone) + '">📞 ' + escapeHtml(formatPhone(req.phone)) + '</a>'
    : commonRequest ? '' : '<span class="request-meta">📞 телефон не указан</span>';

  const plan = req.planDate
    ? '<div class="request-plan">' +
      getPlanLabel(req) +
      '</div>'
    : '';

  const emergencyBadge = req.isEmergency
    ? '<div class="emergency-badge">🚨 Аварийная заявка</div>'
    : '';

  const otherAddressBadge = isOtherAddressRequest(req)
    ? '<div class="other-address-badge">📍 Разовый адрес</div>'
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

  const photoGalleries =
    renderPhotoGallery(req.photosBefore, '📷 До') +
    renderPhotoGallery(req.photosAfter, '📷 После');

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

      ${req.priority
        ? '<div class="request-assignment">🔧 ' + escapeHtml(req.priority) + '</div>'
        : ''}

      ${req.executor
        ? '<div class="request-assignment">👷 ' + escapeHtml(req.executor) + '</div>'
        : ''}

      <div class="request-desc">
        ${escapeHtml(req.description)}
      </div>

      ${photoGalleries}

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
  if (req.status === 'Удалено') {
    return `<div class="management-actions">
      <button class="manage-btn reopen-btn" onclick="restoreRequestUi(${Number(req.rowNumber)})">↩ Восстановить</button>
      <button class="manage-btn delete-btn" onclick="openDeleteModal(${Number(req.rowNumber)}, '${escapeJs(req.id || '')}')">🗑 Удалить навсегда</button>
    </div>`;
  }

  if (req.status === 'Архив') {
    return `<div class="management-actions">
      <button class="manage-btn reopen-btn" onclick="restoreRequestUi(${Number(req.rowNumber)})">↩ Вернуть в работу</button>
      <button class="manage-btn share-request-btn" onclick="shareRequest(${Number(req.rowNumber)})">📤 Поделиться</button>
      <button class="manage-btn delete-btn" onclick="trashRequestUi(${Number(req.rowNumber)})">🗑 В корзину</button>
    </div>`;
  }

  const extra = req.status === 'Выполнено'
    ? `<button class="manage-btn reopen-btn" onclick="openReopenModal(${Number(req.rowNumber)})">↩ Возобновить</button>`
    : '';

  return `<div class="management-actions">
    <button class="manage-btn edit-btn" onclick="openEditModal(${Number(req.rowNumber)})">✏️ Редактировать</button>
    <button class="manage-btn dispatch-btn" onclick="openDispatchModal(${Number(req.rowNumber)})">👷 Исполнитель</button>
    <button class="manage-btn share-request-btn" onclick="shareRequest(${Number(req.rowNumber)})">📤 Поделиться</button>
    ${req.phone ? `<button class="manage-btn contact-save-btn" onclick="saveRequestContact(${Number(req.rowNumber)})">👤 В контакты</button>` : ''}
    ${extra}
    <button class="manage-btn archive-btn" onclick="archiveRequestUi(${Number(req.rowNumber)})">📦 Архив</button>
    <button class="manage-btn delete-btn" onclick="trashRequestUi(${Number(req.rowNumber)})">🗑 Корзина</button>
  </div>`;
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

  if (filter === 'other') return all.filter(isOtherAddressRequest);
  if (filter === 'archive') return all.filter(function(req){ return req.status === 'Архив'; });
  if (filter === 'trash') return all.filter(function(req){ return req.status === 'Удалено'; });

  return all.filter(function(req){ return req.status !== 'Архив' && req.status !== 'Удалено'; });
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
          true
        );
      })
      .join('');
}

function getJournalTitle() {
  const filter = CRM.state.journalFilter || 'all';

  if (filter === 'active') return 'Активные заявки';
  if (filter === 'waiting') return 'Заявки в ожидании';
  if (filter === 'done') return 'Выполненные заявки';
  if (filter === 'other') return 'Другие адреса';
  if (filter === 'archive') return 'Архив';
  if (filter === 'trash') return 'Корзина';

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
  const photos = document.getElementById('emergencyPhotos');
  if (photos) photos.value = '';

  const modal = document.getElementById('emergencyModal');
  if (modal) modal.classList.remove('active');
}

function confirmEmergencyEvent() {
  const rowNumber = CRM.state.currentEmergencyRowNumber;
  if (!rowNumber) return;
  const photos = getSelectedFiles('emergencyPhotos');

  apiCall(
    'addEmergencyEvent',
    {
      rowNumber: rowNumber,
      stage: getValue('emergencyStage'),
      comment: getValue('emergencyComment')
    },
    async function(result) {
      try {
        if (photos.length) {
          showStatus('Этап записан, загружаю фото...');
          await uploadRequestPhotos(photos, rowNumber, '', 'after');
        }
        closeEmergencyModal();
        showStatus(photos.length ? 'Этап аварии и фото сохранены' : (result.message || 'Этап аварии записан'));
        loadData();
      } catch (error) {
        showStatus('Этап записан, но фото не загрузились: ' + error.message, true);
      }
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
  const afterPhotos = document.getElementById('afterPhotos');
  if (afterPhotos) afterPhotos.value = '';

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

async function confirmDoneRequest() {
  const rowNumber = CRM.state.currentDoneRowNumber;
  if (!rowNumber) return;

  const photos = getSelectedFiles('afterPhotos');
  if (photos.length) {
    try {
      await uploadRequestPhotos(photos, rowNumber, '', 'after');
    } catch (error) {
      alert('Не удалось загрузить фото: ' + error.message);
      return;
    }
  }

  apiCall('closeRequest', {
    rowNumber: rowNumber,
    comment: getValue('doneComment')
  }, function(result) {
    closeDoneModal();
    showStatus(result.message || 'Заявка выполнена');
    loadData();
  }, function(error) {
    showStatus('Ошибка: ' + error, true);
  });
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
  setValue('recordType', 'resident');
  setValue('commonLocation', '');
  setValue('commonLocationDetails', '');
  setValue('customLocation', '');
  setValue('recordSource', 'Обнаружено при обходе');
  const beforePhotos = document.getElementById('beforePhotos');
  if (beforePhotos) beforePhotos.value = '';
  setValue('otherAddress', '');

  const otherAddress = document.getElementById('otherAddress');
  if (otherAddress) otherAddress.hidden = true;
  const customLocation = document.getElementById('customLocation');
  if (customLocation) customLocation.hidden = true;

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



function setupHousesView() {
  const select = document.getElementById('houseCardSelect');
  if (!select || !CRM || !CRM.data) return;
  const houses = Array.isArray(CRM.data.houses) ? CRM.data.houses : [];
  const current = select.value;
  select.innerHTML = '<option value="">— Выберите дом —</option>' +
    houses.map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
  if (current && houses.includes(current)) select.value = current;
}

function houseRequestDone(r) {
  const s = String(r.status || '').toLowerCase();
  return s.includes('выполн') || s.includes('закрыт');
}

function houseRequestWaiting(r) {
  return String(r.status || '').toLowerCase().includes('ожид');
}

function houseRequestEmergency(r) {
  return Boolean(r.isEmergency) ||
    String(r.priority || '').toLowerCase().includes('авар') ||
    Boolean(String(r.emergencyStage || '').trim());
}

function crmDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('ru-RU', {
    day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  });
}

function jsArg(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function renderHouseRequestItem(r) {
  const comment = r.comment || r.doneComment || r.executionComment || '';
  return `
    <div class="house-request-item">
      <div class="house-request-head">
        <strong>кв. ${escapeHtml(r.flat || '—')}</strong>
        <span>${escapeHtml(crmDate(r.date || r.createdAt || ''))}</span>
      </div>
      <div class="house-request-text">${escapeHtml(r.description || '')}</div>
      <div class="house-request-foot">
        <span class="house-status">${escapeHtml(r.status || 'Принято')}</span>
        ${comment ? `<span>${escapeHtml(comment)}</span>` : ''}
      </div>
    </div>`;
}

function renderHouseCard() {
  const select = document.getElementById('houseCardSelect');
  const box = document.getElementById('houseCard');
  const flatBox = document.getElementById('flatCard');
  if (!select || !box || !flatBox || !CRM || !CRM.data) return;

  const house = select.value;
  flatBox.innerHTML = '';
  if (!house) { box.innerHTML = ''; return; }

  const requests = (CRM.data.allRequests || []).filter(r => String(r.house || '') === house);
  const active = requests.filter(r => !houseRequestDone(r) && !houseRequestWaiting(r));
  const waiting = requests.filter(houseRequestWaiting);
  const done = requests.filter(houseRequestDone);
  const emergency = requests.filter(r => houseRequestEmergency(r) && !houseRequestDone(r));

  const contactFlats = (CRM.data.contacts || [])
    .filter(c => String(c.house || '') === house)
    .map(c => String(c.flat || '').trim());
  const requestFlats = requests.map(r => String(r.flat || '').trim());
  const flats = [...new Set([...contactFlats, ...requestFlats].filter(Boolean))]
    .sort((a,b) => a.localeCompare(b, 'ru', {numeric:true}));

  box.innerHTML = `
    <div class="house-title">${escapeHtml(house)}</div>
    <div class="house-stats">
      <div><strong>${requests.length}</strong><span>Всего</span></div>
      <div><strong>${active.length}</strong><span>Активные</span></div>
      <div><strong>${waiting.length}</strong><span>Ожидают</span></div>
      <div><strong>${done.length}</strong><span>Выполнено</span></div>
    </div>
    ${emergency.length ? `<div class="house-emergency">🚨 Текущих аварий: <strong>${emergency.length}</strong></div>` : ''}
    <label>Квартира</label>
    <select id="houseFlatSelect" onchange="renderFlatCard()">
      <option value="">— Выберите квартиру —</option>
      ${flats.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')}
    </select>
    <h2 class="house-section-title">Заявки по дому</h2>
    <div class="house-request-list">
      ${requests.length ? requests.slice().reverse().map(renderHouseRequestItem).join('') :
        '<div class="empty-note">По этому дому заявок пока нет.</div>'}
    </div>`;
}

function renderFlatCard() {
  const houseSelect = document.getElementById('houseCardSelect');
  const flatSelect = document.getElementById('houseFlatSelect');
  const box = document.getElementById('flatCard');
  if (!houseSelect || !flatSelect || !box || !CRM || !CRM.data) return;

  const house = houseSelect.value;
  const flat = flatSelect.value;
  if (!flat) { box.innerHTML = ''; return; }

  const contacts = (CRM.data.contacts || []).filter(c =>
    String(c.house || '') === house && String(c.flat || '') === flat);
  const requests = (CRM.data.allRequests || []).filter(r =>
    String(r.house || '') === house && String(r.flat || '') === flat);
  const active = requests.filter(r => !houseRequestDone(r));

  box.innerHTML = `
    <div class="flat-card">
      <div class="flat-card-title">${escapeHtml(house)}, кв. ${escapeHtml(flat)}</div>
      <h3>Жильцы / контакты</h3>
      <div class="flat-contacts">
        ${contacts.length ? contacts.map(c => `
          <div class="flat-contact">
            <strong>${escapeHtml(c.name || c.fio || 'Без имени')}</strong>
            ${c.phone ? `<a href="tel:${phoneForCall(c.phone)}">${escapeHtml(c.phone)}</a>` : ''}
          </div>`).join('') : '<div class="empty-note">Контактов нет.</div>'}
      </div>
      <button type="button" class="flat-new-btn"
        onclick="createRequestForFlat('${jsArg(house)}','${jsArg(flat)}')">
        ➕ Создать заявку в эту квартиру
      </button>
      <h3>Активные заявки</h3>
      <div class="house-request-list">
        ${active.length ? active.slice().reverse().map(renderHouseRequestItem).join('') :
          '<div class="empty-note">Активных заявок нет.</div>'}
      </div>
      <h3>История квартиры</h3>
      <div class="house-request-list">
        ${requests.length ? requests.slice().reverse().map(renderHouseRequestItem).join('') :
          '<div class="empty-note">Истории пока нет.</div>'}
      </div>
    </div>`;
  box.scrollIntoView({behavior:'smooth', block:'start'});
}

function createRequestForFlat(house, flat) {
  showView('new');
  setTimeout(() => {
    const h = document.getElementById('house');
    const f = document.getElementById('flat');
    const d = document.getElementById('description');
    if (h) { h.value = house; h.dispatchEvent(new Event('change', {bubbles:true})); }
    if (f) { f.value = flat; f.dispatchEvent(new Event('input', {bubbles:true})); }
    setTimeout(() => { if (d) d.focus(); }, 180);
  }, 80);
}

document.addEventListener('DOMContentLoaded', setupHousesView);

document.addEventListener('click', function(event) {
  const button = event.target.closest('.bottom-nav button[data-view="houses"]');
  if (button) {
    setTimeout(function() {
      setupHousesView();
      renderHouseCard();
    }, 50);
  }
});

/* ===== v0.14: даты, отчёты по домам ===== */

function parseHouseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  const text = String(value).trim();
  const match = text.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2}))?/);

  if (match) {
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    const date = new Date(
      year,
      Number(match[2]) - 1,
      Number(match[1]),
      Number(match[4] || 0),
      Number(match[5] || 0)
    );
    return isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(text);
  return isNaN(date.getTime()) ? null : date;
}

function requestHouseDate(req) {
  return parseHouseDate(req.rawDate || req.createdAt || req.date || '');
}

function shortHouseDate(value) {
  const date = parseHouseDate(value);
  if (!date) return String(value || '');
  return [
    String(date.getDate()).padStart(2, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getFullYear()).slice(-2)
  ].join('.');
}

function requestShortHouseDate(req) {
  const date = requestHouseDate(req);
  return date ? shortHouseDate(date) : shortHouseDate(req.date || '');
}

function fullReportDate(value) {
  const date = parseHouseDate(value);
  if (!date) return '';
  return [
    String(date.getDate()).padStart(2, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    date.getFullYear()
  ].join('.');
}

function dateInputValue(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function renderHouseRequestItem(req) {
  const comment = req.comment || req.doneComment || req.executionComment || '';

  return `
    <div class="house-request-item">
      <div class="house-request-head">
        <strong>${isCommonPropertyRequest(req) ? '📍 ' : 'кв. '}${escapeHtml(req.flat || '—')}</strong>
        <span>${escapeHtml(requestShortHouseDate(req))}</span>
      </div>
      <div class="house-request-text">${escapeHtml(req.description || '')}</div>
      <div class="house-request-foot">
        <span class="house-status">${escapeHtml(req.status || 'Принято')}</span>
        ${comment ? `<span>${escapeHtml(comment)}</span>` : ''}
      </div>
    </div>`;
}

function applyReportPeriod() {
  const period = getValue('reportPeriod');
  const from = document.getElementById('reportDateFrom');
  const to = document.getElementById('reportDateTo');
  if (!from || !to) return;

  const today = new Date();

  if (period === 'all') {
    from.value = '';
    to.value = '';
  } else if (period === 'month') {
    from.value = dateInputValue(new Date(today.getFullYear(), today.getMonth(), 1));
    to.value = dateInputValue(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  } else if (period === 'previousMonth') {
    from.value = dateInputValue(new Date(today.getFullYear(), today.getMonth() - 1, 1));
    to.value = dateInputValue(new Date(today.getFullYear(), today.getMonth(), 0));
  }

  renderHouseRequests();
}

function filteredHouseRequests() {
  const house = getValue('houseCardSelect');
  const status = getValue('reportStatus') || 'all';
  const flat = getValue('reportFlatFilter').toLowerCase();
  const fromText = getValue('reportDateFrom');
  const toText = getValue('reportDateTo');

  const from = fromText ? new Date(fromText + 'T00:00:00') : null;
  const to = toText ? new Date(toText + 'T23:59:59') : null;

  return (CRM.data.allRequests || [])
    .filter(req => String(req.house || '') === house)
    .filter(req => {
      if (status === 'active') return !houseRequestDone(req) && !houseRequestWaiting(req);
      if (status === 'waiting') return houseRequestWaiting(req);
      if (status === 'done') return houseRequestDone(req);
      if (status === 'emergency') return houseRequestEmergency(req);
      return true;
    })
    .filter(req => !flat || String(req.flat || '').toLowerCase().includes(flat))
    .filter(req => {
      const date = requestHouseDate(req);
      if (!date) return !from && !to;
      if (from && date < from) return false;
      if (to && date > to) return false;
      return true;
    })
    .sort((a, b) => {
      const ad = requestHouseDate(a);
      const bd = requestHouseDate(b);
      return (bd ? bd.getTime() : 0) - (ad ? ad.getTime() : 0);
    });
}

function renderHouseRequests() {
  const list = document.getElementById('houseRequestsList');
  const summary = document.getElementById('houseRequestsSummary');
  if (!list || !summary) return;

  const requests = filteredHouseRequests();
  const active = requests.filter(req => !houseRequestDone(req) && !houseRequestWaiting(req)).length;
  const waiting = requests.filter(houseRequestWaiting).length;
  const done = requests.filter(houseRequestDone).length;
  const emergency = requests.filter(houseRequestEmergency).length;

  summary.innerHTML =
    `Показано: <strong>${requests.length}</strong> · ` +
    `активных: <strong>${active}</strong> · ` +
    `ожидают: <strong>${waiting}</strong> · ` +
    `выполнено: <strong>${done}</strong>` +
    (emergency ? ` · аварийных: <strong>${emergency}</strong>` : '');

  list.innerHTML = requests.length
    ? requests.map(renderHouseRequestItem).join('')
    : '<div class="empty-note">По выбранным условиям заявок нет.</div>';
}

function renderHouseCard() {
  const select = document.getElementById('houseCardSelect');
  const box = document.getElementById('houseCard');
  const flatBox = document.getElementById('flatCard');
  const controls = document.getElementById('houseReportControls');

  if (!select || !box || !flatBox || !controls || !CRM || !CRM.data) return;

  const house = select.value;
  flatBox.innerHTML = '';

  if (!house) {
    box.innerHTML = '';
    controls.hidden = true;
    return;
  }

  controls.hidden = false;

  const requests = (CRM.data.allRequests || []).filter(req => String(req.house || '') === house);
  const active = requests.filter(req => !houseRequestDone(req) && !houseRequestWaiting(req));
  const waiting = requests.filter(houseRequestWaiting);
  const done = requests.filter(houseRequestDone);
  const emergency = requests.filter(req => houseRequestEmergency(req) && !houseRequestDone(req));

  const contactFlats = (CRM.data.contacts || [])
    .filter(c => String(c.house || '') === house)
    .map(c => String(c.flat || '').trim());
  const requestFlats = requests.map(r => String(r.flat || '').trim());
  const flats = [...new Set([...contactFlats, ...requestFlats].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));

  box.innerHTML = `
    <div class="house-title">${escapeHtml(house)}</div>
    <div class="house-stats">
      <div><strong>${requests.length}</strong><span>Всего</span></div>
      <div><strong>${active.length}</strong><span>Активные</span></div>
      <div><strong>${waiting.length}</strong><span>Ожидают</span></div>
      <div><strong>${done.length}</strong><span>Выполнено</span></div>
    </div>
    ${emergency.length ? `<div class="house-emergency">🚨 Текущих аварий: <strong>${emergency.length}</strong></div>` : ''}
    <label>Карточка квартиры</label>
    <select id="houseFlatSelect" onchange="renderFlatCard()">
      <option value="">— Выберите квартиру —</option>
      ${flats.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')}
    </select>
    <h2 class="house-section-title">Заявки по дому</h2>
    <div id="houseRequestsSummary" class="report-summary"></div>
    <div id="houseRequestsList" class="house-request-list"></div>`;

  if (!getValue('reportDateFrom') && !getValue('reportDateTo')) {
    applyReportPeriod();
  } else {
    renderHouseRequests();
  }
}

function reportPeriodText() {
  const from = getValue('reportDateFrom');
  const to = getValue('reportDateTo');
  if (!from && !to) return 'за всё время';
  if (from && to) return fullReportDate(from) + '–' + fullReportDate(to);
  if (from) return 'с ' + fullReportDate(from);
  return 'по ' + fullReportDate(to);
}

function houseReportText() {
  const house = getValue('houseCardSelect');
  const requests = filteredHouseRequests();

  const active = requests.filter(req => !houseRequestDone(req) && !houseRequestWaiting(req)).length;
  const waiting = requests.filter(houseRequestWaiting).length;
  const done = requests.filter(houseRequestDone).length;
  const emergency = requests.filter(houseRequestEmergency).length;

  const lines = [
    'ОТЧЁТ ПО ЗАЯВКАМ',
    house,
    'Период: ' + reportPeriodText(),
    '',
    'Всего: ' + requests.length,
    'Активные: ' + active,
    'Ожидают: ' + waiting,
    'Выполнено: ' + done,
    'Аварийные: ' + emergency,
    ''
  ];

  requests.forEach((req, index) => {
    const comment = req.comment || req.doneComment || req.executionComment || '';
    lines.push(`${index + 1}. ${requestShortHouseDate(req)} · кв. ${req.flat || '—'} · ${req.status || 'Принято'}`);
    lines.push(String(req.description || ''));
    if (comment) lines.push('Результат/комментарий: ' + comment);
    lines.push('');
  });

  return lines.join('\n').trim();
}

async function shareHouseReport() {
  const house = getValue('houseCardSelect');
  if (!house) return alert('Сначала выбери дом.');

  const text = houseReportText();

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Отчёт по заявкам: ' + house, text });
      return;
    } catch (error) {
      if (error && error.name === 'AbortError') return;
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    alert('Отчёт скопирован. Его можно вставить в сообщение.');
  } catch (error) {
    prompt('Скопируй отчёт:', text);
  }
}

function printHouseReport() {
  const house = getValue('houseCardSelect');
  if (!house) return alert('Сначала выбери дом.');

  const requests = filteredHouseRequests();
  const rows = requests.map(req => {
    const comment = req.comment || req.doneComment || req.executionComment || '';
    return `<tr>
      <td>${escapeHtml(requestShortHouseDate(req))}</td>
      <td>${escapeHtml(req.id || '')}</td>
      <td>${escapeHtml(req.flat || '—')}</td>
      <td>${escapeHtml(req.description || '')}</td>
      <td>${escapeHtml(req.status || 'Принято')}</td>
      <td>${escapeHtml(comment)}</td>
    </tr>`;
  }).join('');

  const win = window.open('', '_blank');
  if (!win) return alert('Браузер заблокировал окно печати.');

  win.document.write(`<!DOCTYPE html>
  <html lang="ru"><head><meta charset="UTF-8">
  <title>Отчёт — ${escapeHtml(house)}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:24px;color:#111}
    h1{font-size:20px;margin:0 0 6px}
    .period{margin-bottom:18px}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th,td{border:1px solid #777;padding:6px;text-align:left;vertical-align:top}
    th{background:#eee}
    .footer{margin-top:24px;font-size:11px;color:#555}
    @page{size:A4 landscape;margin:12mm}
  </style></head><body>
  <h1>Отчёт по заявкам: ${escapeHtml(house)}</h1>
  <div class="period">Период: ${escapeHtml(reportPeriodText())}</div>
  <table><thead><tr>
    <th>Дата</th><th>№ заявки</th><th>Квартира</th>
    <th>Содержание заявки</th><th>Статус</th><th>Результат / комментарий</th>
  </tr></thead><tbody>
    ${rows || '<tr><td colspan="6">Заявок нет</td></tr>'}
  </tbody></table>
  <div class="footer">Сформировано в «НашДом CRM» ${fullReportDate(new Date())}.</div>
  </body></html>`);

  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}


/* ===== v0.15: входящие заявки жителей ===== */

function renderResidentInbox() {
  const box = document.getElementById('residentInbox');
  if (!box || !CRM || !CRM.data) return;

  const items = CRM.data.residentRequests || [];

  if (!items.length) {
    box.innerHTML = '';
    return;
  }

  box.innerHTML = `
    <div class="resident-inbox">
      <div class="resident-inbox-title">📨 Новые от жителей <span>${items.length}</span></div>
      <div class="resident-inbox-list">
        ${items.map(req => `
          <div class="resident-request-card">
            <div class="resident-request-top">
              <strong>${escapeHtml(req.house || '')}, кв. ${escapeHtml(req.flat || '—')}</strong>
              ${req.isEmergency ? '<span class="resident-emergency">🚨 Житель отметил как аварийную</span>' : ''}
            </div>
            ${req.priority ? `<div class="resident-category">🔧 ${escapeHtml(req.priority)}</div>` : ''}
            <div class="resident-person">${escapeHtml(req.name || '')}</div>
            ${req.phone ? `<a class="phone-link" href="tel:${phoneForCall(req.phone)}">${escapeHtml(req.phone)}</a>` : ''}
            <div class="resident-description">${escapeHtml(req.description || '')}</div>
            <div class="resident-actions">
              <button type="button" onclick="acceptResidentRequestUi(${Number(req.rowNumber)}, false)">✅ Принять</button>
              <button type="button" class="resident-emergency-btn" onclick="acceptResidentRequestUi(${Number(req.rowNumber)}, true)">🚨 Как аварийную</button>
              <button type="button" class="dispatch-inbox-btn" onclick="acceptAndDispatchResident(${Number(req.rowNumber)})">👷 Принять и передать</button>
              <button type="button" class="resident-reject-btn" onclick="rejectResidentRequestUi(${Number(req.rowNumber)})">Отклонить</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function acceptResidentRequestUi(rowNumber, makeEmergency) {
  apiCall(
    'acceptResidentRequest',
    { rowNumber: rowNumber, makeEmergency: makeEmergency },
    function() {
      loadData();
    },
    function(error) {
      alert(error);
    }
  );
}

function rejectResidentRequestUi(rowNumber) {
  if (!confirm('Отклонить заявку жителя?')) return;

  apiCall(
    'rejectResidentRequest',
    { rowNumber: rowNumber },
    function() {
      loadData();
    },
    function(error) {
      alert(error);
    }
  );
}

function acceptAndDispatchResident(rowNumber) {
  apiCall(
    'acceptResidentRequest',
    { rowNumber: rowNumber, makeEmergency: false },
    function() {
      loadData();
      setTimeout(function() {
        openDispatchModal(rowNumber);
      }, 300);
    },
    function(error) {
      alert(error);
    }
  );
}

function openDispatchModal(rowNumber) {
  const req = findRequestByRow(rowNumber);
  CRM.state.currentDispatchRowNumber = rowNumber;

  setValue('dispatchCategory', req && req.priority ? req.priority : 'Сантехника');
  setValue('dispatchExecutor', req && req.executor ? req.executor : '');

  const modal = document.getElementById('dispatchModal');
  if (modal) modal.classList.add('active');
}

function closeDispatchModal() {
  CRM.state.currentDispatchRowNumber = null;

  const modal = document.getElementById('dispatchModal');
  if (modal) modal.classList.remove('active');
}

function setDispatchExecutor(value) {
  setValue('dispatchExecutor', value);
}

function confirmDispatchRequest() {
  const rowNumber = CRM.state.currentDispatchRowNumber;
  if (!rowNumber) return;

  const category = getValue('dispatchCategory');
  const executor = getValue('dispatchExecutor');

  if (!executor) {
    alert('Укажи исполнителя');
    return;
  }

  apiCall(
    'dispatchRequest',
    {
      rowNumber: rowNumber,
      category: category,
      executor: executor
    },
    function(result) {
      closeDispatchModal();
      showStatus(result.message || 'Заявка передана');
      loadData();

      setTimeout(function() {
        shareRequest(rowNumber);
      }, 300);
    },
    function(error) {
      alert(error);
    }
  );
}


function formatPlanForShare(value) {
  if (!value) return '';

  const text = String(value).trim();

  // Уже готовая русская дата из Apps Script.
  const ruMatch = text.match(
    /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2}))?/
  );

  if (ruMatch) {
    const day = String(ruMatch[1]).padStart(2, '0');
    const month = String(ruMatch[2]).padStart(2, '0');
    const year = String(ruMatch[3]).slice(-2);
    const time = ruMatch[4]
      ? ' в ' + String(ruMatch[4]).padStart(2, '0') + ':' + ruMatch[5]
      : '';

    return day + '.' + month + '.' + year + time;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return text;
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return day + '.' + month + '.' + year + ' в ' + hours + ':' + minutes;
}

function getRequestPhotoUrls(req) {
  return [].concat(req.photosBefore || [], req.photosAfter || [])
    .map(function(photo) { return photo && (photo.url || photo.thumb); })
    .filter(Boolean);
}

function buildRequestShareText(req) {
  const photoUrls = getRequestPhotoUrls(req);
  const lines = [
    'ЗАЯВКА ' + (req.id || ''),
    'Дом: ' + (req.house || ''),
    req.flat ? (isCommonPropertyRequest(req) ? 'Место: ' : 'Квартира: ') + req.flat : '',
    getRecordTypeLabel(req) ? 'Тип: ' + getRecordTypeLabel(req).replace(/^[^ ]+ /, '') : '',
    req.name ? (isCommonPropertyRequest(req) ? 'Сообщил: ' : 'Контакт: ') + req.name : '',
    req.phone ? 'Телефон: ' + req.phone : '',
    req.priority ? 'Категория: ' + req.priority : '',
    req.executor ? 'Исполнитель: ' + req.executor : '',
    req.planDate ? 'Плановый визит: ' + formatPlanForShare(req.planDate) : '',
    '',
    req.description || '',
    photoUrls.length ? '\nФотографии:\n' + photoUrls.join('\n') : ''
  ];

  return lines.filter(function(line, index) {
    return line !== '' || index === lines.length - 3;
  }).join('\n').trim();
}

async function loadShareFiles(req) {
  const photos = [].concat(req.photosBefore || [], req.photosAfter || []).filter(Boolean).slice(0, 6);
  const files = [];
  for (let i = 0; i < photos.length; i++) {
    const url = photos[i].url || photos[i].thumb;
    if (!url) continue;
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) continue;
      const blob = await response.blob();
      files.push(new File([blob], 'zayavka-' + (req.id || 'photo') + '-' + (i + 1) + '.jpg', { type: blob.type || 'image/jpeg' }));
    } catch (error) {
      console.warn('Не удалось подготовить фото для отправки', error);
    }
  }
  return files;
}

async function shareRequest(rowNumber) {
  const req = findRequestByRow(rowNumber);
  if (!req) {
    alert('Заявка не найдена');
    return;
  }

  const text = buildRequestShareText(req);
  if (navigator.share) {
    try {
      const files = await loadShareFiles(req);
      const shareData = { title: 'Заявка ' + (req.id || ''), text: text };
      if (files.length && navigator.canShare && navigator.canShare({ files: files })) {
        shareData.files = files;
      }
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error && error.name === 'AbortError') return;
    }
  }

  fallbackCopyRequest(text);
}

function fallbackCopyRequest(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(function() { alert('Текст заявки и ссылки на фото скопированы'); })
      .catch(function() { prompt('Скопируй заявку:', text); });
  } else {
    prompt('Скопируй заявку:', text);
  }
}

function saveRequestContact(rowNumber) {
  const req = findRequestByRow(rowNumber);
  if (!req || !req.phone) {
    alert('В заявке нет телефона');
    return;
  }

  const cleanPart = function(value) {
    return String(value || '')
      .replace(/[\r\n;]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };
  const escapeVCard = function(value) {
    return cleanPart(value)
      .replace(/\\/g, '\\\\')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  };

  const house = cleanPart(req.house) || 'Адрес не указан';
  const flat = cleanPart(req.flat);
  const person = cleanPart(req.name);
  const addressPart = flat ? (house + ', кв. ' + flat) : house;
  const contactName = person ? (addressPart + ' — ' + person) : addressPart;
  const phone = String(req.phone).replace(/[^+\d]/g, '');
  const escapedName = escapeVCard(contactName);

  const vcard = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'FN:' + escapedName,
    'N:' + escapedName + ';;;;',
    'TEL;TYPE=CELL:' + phone,
    'END:VCARD',
    ''
  ].join('\r\n');

  // Без BOM: Samsung Contacts может считать BOM частью первой строки
  // и отклонить корректный vCard как нечитаемый.
  const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = contactName.replace(/[^a-zA-Zа-яА-Я0-9_-]+/g, '_') + '.vcf';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function() { URL.revokeObjectURL(objectUrl); }, 1000);
}


document.addEventListener('DOMContentLoaded', function(){ setRecordType(getValue('recordType') || 'resident'); });



/* ===== v0.21: отдельный раздел других адресов ===== */

function getOtherAddressRequests() {
  const all = CRM && CRM.data && Array.isArray(CRM.data.allRequests)
    ? CRM.data.allRequests
    : [];

  return all.filter(function(req) {
    return isOtherAddressRequest(req);
  });
}

function getOtherAddressNames() {
  const names = getOtherAddressRequests()
    .map(function(req) {
      return String(req.house || '').trim();
    })
    .filter(Boolean);

  return Array.from(new Set(names)).sort(function(a, b) {
    return a.localeCompare(b, 'ru', { numeric: true });
  });
}

function setupOtherAddressesView() {
  const select = document.getElementById('otherAddressSelect');
  const controls = document.getElementById('otherAddressControls');
  const empty = document.getElementById('otherAddressesEmpty');

  if (!select || !controls || !empty) return;

  const addresses = getOtherAddressNames();
  const current = select.value;

  if (!addresses.length) {
    controls.hidden = true;
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  controls.hidden = false;

  select.innerHTML = addresses.map(function(address) {
    return '<option value="' + escapeHtml(address) + '">' +
      escapeHtml(address) +
      '</option>';
  }).join('');

  if (current && addresses.includes(current)) {
    select.value = current;
  }

  renderOtherAddressCard();
}

function renderOtherAddressCard() {
  const select = document.getElementById('otherAddressSelect');
  const box = document.getElementById('otherAddressCard');

  if (!select || !box) return;

  const address = select.value;
  const requests = getOtherAddressRequests()
    .filter(function(req) {
      return String(req.house || '') === address;
    })
    .sort(function(a, b) {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

  if (!address) {
    box.innerHTML = '';
    return;
  }

  const active = requests.filter(function(req) {
    return req.status !== 'Выполнено';
  }).length;

  const waiting = requests.filter(function(req) {
    return req.status === 'Ожидает';
  }).length;

  const done = requests.filter(function(req) {
    return req.status === 'Выполнено';
  }).length;

  const contacts = Array.from(new Map(
    requests
      .filter(function(req) {
        return req.name || req.phone;
      })
      .map(function(req) {
        const key = (req.name || '') + '|' + (req.phone || '');
        return [key, { name: req.name || '', phone: req.phone || '' }];
      })
  ).values());

  box.innerHTML = `
    <div class="other-address-title-row">
      <div>
        <div class="other-address-title">📍 ${escapeHtml(address)}</div>
        <div class="other-address-count">Всего заявок: ${requests.length}</div>
      </div>
      <button type="button" class="compact-action-btn" onclick="createOtherAddressRequest(${JSON.stringify(address).replace(/"/g, '&quot;')})">
        ➕ Добавить
      </button>
    </div>

    <div class="house-stats other-address-stats">
      <div><strong>${active}</strong><span>Активных</span></div>
      <div><strong>${waiting}</strong><span>Ожидают</span></div>
      <div><strong>${done}</strong><span>Выполнено</span></div>
      <div><strong>${contacts.length}</strong><span>Контактов</span></div>
    </div>

    ${contacts.length ? `
      <h2 class="other-address-section-title">Контакты</h2>
      <div class="other-address-contacts">
        ${contacts.map(function(contact) {
          return `
            <div class="other-address-contact">
              <span>${escapeHtml(contact.name || 'Без имени')}</span>
              ${contact.phone
                ? '<a href="tel:' + escapeHtml(contact.phone) + '">' +
                  escapeHtml(formatPhone(contact.phone)) +
                  '</a>'
                : ''}
            </div>
          `;
        }).join('')}
      </div>
    ` : ''}

    <h2 class="other-address-section-title">Заявки по адресу</h2>
    <div class="other-address-request-list requests-list">
      ${requests.length
        ? requests.map(function(req) {
            return renderRequestCard(req, true);
          }).join('')
        : '<div class="empty-note">Заявок по этому адресу пока нет.</div>'}
    </div>
  `;
}

function createOtherAddressRequest(address) {
  showView('new');

  const house = document.getElementById('house');
  if (house) house.value = '__OTHER__';

  setValue('otherAddress', address || '');
  toggleOtherAddressField();

  window.setTimeout(function() {
    const target = address
      ? document.getElementById('flat')
      : document.getElementById('otherAddress');

    if (target) target.focus();
  }, 120);
}


/* ===== v0.18: режим обхода дома ===== */
CRM.walk = { active:false, house:'', startedAt:null, entries:[] };

function setupWalkthroughView() {
  const select = document.getElementById('walkHouse');
  if (!select || !CRM || !CRM.data) return;

  const current = select.value;
  const houses = Array.isArray(CRM.data.houses)
    ? CRM.data.houses
    : [];

  select.innerHTML =
    '<option value="">— Выберите дом —</option>' +
    houses.map(function(house) {
      return '<option value="' + escapeHtml(house) + '">' +
        escapeHtml(house) +
        '</option>';
    }).join('') +
    '<option value="__OTHER__">Другой адрес</option>';

  const known = Array.from(select.options).some(function(option) {
    return option.value === current;
  });

  if (current && known) {
    select.value = current;
  }

  handleWalkHouseChange();
  renderWalkSession();
}

function startWalkthrough() {
  const house = getWalkHouseValue();

  if (!house) {
    alert(
      getValue('walkHouse') === '__OTHER__'
        ? 'Введи адрес для обхода'
        : 'Выбери дом для обхода'
    );
    return;
  }

  CRM.walk = {
    active: true,
    house: house,
    startedAt: new Date(),
    entries: []
  };

  renderWalkSession();
}

function finishWalkthrough(){ if(!CRM.walk.active)return; CRM.walk.active=false; renderWalkSession(); }
function resetWalkthrough(){ CRM.walk={active:false,house:'',startedAt:null,entries:[]}; const s=document.getElementById('walkHouse'); if(s)s.value=''; clearWalkEntryForm(); renderWalkSession(); }
function renderWalkSession(){
  const setup=document.getElementById('walkSetup'), active=document.getElementById('walkActive'), summary=document.getElementById('walkSummary'); if(!setup||!active||!summary)return;
  setup.hidden=CRM.walk.active||(!CRM.walk.active&&CRM.walk.entries.length>0); active.hidden=!CRM.walk.active; summary.hidden=CRM.walk.active||CRM.walk.entries.length===0;
  if(CRM.walk.active){ setText('walkHouseTitle',CRM.walk.house); setText('walkStartedAt','Начат в '+CRM.walk.startedAt.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})); setText('walkCounter',String(CRM.walk.entries.length)); renderWalkEntries(); }
  else if(CRM.walk.entries.length) renderWalkSummary();
}
function toggleWalkCustomLocation(){ const s=document.getElementById('walkLocation'),i=document.getElementById('walkCustomLocation'); if(!s||!i)return; i.hidden=s.value!=='Другое'; if(i.hidden)i.value=''; else i.focus(); }
function getWalkLocation(){ const v=getValue('walkLocation'); return v==='Другое'?getValue('walkCustomLocation'):v; }
function clearWalkEntryForm(){ setValue('walkLocation',''); setValue('walkCustomLocation',''); setValue('walkDescription',''); setValue('walkPlanDate',''); const i=document.getElementById('walkCustomLocation'); if(i)i.hidden=true; }
function saveWalkEntry(){
  if(!CRM.walk.active)return; const location=getWalkLocation(),description=getValue('walkDescription'),planDate=getValue('walkPlanDate'),btn=document.getElementById('walkSaveBtn');
  if(!location){showWalkStatus('Укажи место или объект',true);return;} if(!description){showWalkStatus('Продиктуй или введи замечание',true);return;}
  if(btn){btn.disabled=true;btn.textContent='Сохраняю...';}
  apiCall('addRequest',{house:CRM.walk.house,flat:location,description:description,name:'Обнаружено при обходе',phone:'',planDate:planDate,isEmergency:false,category:'Общее имущество',source:'Обход дома'},function(result){CRM.walk.entries.push({id:result.id||'',location,description,planDate}); clearWalkEntryForm(); renderWalkSession(); loadData(); if(btn){btn.disabled=false;btn.textContent='✓ Сохранить замечание';} showWalkStatus('Замечание сохранено',false);},function(error){if(btn){btn.disabled=false;btn.textContent='✓ Сохранить замечание';} showWalkStatus('Ошибка: '+error,true);});
}
function renderWalkEntries(){ const l=document.getElementById('walkSessionList'); if(!l)return; if(!CRM.walk.entries.length){l.innerHTML='<div class="empty-note">Во время обхода замечаний пока нет.</div>';return;} l.innerHTML='<h2 class="walk-list-title">Замечания этого обхода</h2>'+CRM.walk.entries.slice().reverse().map((e,i)=>'<div class="walk-entry-item"><div class="walk-entry-number">'+(CRM.walk.entries.length-i)+'</div><div><strong>📍 '+escapeHtml(e.location)+'</strong><div>'+escapeHtml(e.description)+'</div>'+(e.planDate?'<div class="walk-entry-plan">📅 '+escapeHtml(formatPlanForShare(e.planDate))+'</div>':'')+'</div></div>').join(''); }
function renderWalkSummary(){ const b=document.getElementById('walkSummary'); if(!b)return; const counts={}; CRM.walk.entries.forEach(e=>counts[e.location]=(counts[e.location]||0)+1); const rows=Object.keys(counts).sort((a,b)=>a.localeCompare(b,'ru',{numeric:true})).map(k=>'<div class="walk-summary-row"><span>'+escapeHtml(k)+'</span><strong>'+counts[k]+'</strong></div>').join(''); b.innerHTML='<div class="walk-summary-card"><div class="walk-summary-icon">✓</div><h2>Обход завершён</h2><div class="walk-summary-house">'+escapeHtml(CRM.walk.house)+'</div><div class="walk-summary-total">Создано замечаний: <strong>'+CRM.walk.entries.length+'</strong></div><div class="walk-summary-rows">'+rows+'</div><button type="button" onclick="shareWalkSummary()">📤 Поделиться итогом</button><button type="button" class="walk-new-btn" onclick="resetWalkthrough()">Начать новый обход</button></div>'; }
function buildWalkSummaryText(){ const lines=['ОБХОД ДОМА',CRM.walk.house,'Создано замечаний: '+CRM.walk.entries.length,'']; CRM.walk.entries.forEach((e,i)=>{lines.push((i+1)+'. '+e.location,e.description); if(e.planDate)lines.push('Срок: '+formatPlanForShare(e.planDate)); lines.push('');}); return lines.join('\n').trim(); }
async function shareWalkSummary(){ const text=buildWalkSummaryText(); if(navigator.share){try{await navigator.share({title:'Обход дома: '+CRM.walk.house,text});return;}catch(e){if(e&&e.name==='AbortError')return;}} try{await navigator.clipboard.writeText(text);alert('Итог обхода скопирован');}catch(e){prompt('Скопируй итог обхода:',text);} }
function showWalkStatus(text,isError){ const b=document.getElementById('walkVoiceStatus'); if(!b)return; b.textContent=text;b.classList.toggle('error',!!isError);b.style.display='block';clearTimeout(showWalkStatus.timer);showWalkStatus.timer=setTimeout(()=>b.style.display='none',2500); }
let walkRecognition=null,walkVoiceActive=false;
function toggleWalkVoice(){ const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR){showWalkStatus('Голосовой ввод не поддерживается',true);return;} if(walkVoiceActive&&walkRecognition){walkRecognition.stop();return;} walkRecognition=new SR(); walkRecognition.lang='ru-RU'; walkRecognition.interimResults=false; walkRecognition.continuous=false; const btn=document.getElementById('walkVoiceBtn'); walkRecognition.onstart=()=>{walkVoiceActive=true;if(btn){btn.classList.add('listening');btn.textContent='⏹ Остановить';}showWalkStatus('Слушаю…',false);}; walkRecognition.onresult=e=>{const t=e.results[0][0].transcript.trim(); const d=document.getElementById('walkDescription'); if(d)d.value=t; showWalkStatus('Распознано',false);}; walkRecognition.onerror=e=>showWalkStatus('Ошибка микрофона: '+(e.error||'неизвестно'),true); walkRecognition.onend=()=>{walkVoiceActive=false;if(btn){btn.classList.remove('listening');btn.textContent='🎙 Говорить';}}; walkRecognition.start(); }


/* v0.20 — запуск из ярлыков Windows */
document.addEventListener('DOMContentLoaded', function() {
  const params = new URLSearchParams(window.location.search);
  const requestedView = params.get('view');
  if (requestedView && ['home','new','accepted','search','houses','other','walk'].includes(requestedView)) {
    setTimeout(function() { showView(requestedView); }, 300);
  }
});


/* ===== v1.0: архив, корзина, восстановление ===== */
function archiveRequestUi(rowNumber) {
  if (!confirm('Переместить заявку в архив?')) return;
  apiCall('archiveRequest',{rowNumber:rowNumber},function(r){showStatus(r.message);loadData();},function(e){showStatus(e,true);});
}
function trashRequestUi(rowNumber) {
  if (!confirm('Переместить заявку в корзину?')) return;
  apiCall('moveRequestToTrash',{rowNumber:rowNumber},function(r){showStatus(r.message);loadData();},function(e){showStatus(e,true);});
}
function restoreRequestUi(rowNumber) {
  apiCall('restoreRequest',{rowNumber:rowNumber},function(r){showStatus(r.message);loadData();},function(e){showStatus(e,true);});
}
function archiveCurrentRequest() {
  const row=CRM.state.currentEditRowNumber;
  if(!row)return;
  closeEditModal();
  archiveRequestUi(row);
}
function trashCurrentRequest() {
  const row=CRM.state.currentEditRowNumber;
  if(!row)return;
  closeEditModal();
  trashRequestUi(row);
}
