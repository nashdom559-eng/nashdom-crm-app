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

const APP = {
  VERSION: '0.6.2',
  SHEETS: {
    REQUESTS: 'Заявки',
    HOUSES: 'Дома',
    CONTACTS: 'Контакты'
  },
  STATUSES: {
    ACCEPTED: 'Принято',
    WAITING: 'Ожидает',
    DONE: 'Выполнено'
  }
};

function doGet(e) {
  if (e && e.parameter && e.parameter.api === '1') {
    return handleApiRequest_(e);
  }

  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('НашДом CRM')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getAppData() {
  const allRequests = getAllRequests();

  return {
    version: APP.VERSION,
    houses: getHouses(),
    contacts: getContacts(),
    acceptedRequests: allRequests.filter(item => item.status !== APP.STATUSES.DONE),
    allRequests: allRequests
  };
}

function getHouses() {
  const sheet = getSheet_(APP.SHEETS.HOUSES);
  return sheet.getRange('A2:A').getValues().flat().filter(String);
}

function getContacts() {
  const sheet = getSheet_(APP.SHEETS.CONTACTS);
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) return [];

  return values
    .slice(1)
    .filter(row => row[0] || row[1])
    .map(row => ({
      house: String(row[0] || '').trim(),
      flat: String(row[1] || '').trim(),
      name: String(row[2] || '').trim(),
      phone: String(row[3] || '').replace(/^'/, '').trim(),
      role: String(row[4] || '').trim(),
      note: String(row[5] || '').trim()
    }));
}

function addRequest(data) {
  const sheet = getSheet_(APP.SHEETS.REQUESTS);
  const nextId = makeNextId_(sheet);
  const planDate = parsePlanDate_(data.planDate);

  const calendarEventId = planDate
    ? createOrUpdateCalendarEvent_('', nextId, APP.STATUSES.ACCEPTED, data, planDate)
    : '';

  sheet.appendRow([
    nextId,
    new Date(),
    data.house || '',
    data.flat || '',
    data.name || '',
    data.phone ? "'" + data.phone : '',
    data.category || '',
    data.description || '',
    data.priority || '',
    APP.STATUSES.ACCEPTED,
    data.executor || '',
    planDate || '',
    '',
    '',
    '',
    calendarEventId || '',
    'Вручную'
  ]);

  return {
    ok: true,
    message: 'Заявка принята № ' + nextId
  };
}

function closeRequest(rowNumber, comment) {
  const sheet = getSheet_(APP.SHEETS.REQUESTS);

  if (!rowNumber || rowNumber < 2) {
    throw new Error('Некорректный номер строки');
  }

  const eventId = String(sheet.getRange(rowNumber, 16).getValue() || '');
  if (eventId) deleteCalendarEvent_(eventId);

  sheet.getRange(rowNumber, 10).setValue(APP.STATUSES.DONE);
  sheet.getRange(rowNumber, 13).setValue(new Date());
  sheet.getRange(rowNumber, 15).setValue(comment || '');
  sheet.getRange(rowNumber, 16).setValue('');

  return {
    ok: true,
    message: 'Заявка выполнена'
  };
}

function holdRequest(rowNumber, comment, action, reminderDateValue) {
  const sheet = getSheet_(APP.SHEETS.REQUESTS);

  if (!rowNumber || rowNumber < 2) {
    throw new Error('Некорректный номер строки');
  }

  const req = getRequestFromRow_(sheet, rowNumber);
  const reminderDate = parsePlanDate_(reminderDateValue);

  const parts = [];
  if (comment) parts.push('Причина: ' + comment);
  if (action) parts.push('Следующее действие: ' + action);

  const fullComment = parts.join('\n');

  let eventId = req.calendarEventId || '';

  if (reminderDate) {
    const data = {
      house: req.house,
      flat: req.flat,
      name: req.name,
      phone: req.phone,
      description: req.description,
      comment: fullComment
    };

    eventId = createOrUpdateCalendarEvent_(
      eventId,
      req.id,
      APP.STATUSES.WAITING,
      data,
      reminderDate
    );
  } else if (eventId) {
    deleteCalendarEvent_(eventId);
    eventId = '';
  }

  sheet.getRange(rowNumber, 10).setValue(APP.STATUSES.WAITING);
  sheet.getRange(rowNumber, 12).setValue(reminderDate || '');
  sheet.getRange(rowNumber, 15).setValue(fullComment);
  sheet.getRange(rowNumber, 16).setValue(eventId || '');

  return {
    ok: true,
    message: 'Заявка переведена в ожидание'
  };
}

function updateRequestPlan(rowNumber, planDateValue) {
  const sheet = getSheet_(APP.SHEETS.REQUESTS);

  if (!rowNumber || rowNumber < 2) {
    throw new Error('Некорректный номер строки');
  }

  const req = getRequestFromRow_(sheet, rowNumber);
  const planDate = parsePlanDate_(planDateValue);

  let eventId = req.calendarEventId || '';

  if (planDate) {
    const data = {
      house: req.house,
      flat: req.flat,
      name: req.name,
      phone: req.phone,
      description: req.description,
      comment: req.comment
    };

    eventId = createOrUpdateCalendarEvent_(
      eventId,
      req.id,
      req.status,
      data,
      planDate
    );
  } else if (eventId) {
    deleteCalendarEvent_(eventId);
    eventId = '';
  }

  sheet.getRange(rowNumber, 12).setValue(planDate || '');
  sheet.getRange(rowNumber, 16).setValue(eventId || '');

  return {
    ok: true,
    message: planDate ? 'Плановый визит назначен' : 'Плановый визит очищен'
  };
}

function getAllRequests() {
  const sheet = getSheet_(APP.SHEETS.REQUESTS);
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) return [];

  return values
    .slice(1)
    .filter(row => row[0])
    .map((row, index) => ({
      rowNumber: index + 2,
      id: String(row[0] || ''),
      date: formatDateSafe(row[1]),
      rawDate: toLocalInputSafe_(row[1]),
      house: String(row[2] || ''),
      flat: String(row[3] || ''),
      name: String(row[4] || ''),
      phone: String(row[5] || '').replace(/^'/, ''),
      category: String(row[6] || ''),
      description: String(row[7] || ''),
      priority: String(row[8] || ''),
      status: String(row[9] || APP.STATUSES.ACCEPTED),
      executor: String(row[10] || ''),
      planDate: formatDateSafe(row[11]),
      rawPlanDate: toLocalInputSafe_(row[11]),
      doneDate: formatDateSafe(row[12]),
      rawDoneDate: toLocalInputSafe_(row[12]),
      control: String(row[13] || ''),
      comment: String(row[14] || ''),
      calendarEventId: String(row[15] || ''),
      source: String(row[16] || '')
    }))
    .reverse();
}

function getRequestFromRow_(sheet, rowNumber) {
  const row = sheet.getRange(rowNumber, 1, 1, 17).getValues()[0];

  return {
    rowNumber: rowNumber,
    id: String(row[0] || ''),
    date: row[1],
    house: String(row[2] || ''),
    flat: String(row[3] || ''),
    name: String(row[4] || ''),
    phone: String(row[5] || '').replace(/^'/, ''),
    category: String(row[6] || ''),
    description: String(row[7] || ''),
    priority: String(row[8] || ''),
    status: String(row[9] || APP.STATUSES.ACCEPTED),
    executor: String(row[10] || ''),
    planDate: row[11],
    doneDate: row[12],
    control: String(row[13] || ''),
    comment: String(row[14] || ''),
    calendarEventId: String(row[15] || ''),
    source: String(row[16] || '')
  };
}

function createOrUpdateCalendarEvent_(eventId, requestId, status, data, date) {
  const start = date;
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const title =
    'НашДом: ' +
    (data.house || '') +
    ' кв. ' +
    (data.flat || '');

  const description =
    'Заявка № ' + requestId + '\n' +
    'Статус: ' + status + '\n\n' +
    'ФИО: ' + (data.name || '') + '\n' +
    'Телефон: ' + (data.phone || '') + '\n\n' +
    'Описание:\n' + (data.description || '') +
    (data.comment ? '\n\nКомментарий:\n' + data.comment : '');

  let event = null;

  if (eventId) {
    try {
      event = CalendarApp.getDefaultCalendar().getEventById(eventId);
    } catch (e) {
      event = null;
    }
  }

  if (event) {
    event.setTitle(title);
    event.setTime(start, end);
    event.setDescription(description);
    event.removeAllReminders();
    event.addPopupReminder(60);
    return event.getId();
  }

  event = CalendarApp.getDefaultCalendar().createEvent(title, start, end, {
    description: description
  });

  event.addPopupReminder(60);

  return event.getId();
}

function deleteCalendarEvent_(eventId) {
  if (!eventId) return;

  try {
    const event = CalendarApp.getDefaultCalendar().getEventById(eventId);
    if (event) {
      event.deleteEvent();
    }
  } catch (e) {
    // Если событие уже удалено вручную — просто молча пропускаем
  }
}

function parsePlanDate_(value) {
  if (!value) return '';

  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '';

  return date;
}

function makeNextId_(sheet) {
  const year = new Date().getFullYear();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return year + '-0001';

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  let maxNumber = 0;

  ids.forEach(id => {
    const match = String(id || '').match(/^(\d{4})-(\d+)$/);
    if (match && Number(match[1]) === year) {
      maxNumber = Math.max(maxNumber, Number(match[2]));
    }
  });

  return year + '-' + String(maxNumber + 1).padStart(4, '0');
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);

  if (!sheet) {
    throw new Error('Не найден лист "' + name + '"');
  }

  return sheet;
}

function formatDateSafe(value) {
  if (!value) return '';

  try {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');
  } catch (e) {
    return String(value);
  }
}

function toLocalInputSafe_(value) {
  if (!value) return '';

  try {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '';
    return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm");
  } catch (e) {
    return '';
  }
}
function testCalendarAccess() {
  CalendarApp.getDefaultCalendar().createEvent(
    'Тест НашДом CRM',
    new Date(Date.now() + 60 * 60 * 1000),
    new Date(Date.now() + 2 * 60 * 60 * 1000)
  ).addPopupReminder(10);
}
function handleApiRequest_(e) {
  const action = e.parameter.action || '';
  const callback = e.parameter.callback || '';
  const payload = parseApiPayload_(e.parameter.payload);

  try {
    let result;

    if (action === 'getAppData') {
      result = getAppData();
    } else if (action === 'addRequest') {
      result = addRequest(payload);
    } else if (action === 'closeRequest') {
      result = closeRequest(Number(payload.rowNumber), payload.comment || '');
    } else if (action === 'holdRequest') {
      result = holdRequest(
        Number(payload.rowNumber),
        payload.comment || '',
        payload.action || '',
        payload.reminder || ''
      );
    } else if (action === 'updateRequestPlan') {
      result = updateRequestPlan(Number(payload.rowNumber), payload.planDate || '');
    } else {
      throw new Error('Неизвестное действие API: ' + action);
    }

    return apiResponse_({
      ok: true,
      result: result
    }, callback);

  } catch (error) {
    return apiResponse_({
      ok: false,
      error: error.message || String(error)
    }, callback);
  }
}

function parseApiPayload_(value) {
  if (!value) return {};

  try {
    return JSON.parse(value);
  } catch (e) {
    return {};
  }
}

function apiResponse_(data, callback) {
  const json = JSON.stringify(data);

  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
