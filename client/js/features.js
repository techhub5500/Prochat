// Variáveis para o calendário
let currentView = 'month';
let currentDate = new Date();
let events = [];
let eventHistory = [];
let currentEvent = null; // Para edição

// Cores das tags
const tagColors = {
  'reunião': '#28a745',
  'prazo': '#dc3545',
  'feedback': '#ffc107'
};

// Inicializar features (calendário)
document.addEventListener('DOMContentLoaded', function() {
    console.log('Inicializando features...');
    initializeCalendar();
});

// Inicializar calendário
function initializeCalendar() {
    // Carregar eventos do servidor e localStorage
    loadEvents();
    
    // Event listeners para o modal do calendário
    document.getElementById('agenda-icon').addEventListener('click', openCalendarModal);
    document.getElementById('close-calendar-modal').addEventListener('click', closeCalendarModal);
    document.getElementById('prev-period').addEventListener('click', () => navigatePeriod(-1));
    document.getElementById('next-period').addEventListener('click', () => navigatePeriod(1));
    
    // Event listeners para visualizações
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => changeView(btn.dataset.view));
    });
    
    // Event listeners para o modal de evento
    document.getElementById('close-event-modal').addEventListener('click', closeEventModal);
    document.getElementById('event-details-form').addEventListener('submit', saveEventFromModal);
    document.getElementById('cancel-event-btn').addEventListener('click', closeEventModal);
    document.getElementById('delete-event-btn').addEventListener('click', deleteEvent);
    
    // Fechar modal do calendário ao clicar fora
    document.getElementById('calendar-modal').addEventListener('click', (e) => {
        if (e.target.id === 'calendar-modal') {
            closeCalendarModal();
        }
    });
    
    // Fechar modal de evento ao clicar fora
    document.getElementById('event-details-modal').addEventListener('click', (e) => {
        if (e.target.id === 'event-details-modal') {
            closeEventModal();
        }
    });
}

// Abrir modal do calendário
function openCalendarModal() {
    document.getElementById('calendar-modal').classList.add('show');
    renderCalendar();
}

// Fechar modal do calendário
function closeCalendarModal() {
    document.getElementById('calendar-modal').classList.remove('show');
    document.getElementById('event-form').classList.add('hidden');
}

// Renderizar calendário
function renderCalendar() {
    const container = document.getElementById('calendar-container');
    const periodDisplay = document.getElementById('current-period');
    
    if (currentView === 'month') {
        renderMonthView(container, periodDisplay);
    } else if (currentView === 'week') {
        renderWeekView(container, periodDisplay);
    } else if (currentView === 'day') {
        renderDayView(container, periodDisplay);
    }
    
    renderHistory();
}

// Renderizar visualização mensal
function renderMonthView(container, periodDisplay) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    periodDisplay.textContent = new Date(year, month).toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric'
    });
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Limpar o container
    container.innerHTML = `
        <div class="calendar-week-header">
            <div>Dom</div>
            <div>Seg</div>
            <div>Ter</div>
            <div>Qua</div>
            <div>Qui</div>
            <div>Sex</div>
            <div>Sáb</div>
        </div>
        <div class="calendar-grid"></div>
    `;
    
    const grid = container.querySelector('.calendar-grid');
    let html = '';
    
    // Loop apenas pelos dias do mês atual
    const current = new Date(firstDay);
    while (current <= lastDay) {
        const dayEvents = events.filter(event => {
            const eventDate = new Date(event.datetime);
            return eventDate.toDateString() === current.toDateString();
        });
        
        const isToday = current.toDateString() === new Date().toDateString();
        
        html += `
            <div class="calendar-day ${isToday ? 'today' : ''}" 
                 data-date="${current.toISOString().split('T')[0]}">
                <div class="calendar-day-number">${current.getDate()}</div>
                ${dayEvents.map(event => `
                    <div class="event-item tag-${event.tag}" 
                         data-event-id="${event.id}" 
                         title="${event.title} - ${new Date(event.datetime).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}">
                        ${event.title}
                    </div>
                `).join('')}
            </div>
        `;
        
        current.setDate(current.getDate() + 1);
    }
    
    grid.innerHTML = html;
    
    // Event listeners para dias
    grid.querySelectorAll('.calendar-day').forEach(day => {
        day.addEventListener('click', () => openEventModal(day.dataset.date));
    });
    
    // Event listeners para eventos existentes
    grid.querySelectorAll('.event-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation(); // Evitar abrir modal do dia
            const eventId = item.dataset.eventId;
            const event = events.find(e => e.id === eventId);
            if (event) {
                openEventModal(null, event);
            }
        });
    });
}

