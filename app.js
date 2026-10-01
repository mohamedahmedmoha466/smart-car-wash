const storageKey = 'bayflow-admin-bookings';
const paymentMethods = ['Pending', 'M-Pesa', 'Visa card', 'MasterCard', 'PayPal', 'Binance'];
const validTimeSlots = ['09:00 – 09:30', '09:30 – 10:00', '10:00 – 10:30', '10:30 – 11:00', '11:00 – 11:30', '11:30 – 12:00', '12:00 – 12:30', '12:30 – 13:00', '13:00 – 13:30', '13:30 – 14:00', '14:00 – 14:30', '14:30 – 15:00'];
const allowedStatuses = ['Pending', 'Scheduled', 'Confirmed', 'Completed', 'Arrived'];
const todayDateString = () => new Date().toISOString().split('T')[0];
function normalizeDateValue(date) {
    if (!date || !datePattern.test(date)) return todayDateString();
    const parsedDate = new Date(date + 'T00:00:00');
    if (Number.isNaN(parsedDate.getTime())) return todayDateString();
    if (parsedDate.getFullYear() < new Date().getFullYear()) return todayDateString();
    return date;
}
function sanitizeText(value, fallback = '') {
    return String(value || '').replace(/[<>]/g, '').trim() || fallback;
}
const defaultBookings = [
    {
        id: '#BK-1042',
        customer: 'Maya Chen',
        plate: 'NPT 4821',
        date: todayDateString(),
        time: '11:00 – 11:30',
        wash: 'Full detail',
        status: 'Confirmed',
        payment: 'M-Pesa',
        initials: 'MC'
    },
    {
        id: '#BK-1043',
        customer: 'Amin Yusuf',
        plate: 'KPX 6409',
        date: todayDateString(),
        time: '12:00 – 12:30',
        wash: 'Express exterior',
        status: 'Arrived',
        payment: 'Visa card',
        initials: 'AY'
    },
    {
        id: '#BK-1044',
        customer: 'Lina Omar',
        plate: 'JTR 1180',
        date: todayDateString(),
        time: '13:00 – 13:30',
        wash: 'Interior refresh',
        status: 'Scheduled',
        payment: 'PayPal',
        initials: 'LO'
    }
];

function loadBookings() {
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey));
        return Array.isArray(saved) && saved.length ? saved : defaultBookings;
    } catch (error) {
        return defaultBookings;
    }
}

const state = { bookings: [], queue: [], scanIndex: 0, alerts: 2 };
const arrivalScans = [
    { plate: 'KPX 6409', mode: 'match', payment: 'M-Pesa' },
    { plate: 'JTR 1180', mode: 'outside-slot', payment: 'Visa card' },
    { plate: 'QRS 7712', mode: 'walk-in', payment: 'Pending' }
];
const $ = (selector) => document.querySelector(selector);
const queueList = $('#queue-list');
const bookingTable = $('#booking-table');
const toast = $('#toast');
const bookingRoles = ['admin', 'operations-lead', 'manager'];
const adminRole = 'admin';
const platePattern = /^[A-Z]{3} [0-9]{4}$/;
const customerPattern = /^[A-Za-z][A-Za-z '\-]{1,59}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function statusClass(status) {
    return allowedStatuses.includes(status) ? status.toLowerCase() : 'pending';
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[character]));
}

function saveBookings() {
    if (!hasBookingAccess()) return false;
    localStorage.setItem(storageKey, JSON.stringify(state.bookings));
    return true;
}

function hasBookingAccess() {
    return bookingRoles.includes(document.body.dataset.role);
}

function isAdmin() {
    return document.body.dataset.role === adminRole;
}

function normalizeBooking(booking) {
    if (!booking || typeof booking !== 'object') return null;

    const status = allowedStatuses.includes(booking.status) ? booking.status : 'Pending';
    const plate = String(booking.plate || '').trim().toUpperCase().replace(/\s+/g, ' ');
    const customer = String(booking.customer || '').trim();
    const date = String(booking.date || '').trim();
    const time = String(booking.time || '').trim();

    if (!platePattern.test(plate) || !customerPattern.test(customer)) return null;
    const cleanedDate = normalizeDateValue(date);

    return {
        ...booking,
        plate,
        customer,
        date: cleanedDate,
        time,
        status,
        payment: paymentMethods.includes(booking.payment) ? booking.payment : 'Pending'
    };
}

state.bookings = loadBookings().map(normalizeBooking).filter(Boolean);
saveBookings();

function nextBookingId() {
    const lastId = state.bookings.reduce((highest, booking) => Math.max(highest, Number(booking.id.replace('#BK-', '')) || 0), 1045);
    return `#BK-${lastId + 1}`;
}

function renderQueue() {
    const arrived = state.bookings.filter((booking) => booking.status === 'Arrived');
    state.queue = arrived;
    $('#queue-total').textContent = String(arrived.length).padStart(2, '0');
    queueList.innerHTML = arrived.length
        ? arrived.map((booking, index) => `<div class="queue-row"><span class="queue-number">${index + 1}</span><div class="queue-customer"><strong>${escapeHtml(booking.customer)}</strong><small>${escapeHtml(booking.wash)}</small></div><span class="plate">${escapeHtml(booking.plate)}</span><span class="queue-time">${index === 0 ? 'Washing now' : 'Up next'}</span></div>`).join('')
        : '<div class="empty-state">No cars are waiting in the wash queue.</div>';
}