// Renderizar visualização semanal
function renderWeekView(container, periodDisplay) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const day = currentDate.getDate();
    
    // Calcular início da semana (domingo)
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(day - currentDate.getDay());
    
    // Calcular fim da semana (sábado)
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    
    periodDisplay.textContent = `${startOfWeek.toLocaleDateString('pt-BR')} - ${endOfWeek.toLocaleDateString('pt-BR')}`;
    
    // Limpar o container
    container.innerHTML = `
        <div class="calendar-week-header">
            <div>Dom</div>
            <div>Seg</div>
            <div>Ter</div>
            <div>Qua</div>
            <div>Qui</div>
            <div>Sex</div>
            <div>Sáb</div>
        </div>
        <div class="calendar-grid"></div>
    `;
    
    const grid = container.querySelector('.calendar-grid');
    let html = '';
    
    // Loop pelos dias da semana
    const current = new Date(startOfWeek);
    for (let i = 0; i < 7; i++) {
        const dayEvents = events.filter(event => {
            const eventDate = new Date(event.datetime);
            return eventDate.toDateString() === current.toDateString();
        });
        
        const isToday = current.toDateString() === new Date().toDateString();
        const isCurrentMonth = current.getMonth() === month;
        
        html += `
            <div class="calendar-day ${isToday ? 'today' : ''} ${isCurrentMonth ? '' : 'other-month'}" 
                 data-date="${current.toISOString().split('T')[0]}">
                <div class="calendar-day-number">${current.getDate()}</div>
                ${dayEvents.map(event => `
                    <div class="event-item tag-${event.tag}" 
                         data-event-id="${event.id}" 
                         title="${event.title} - ${new Date(event.datetime).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}">
                        ${event.title}
                    </div>
                `).join('')}
            </div>
        `;
        
        current.setDate(current.getDate() + 1);
    }
    
    grid.innerHTML = html;
    
    // Event listeners para dias
    grid.querySelectorAll('.calendar-day').forEach(day => {
        day.addEventListener('click', () => openEventModal(day.dataset.date));
    });
    
    // Event listeners para eventos
    grid.querySelectorAll('.event-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const eventId = item.dataset.eventId;
            const event = events.find(e => e.id === eventId);
            if (event) {
                openEventModal(null, event);
            }
        });
    });
}

// Renderizar visualização diária
function renderDayView(container, periodDisplay) {
    const dateStr = currentDate.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    
    periodDisplay.textContent = dateStr;
    
    // Limpar o container
    container.innerHTML = `
        <div class="calendar-week-header">
            <div>${currentDate.toLocaleDateString('pt-BR', { weekday: 'long' })}</div>
        </div>
        <div class="calendar-grid"></div>
    `;
    
    const grid = container.querySelector('.calendar-grid');
    let html = '';
    
    // Eventos do dia
    const dayEvents = events.filter(event => {
        const eventDate = new Date(event.datetime);
        return eventDate.toDateString() === currentDate.toDateString();
    });
    
    html += `
        <div class="calendar-day today" data-date="${currentDate.toISOString().split('T')[0]}">
            <div class="calendar-day-number">${currentDate.getDate()}</div>
            ${dayEvents.map(event => `
                <div class="event-item tag-${event.tag}" 
                     data-event-id="${event.id}" 
                     title="${event.title} - ${new Date(event.datetime).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}">
                    ${event.title}
                </div>
            `).join('')}
        </div>
    `;
    
    grid.innerHTML = html;
    
    // Event listeners para dias
    grid.querySelectorAll('.calendar-day').forEach(day => {
        day.addEventListener('click', () => openEventModal(day.dataset.date));
    });
    
    // Event listeners para eventos
    grid.querySelectorAll('.event-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const eventId = item.dataset.eventId;
            const event = events.find(e => e.id === eventId);
            if (event) {
                openEventModal(null, event);
            }
        });
    });
}

// Navegar períodos
function navigatePeriod(direction) {
    if (currentView === 'month') {
        currentDate.setMonth(currentDate.getMonth() + direction);
    } else if (currentView === 'week') {
        currentDate.setDate(currentDate.getDate() + direction * 7);
    } else if (currentView === 'day') {
        currentDate.setDate(currentDate.getDate() + direction);
    }
    renderCalendar();
}

// Alterar visualização
function changeView(view) {
    currentView = view;
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    renderCalendar();
}

// Abrir modal de detalhes do evento
function openEventModal(date, event = null) {
    currentEvent = event;
    const modal = document.getElementById('event-details-modal');
    const title = document.getElementById('event-modal-title');
    const form = document.getElementById('event-details-form');
    const deleteBtn = document.getElementById('delete-event-btn');
    
    form.reset();
    
    if (event) {
        // Modo edição
        title.textContent = 'Editar Evento';
        document.getElementById('event-title').value = event.title;
        document.getElementById('event-description').value = event.description;
        document.getElementById('event-datetime').value = event.datetime.slice(0, 16); // Formato datetime-local
        document.getElementById('event-participants').value = event.participants.join(', ');
        document.getElementById('event-tag').value = event.tag;
        deleteBtn.classList.remove('hidden');
    } else {
        // Modo criação
        title.textContent = 'Novo Evento';
        document.getElementById('event-datetime').value = `${date}T12:00`;
        deleteBtn.classList.add('hidden');
    }
    
    modal.classList.add('show');
}

// Fechar modal de detalhes do evento
function closeEventModal() {
    document.getElementById('event-details-modal').classList.remove('show');
    currentEvent = null;
}

// Salvar evento do modal
function saveEventFromModal(e) {
    e.preventDefault();
    
    const title = document.getElementById('event-title').value.trim();
    const description = document.getElementById('event-description').value.trim();
    const datetime = document.getElementById('event-datetime').value;
    const participants = document.getElementById('event-participants').value.trim();
    const tag = document.getElementById('event-tag').value;
    
    if (!title || !datetime) {
        window.showNotification('Título e data/hora são obrigatórios', 'error');
        return;
    }
    
    console.log('Salvando evento:', { title, datetime, tag });
    
    if (!window.currentUser) {
        window.showNotification('Usuário não autenticado. Faça login novamente.', 'error');
        return;
    }
    
    const event = {
        id: currentEvent ? currentEvent.id : Date.now().toString(),
        title,
        description,
        datetime,
        participants: participants ? participants.split(',').map(p => p.trim()) : [],
        tag,
        createdBy: window.currentUser.username,
        createdAt: new Date()
    };
    
    // Salvar localmente primeiro
    if (currentEvent) {
        const index = events.findIndex(e => e.id === currentEvent.id);
        if (index !== -1) {
            events[index] = event;
        }
    } else {
        events.push(event);
    }
    saveEventsLocally();
    
    // Tentar salvar no servidor
    saveEventToServer(event).then(() => {
        console.log('✅ Evento salvo com sucesso no servidor');
        addToHistory(`${window.currentUser.username} criou o evento "${title}"`);
        
        // Sincronizar via socket se em chat
        if (window.socket && window.currentChatUser) {
            window.socket.emit('calendar_event', {
                event,
                recipientId: window.currentChatUser.id
            });
            
            window.addMessageToChat(`📅 ${window.currentUser.username} criou o evento "${title}" para ${new Date(datetime).toLocaleDateString('pt-BR')}`, 'sent', window.currentUser.username, new Date());
        }
        
        closeEventModal();
        renderCalendar();
        window.showNotification('Evento salvo com sucesso!', 'success');
    }).catch((error) => {
        console.error('❌ Falha ao salvar no servidor, mas salvo localmente:', error);
        window.showNotification('Evento salvo localmente, mas erro no servidor. Tente sincronizar mais tarde.', 'warning');
        
        // Ainda fechar modal e renderizar
        closeEventModal();
        renderCalendar();
    });
}