function renderBookings() {
    bookingTable.innerHTML = state.bookings.map((booking) => `
        <tr>
            <td>${escapeHtml(booking.id)}</td>
            <td class="plate">${escapeHtml(booking.plate)}</td>
            <td>${escapeHtml(booking.date)}<br><small>${escapeHtml(booking.time)}</small></td>
            <td>${escapeHtml(booking.wash)}</td>
            <td>
                <select class="status-select ${statusClass(booking.status)}" data-booking-id="${escapeHtml(booking.id)}" aria-label="Status for ${escapeHtml(booking.id)}" ${hasBookingAccess() ? '' : 'disabled'}>
                    ${allowedStatuses.map((status) => `<option ${status === booking.status ? 'selected' : ''}>${status}</option>`).join('')}
                </select>
            </td>
            <td class="${booking.payment === 'Pending' ? 'pending-payment' : 'paid'}">${escapeHtml(booking.payment)}</td>
            <td>•••</td>
        </tr>
    `).join('');

    $('#booking-total').textContent = String(state.bookings.length + 20).padStart(2, '0');
    $('#completed-total').textContent = String(state.bookings.filter((booking) => booking.status === 'Completed').length).padStart(2, '0');
    $('#attention-total').textContent = String(state.alerts).padStart(2, '0');
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('visible'), 3000);
}

function formatLongDate(date = new Date()) {
    return new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).format(date);
}

function updateCurrentDate() {
    const label = document.getElementById('today-date-label');
    if (label) {
        label.textContent = formatLongDate();
    }

    const dateInput = $('#date-input');
    if (dateInput) {
        dateInput.value = todayDateString();
    }
}

function render() {
    state.bookings = state.bookings.map((booking) => ({
        ...booking,
        date: normalizeDateValue(booking.date)
    }));
    saveBookings();
    renderQueue();
    renderBookings();
    updateCurrentDate();
}

$('#new-booking').addEventListener('click', () => {
    updateCurrentDate();
    $('#booking-modal').showModal();
});

$('#payment-input').addEventListener('change', () => {
    const method = $('#payment-input').value;
    if (method === 'Pending') {
        showToast('No payment method selected yet.');
        return;
    }
    showToast(`${method} selected for this booking.`);
});

$('#clear-bookings').addEventListener('click', () => {
    if (!isAdmin()) {
        showToast('Only an admin can clear the booking database.');
        return;
    }

    if (!window.confirm('Clear all bookings from the admin database?')) return;

    state.bookings = [];
    saveBookings();
    render();
    showToast('Admin booking database cleared.');
});

$('#booking-form').addEventListener('submit', (event) => {
    event.preventDefault();

    if (!hasBookingAccess()) {
        showToast('Your role cannot create bookings.');
        return;
    }

    const customer = sanitizeText($('#customer-input').value, '');
    const plate = sanitizeText($('#plate-input').value, '').trim().toUpperCase().replace(/\s+/g, ' ');
    const date = normalizeDateValue($('#date-input').value);
    const time = sanitizeText($('#time-input').value, '');
    const status = allowedStatuses.includes($('#status-input').value) ? $('#status-input').value : 'Scheduled';

    if (!customerPattern.test(customer)) {
        showToast('Enter a valid customer name.');
        return;
    }

    if (!platePattern.test(plate)) {
        showToast('Plate must look like NPT 4821.');
        return;
    }

    if (!datePattern.test(date)) {
        showToast('Choose a valid booking date.');
        return;
    }

    if (!validTimeSlots.includes(time)) {
        showToast('Choose a valid booking time.');
        return;
    }

    const initials = customer.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    const payment = paymentMethods.includes($('#payment-input').value) ? $('#payment-input').value : 'Pending';

    state.bookings.push({
        id: nextBookingId(),
        plate,
        date,
        time,
        wash: $('#wash-input').value,
        status,
        payment,
        customer,
        initials
    });

    saveBookings();
    $('#booking-modal').close();
    event.target.reset();
    render();
    showToast(`Booking ${plate} saved as ${status}`);
});

bookingTable.addEventListener('change', (event) => {
    const select = event.target.closest('.status-select');
    if (!select || !hasBookingAccess() || !allowedStatuses.includes(select.value)) return;

    const booking = state.bookings.find((item) => item.id === select.dataset.bookingId);
    if (!booking) return;

    booking.status = select.value;
    saveBookings();
    render();
    showToast(`${booking.id} updated to ${booking.status}`);
});

$('#simulate-arrival').addEventListener('click', () => {
    const scan = arrivalScans[state.scanIndex % arrivalScans.length];
    const booking = state.bookings.find((item) => item.plate === scan.plate);
    state.scanIndex += 1;

    if (scan.mode === 'match' && booking) {
        booking.status = 'Arrived';
        saveBookings();
        render();
        showToast(`${scan.plate} matched. Gate opened and customer notified.`);
        return;
    }

    state.alerts += 1;
    renderBookings();

    if (scan.mode === 'outside-slot') {
        showToast(`${scan.plate} arrived outside its booking slot. Staff alerted.`);
        return;
    }

    showToast(`${scan.plate} is a walk-in. Registration required.`);
});

document.querySelectorAll('.nav-item, [data-view]').forEach((item) => {
    item.addEventListener('click', () => {
        const view = item.dataset.view;
        if (!view) return;

        document.querySelectorAll('.nav-item').forEach((nav) => nav.classList.toggle('active', nav.dataset.view === view));
        $('#page-title').textContent = view[0].toUpperCase() + view.slice(1);

        if (view !== 'overview') {
            showToast(`${view[0].toUpperCase() + view.slice(1)} view is ready for connection`);
        }
    });
});

document.querySelectorAll('.close-alert').forEach((button) => {
    button.addEventListener('click', (event) => {
        event.currentTarget.closest('.alert-item').remove();
        showToast('Alert cleared');
    });
});

render();