// Excluir evento
function deleteEvent() {
    if (!currentEvent) return;
    
    if (!window.currentUser) {
        window.showNotification('Usuário não autenticado. Faça login novamente.', 'error');
        return;
    }
    
    if (confirm('Tem certeza que deseja excluir este evento?')) {
        events = events.filter(e => e.id !== currentEvent.id);
        saveEventsLocally();
        
        // Excluir do servidor
        deleteEventFromServer(currentEvent.id);
        
        addToHistory(`${window.currentUser.username} excluiu o evento "${currentEvent.title}"`);
        
        closeEventModal();
        renderCalendar();
        window.showNotification('Evento excluído!', 'success');
    }
}

// Excluir evento do servidor
async function deleteEventFromServer(eventId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/calendar/events/${eventId}`, {  // Substituído: removido localhost
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        console.log('Evento excluído do servidor');
    } catch (error) {
        console.error('Erro ao excluir evento do servidor:', error);
        window.showNotification('Erro ao excluir evento do servidor', 'error');
    }
}

// Adicionar ao histórico
function addToHistory(message) {
    eventHistory.unshift({
        message,
        timestamp: new Date()
    });
    
    if (eventHistory.length > 50) {
        eventHistory = eventHistory.slice(0, 50);
    }
    
    renderHistory();
}

// Renderizar histórico
function renderHistory() {
    const container = document.getElementById('history-list');
    container.innerHTML = eventHistory.map(item => `
        <div class="history-item">
            <strong>${new Date(item.timestamp).toLocaleString('pt-BR')}</strong>: ${item.message}
        </div>
    `).join('');
}

// Carregar eventos do servidor e localStorage
async function loadEvents() {
    // Carregar do localStorage primeiro
    const stored = localStorage.getItem('calendarEvents');
    if (stored) {
        events = JSON.parse(stored);
    }
    
    const storedHistory = localStorage.getItem('eventHistory');
    if (storedHistory) {
        eventHistory = JSON.parse(storedHistory);
    }
    
    // Tentar carregar do servidor
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/calendar/events', {  // Substituído: removido localhost
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.events) {
                events = data.events;
                saveEventsLocally();
            }
        }
    } catch (error) {
        console.error('Erro ao carregar eventos do servidor:', error);
    }
}

// Salvar eventos no localStorage
function saveEventsLocally() {
    localStorage.setItem('calendarEvents', JSON.stringify(events));
    localStorage.setItem('eventHistory', JSON.stringify(eventHistory));
}

// Salvar evento no servidor
async function saveEventToServer(event) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/calendar/events', {  // Substituído: removido localhost
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(event)
        });
        
        const data = await response.json(); // Sempre tentar parsear JSON
        
        if (!response.ok) {
            console.error('❌ Resposta do servidor:', response.status, data);
            throw new Error(`HTTP error! status: ${response.status}, message: ${data.message || 'Unknown'}`);
        }
        
        console.log('✅ Evento salvo no servidor:', data);
        return data;
    } catch (error) {
        console.error('❌ Erro ao salvar evento no servidor:', error);
        // Não lançar erro se for erro de rede, apenas logar
        if (error.message.includes('Failed to fetch')) {
            console.warn('⚠️ Erro de rede, mas evento pode ter sido salvo localmente');
        } else {
            throw error; // Relançar para tratamento superior
        }
    }
}