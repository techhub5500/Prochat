// Configurações do Socket.IO
const SHARING_PORT = 5002;
let socket = null;
let currentUser = null;
let currentOrganization = null;
let onlineUsers = [];
let currentChatUser = null;
let currentConversationId = null;
let chattedUsers = [];
let unreadMessages = {};
let allUsers = [];

// ✅ FUNÇÃO PARA CARREGAR HISTÓRICO DE MENSAGENS (CORRIGIDA)
async function loadChatHistory(recipientId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`http://localhost:${SHARING_PORT}/api/messages/${recipientId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('📜 Histórico carregado:', data);

        // ✅ ALWAYS CLEAR THE CHAT CONTAINER FIRST
        clearChatMessages();

        if (data.success && data.messages.length > 0) {
            // Salvar ID da conversa
            currentConversationId = data.conversationId;
            
            // ✅ CORRIGIDO: Lógica de posicionamento das mensagens
            data.messages.forEach(msg => {
                if (msg.messageType === 'text') {
                    addMessageToChat(
                        msg.message,
                        msg.senderId === currentUser.id ? 'sent' : 'received', // ✅ CORRIGIDO
                        msg.senderName,
                        msg.timestamp
                    );
                } else if (msg.messageType === 'file') {
                    addFileToChat(
                        msg.fileData,
                        msg.senderId === currentUser.id ? 'sent' : 'received', // ✅ CORRIGIDO
                        msg.senderName,
                        msg.timestamp
                    );
                }
            });
            
            scrollToBottom();
        } else {
            showNotification('Nenhuma mensagem anterior neste chat.', 'info');
        }

    } catch (error) {
        console.error('❌ Erro ao carregar histórico:', error);
        showNotification('Erro ao carregar histórico', 'error');
        clearChatMessages();
    }
}

// ✅ NOVA FUNÇÃO: Buscar todos os usuários da organização
async function fetchAllUsers() {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`http://localhost:${SHARING_PORT}/api/users`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) throw new Error('Erro ao buscar usuários');
    
    const data = await response.json();
    allUsers = data.users.map(u => ({
      id: u._id,
      username: u.username,
      name: u.name,
      email: u.email,
      organizationCode: currentOrganization
    }));
    updateOnlineUsersList();
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
  }
}

// ✅ FUNÇÃO PARA INCREMENTAR CONTADOR DE MENSAGENS NÃO LIDAS
function incrementUnreadCount(userId) {
    if (!unreadMessages[userId]) {
        unreadMessages[userId] = 0;
    }
    unreadMessages[userId]++;
    updateOnlineUsersList();
}

// ✅ FUNÇÃO PARA RESETAR CONTADOR QUANDO CHAT É ABERTO
function resetUnreadCount(userId) {
    unreadMessages[userId] = 0;
    updateOnlineUsersList();
}

// ✅ SALVAR MENSAGEM LOCALMENTE ANTES DE ENVIAR
function saveMessageLocally(message, type, recipientId, fileData = null) {
    const messageData = {
        id: Date.now().toString(),
        senderId: currentUser.id,
        senderName: currentUser.username,
        recipientId: recipientId,
        message: message,
        messageType: type,
        fileData: fileData,
        timestamp: new Date(),
        status: 'sending'
    };

    const chatKey = `chat_${currentUser.id}_${recipientId}`;
    const existingChat = JSON.parse(localStorage.getItem(chatKey) || '[]');
    existingChat.push(messageData);
    localStorage.setItem(chatKey, JSON.stringify(existingChat));

    return messageData;
}

// Carregar usuários que já conversaram do localStorage
function loadChattedUsers() {
    const stored = localStorage.getItem('chattedUsers');
    if (stored) {
        const allChatted = JSON.parse(stored);
        chattedUsers = allChatted.filter(user => user.organizationCode === currentOrganization);
        saveChattedUsers();
    }
}

// ✅ ATUALIZADO: Salvar usuários conversados com organizationCode
function saveChattedUsers() {
    localStorage.setItem('chattedUsers', JSON.stringify(chattedUsers));
}

// ✅ ATUALIZADO: Adicionar usuário à lista de conversados com organizationCode
function addChattedUser(userId, username, organizationCode) {
    if (!chattedUsers.some(user => user.id === userId)) {
        chattedUsers.push({ 
            id: userId, 
            username: username, 
            organizationCode: organizationCode,
            lastMessage: new Date() 
        });
        saveChattedUsers();
    }
}

// Função para decodificar JWT e obter dados do usuário
function getUserDataFromToken() {
    const token = localStorage.getItem('token');
    if (!token) {
        console.error('Token não encontrado no localStorage');
        return null;
    }

    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        const decoded = JSON.parse(jsonPayload);
        console.log('Dados do usuário decodificados do JWT:', decoded);
        
        return {
            id: decoded.id,
            username: decoded.username,
            email: decoded.email,
            organizationCode: decoded.organizationCode
        };
    } catch (error) {
        console.error('Erro ao decodificar token JWT:', error);
        return null;
    }
}

// Inicialização do sistema de sharing
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM carregado, inicializando sharing...');
    
    showSharingPage();
    
    const userData = getUserDataFromToken();
    if (userData) {
        currentUser = userData;
        currentOrganization = userData.organizationCode;
        console.log('Usuário carregado:', currentUser);
        
        window.currentUser = currentUser;
        
        initializeSharing();
        fetchAllUsers();
    } else {
        console.log('Usuário não logado, chat em modo offline');
        showOfflineMode();
    }

    const navSharing = document.getElementById('nav-sharing');
    if (navSharing) {
        navSharing.addEventListener('click', function(e) {
            e.preventDefault();
            showSharingPage();
        });
    }

    const navProchat = document.getElementById('nav-prochat');
    if (navProchat) {
        navProchat.addEventListener('click', function(e) {
            e.preventDefault();
            showProChatPage();
        });
    }

    setupEventListeners();
});

// ✅ CONFIGURAÇÃO DE EVENT LISTENERS SIMPLIFICADA
function setupEventListeners() {
    document.addEventListener('click', function(e) {
        if (e.target.closest('#attach-file-btn')) {
            e.preventDefault();
            const fileInput = document.getElementById('file-input');
            if (fileInput) {
                fileInput.click();
            }
        }
        
        if (e.target.closest('#send-message-btn')) {
            e.preventDefault();
            sendMessage();
        }
        
        if (e.target.closest('#close-chat-btn')) {
            e.preventDefault();
            closeChatWindow();
        }
    });

    document.addEventListener('change', function(e) {
        if (e.target.id === 'file-input') {
            handleFileSelect(e);
        }
    });

    document.addEventListener('keypress', function(e) {
        if (e.target.id === 'chat-message-input' && e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    document.addEventListener('input', function(e) {
        if (e.target.id === 'chat-message-input') {
            handleTyping();
            e.target.style.height = 'auto';
            e.target.style.height = (e.target.scrollHeight) + 'px';
        }
    });
}

// Mostrar página de sharing
function showSharingPage() {
    document.getElementById('page-prochat').classList.add('hidden');
    document.getElementById('page-sharing').classList.remove('hidden');
    
    document.getElementById('nav-prochat').classList.remove('active');
    document.getElementById('nav-sharing').classList.add('active');
    
    if (!socket) {
        initializeSharing();
    }
}

// Mostrar página do ProChat
function showProChatPage() {
    document.getElementById('page-prochat').classList.remove('hidden');
    document.getElementById('page-sharing').classList.add('hidden');
    
    document.getElementById('nav-sharing').classList.remove('active');
    document.getElementById('nav-prochat').classList.add('active');
}

// Inicializar sistema de sharing
function initializeSharing() {
    if (!currentUser) {
        const userData = getUserDataFromToken();
        if (userData) {
            currentUser = userData;
            currentOrganization = userData.organizationCode;
            
            window.currentUser = currentUser;
        }
    }

    if (!currentUser || !currentOrganization) {
        console.error('Usuário não autenticado ou sem código de organização');
        showNotification('Erro: Usuário não autenticado ou sem organização', 'error');
        return;
    }

    loadChattedUsers();

    console.log('Inicializando sharing para usuário:', currentUser.username, 'Organização:', currentOrganization);

    socket = io(`http://localhost:${SHARING_PORT}`, {
        auth: {
            token: localStorage.getItem('token'),
            userId: currentUser.id,
            username: currentUser.username,
            organizationCode: currentOrganization
        }
    });
    
    window.socket = socket;

    setupSocketListeners();
}

// ✅ CONFIGURAR LISTENERS DO SOCKET (CORRIGIDO)
function setupSocketListeners() {
    socket.on('connect', () => {
        console.log('Conectado ao servidor de sharing');
        showNotification('Conectado ao chat em tempo real!', 'success');
        
        sendPendingMessages();
    });

    socket.on('connect_error', (error) => {
        console.error('Erro de conexão:', error);
        showNotification('Erro ao conectar com o servidor', 'error');
    });

    socket.on('users_online', (users) => {
        console.log('Usuários online recebidos:', users);
        onlineUsers = users.filter(user => user.id !== currentUser.id);
        updateOnlineUsersList();
    });

    // ✅ CORRIGIDO: Listener para novas mensagens
    socket.on('new_message', (data) => {
        console.log('Nova mensagem recebida:', data);
        
        addChattedUser(data.senderId, data.senderName, currentOrganization);
        
        if (currentChatUser && data.senderId === currentChatUser.id) {
            addMessageToChat(data.message, 'received', data.senderName, data.timestamp); // ✅ CORRIGIDO
        } else {
            incrementUnreadCount(data.senderId);
        }
        playNotificationSound();
    });

    socket.on('file_received', (data) => {
        console.log('Arquivo recebido:', data);
        
        addChattedUser(data.senderId, data.senderName, currentOrganization);
        
        if (currentChatUser && data.senderId === currentChatUser.id) {
            addFileToChat(data, 'received', data.senderName, data.timestamp); // ✅ CORRETO
        } else {
            incrementUnreadCount(data.senderId);
        }
        playNotificationSound();
    });

    socket.on('calendar_event', (data) => {
        console.log('📅 Evento recebido via socket:', data);
        if (!events.some(e => e.id === data.event.id)) {
            events.push(data.event);
            saveEventsLocally();
            renderCalendar();
        }
    });

    socket.on('user_typing', (data) => {
        if (currentChatUser && data.userId === currentChatUser.id) {
            showTypingIndicator(data.username);
        }
    });

    socket.on('user_stopped_typing', (data) => {
        if (currentChatUser && data.userId === currentChatUser.id) {
            hideTypingIndicator();
        }
    });
}

// Atualizar lista de usuários online
function updateOnlineUsersList() {
    const usersList = document.getElementById('online-users-list');
    const onlineCount = document.querySelector('.online-count');
    
    if (!usersList || !onlineCount) return;

    // ✅ CORRIGIDO: Filtrar usuários para excluir o próprio usuário
    const allUsersWithStatus = allUsers.filter(user => user.id !== currentUser.id).map(user => {
        const isOnline = onlineUsers.some(online => online.id === user.id);
        return { ...user, isOnline };
    });
    
    onlineCount.textContent = onlineUsers.length;

    if (allUsersWithStatus.length === 0) {
        usersList.innerHTML = `
            <div class="no-users">
                <i class="fas fa-user-slash"></i>
                <p>Nenhum usuário disponível na sua organização</p>
            </div>
        `;
        return;
    }

    usersList.innerHTML = allUsersWithStatus.map(user => {
        const unreadCount = unreadMessages[user.id] || 0;
        const hasUnread = unreadCount > 0;
        
        return `
            <div class="user-item ${user.isOnline ? '' : 'offline'} ${hasUnread ? 'has-unread' : ''}" data-user-id="${user.id}" data-username="${user.username}">
                <div class="user-avatar">
                    <i class="fas fa-user"></i>
                    ${hasUnread ? `<span class="unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>` : ''}
                </div>
                <div class="user-info">
                    <span class="username">${user.username}</span>
                    <span class="status ${user.isOnline ? 'online' : 'offline'}">${user.isOnline ? 'Online' : 'Offline'}</span>
                </div>
            </div>
        `;
    }).join('');

    usersList.querySelectorAll('.user-item').forEach(item => {
        item.addEventListener('click', () => {
            const userId = item.dataset.userId;
            const username = item.dataset.username;
            openChatWithUser(userId, username);
        });
    });
}

// ✅ ABRIR CHAT COM USUÁRIO E CARREGAR HISTÓRICO
async function openChatWithUser(userId, username) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
        showNotification('Usuário não encontrado ou não pertence à sua organização', 'error');
        return;
    }

    currentChatUser = { id: userId, username: username };
    
    window.currentChatUser = currentChatUser;
    
    console.log('Abrindo chat com:', username);
    
    resetUnreadCount(userId);
    
    document.getElementById('chat-placeholder').classList.add('hidden');
    document.getElementById('chat-window').classList.remove('hidden');
    
    document.getElementById('current-chat-username').textContent = username;
    
    await loadChatHistory(userId);
    
    const messageInput = document.getElementById('chat-message-input');
    if (messageInput) {
        setTimeout(() => messageInput.focus(), 100);
    }
}

// Fechar janela do chat
function closeChatWindow() {
    console.log('Fechando janela do chat');
    currentChatUser = null;
    currentConversationId = null;
    
    document.getElementById('chat-window').classList.add('hidden');
    document.getElementById('chat-placeholder').classList.remove('hidden');
    
    clearChatMessages();
}

// Limpar mensagens do chat
function clearChatMessages() {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;
    
    const typingIndicator = container.querySelector('.typing-indicator');
    container.innerHTML = '';
    if (typingIndicator) {
        container.appendChild(typingIndicator);
    } else {
        const newTypingIndicator = document.createElement('div');
        newTypingIndicator.className = 'typing-indicator hidden';
        newTypingIndicator.id = 'typing-indicator';
        newTypingIndicator.innerHTML = '<span class="typing-user"></span> está digitando...';
        container.appendChild(newTypingIndicator);
    }
}

// ✅ ENVIAR MENSAGEM COM BACKUP LOCAL (CORRIGIDO)
function sendMessage() {
    console.log('sendMessage chamado');
    
    const input = document.getElementById('chat-message-input');
    if (!input) return;
    
    const message = input.value.trim();
    
    if (!message || !currentChatUser) return;
    
    if (!currentUser) {
        showNotification('Faça login para enviar mensagens', 'error');
        return;
    }
    
    console.log('Enviando mensagem:', message, 'para:', currentChatUser.username);
    
    addChattedUser(currentChatUser.id, currentChatUser.username);
    
    saveMessageLocally(message, 'text', currentChatUser.id);
    
    // ✅ CORRIGIDO: Mensagem enviada pelo usuário atual = 'sent'
    addMessageToChat(message, 'sent', currentUser.username, new Date());
    
    if (socket && socket.connected) {
        socket.emit('send_message', {
            recipientId: currentChatUser.id,
            message: message
        });
    } else {
        markMessageAsPending(message, currentChatUser.id);
        showNotification('Mensagem enviada quando destinatário estiver online', 'info');
    }
    
    input.value = '';
    input.style.height = 'auto';
}

// ✅ FUNÇÃO PARA MARCAR MENSAGEM COMO PENDENTE
function markMessageAsPending(message, recipientId) {
    const pendingKey = `pending_${currentUser.id}_${recipientId}`;
    const pendingMessages = JSON.parse(localStorage.getItem(pendingKey) || '[]');
    pendingMessages.push({
        message: message,
        timestamp: new Date(),
        status: 'pending'
    });
    localStorage.setItem(pendingKey, JSON.stringify(pendingMessages));
}

// ✅ ENVIAR MENSAGENS PENDENTES QUANDO CONECTAR
function sendPendingMessages() {
    if (!socket || !socket.connected || !currentUser) return;
    
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith(`pending_${currentUser.id}_`)) {
            const recipientId = key.split('_')[2];
            const pendingMessages = JSON.parse(localStorage.getItem(key) || '[]');
            
            pendingMessages.forEach(msg => {
                socket.emit('send_message', {
                    recipientId: recipientId,
                    message: msg.message
                });
            });
            
            localStorage.removeItem(key);
        }
    });
}

// Adicionar mensagem ao chat
function addMessageToChat(message, type, senderName, timestamp) {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;
    
    const typingIndicator = container.querySelector('.typing-indicator');
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}`;
    
    const time = new Date(timestamp).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    messageElement.innerHTML = `
        <div class="message-content">
            <div class="message-text">${escapeHtml(message)}</div>
            <div class="message-time">${time}</div>
        </div>
    `;
    
    container.insertBefore(messageElement, typingIndicator);
    scrollToBottom();
}

window.addMessageToChat = addMessageToChat;

// Adicionar arquivo ao chat
function addFileToChat(fileData, type, senderName, timestamp) {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;
    
    const typingIndicator = container.querySelector('.typing-indicator');
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type} file-message`;
    
    const time = new Date(timestamp).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    const fileIcon = getFileIcon(fileData.originalName);
    
    messageElement.innerHTML = `
        <div class="message-content">
            <div class="file-content">
                <div class="file-icon">${fileIcon}</div>
                <div class="file-info">
                    <span class="file-name">${escapeHtml(fileData.originalName)}</span>
                    <span class="file-size">${formatFileSize(fileData.size)}</span>
                </div>
                <a href="http://localhost:${SHARING_PORT}/uploads/${fileData.filename}" target="_blank" class="download-btn" title="Baixar arquivo">
                    <i class="fas fa-download"></i>
                </a>
            </div>
            <div class="message-time">${time}</div>
        </div>
    `;
    
    container.insertBefore(messageElement, typingIndicator);
    scrollToBottom();
}

// ✅ UPLOAD DE ARQUIVO COM BACKUP LOCAL
function handleFileSelect(event) {
    console.log('📁 Arquivo selecionado');
    
    const file = event.target.files[0];
    if (!file || !currentChatUser) {
        console.log('❌ Nenhum arquivo ou chat selecionado');
        event.target.value = '';
        return;
    }
    
    console.log('✅ Arquivo selecionado:', file.name, 'Tamanho:', file.size);
    
    if (file.size > 10 * 1024 * 1024) {
        showNotification('Arquivo muito grande. Máximo 10MB.', 'error');
        event.target.value = '';
        return;
    }
    
    const fileData = {
        originalName: file.name,
        filename: 'uploading...',
        size: file.size
    };
    
    saveMessageLocally('', 'file', currentChatUser.id, fileData);
    
    showNotification('Enviando arquivo...', 'info');
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('recipientId', currentChatUser.id);
    
    uploadFile(formData, file);
    
    event.target.value = '';
}

// Upload de arquivo
function uploadFile(formData, file) {
    console.log('📤 Iniciando upload do arquivo:', file.name);
    
    const token = localStorage.getItem('token');
    
    addFileToChat({
        originalName: file.name,
        filename: 'uploading...',
        size: file.size
    }, 'sent', currentUser.username, new Date());
    
    fetch(`http://localhost:${SHARING_PORT}/upload`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: formData
    })
    .then(response => {
        console.log('📨 Resposta recebida:', response.status);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('✅ Upload concluído:', data);
        if (data.success) {
            showNotification('Arquivo enviado com sucesso!', 'success');
        } else {
            showNotification(data.message || 'Erro ao enviar arquivo', 'error');
        }
    })
    .catch(error => {
        console.error('💥 Erro no upload:', error);
        showNotification('Erro de conexão ao enviar arquivo', 'error');
    });
}

// ✅ FUNÇÃO PARA MODO OFFLINE
function showOfflineMode() {
    const chatWindow = document.getElementById('chat-window');
    const placeholder = document.getElementById('chat-placeholder');
    
    if (placeholder) {
        placeholder.innerHTML = `
            <div class="offline-mode">
                <i class="fas fa-user-lock"></i>
                <h3>Faça login para acessar o chat</h3>
                <p>Você pode visualizar usuários online, mas precisa estar logado para enviar mensagens.</p>
                <button id="login-btn" class="btn-primary">Fazer Login</button>
            </div>
        `;
        
        document.getElementById('login-btn').addEventListener('click', () => {
            window.location.href = '/login';
        });
    }
    
    updateOnlineUsersList();
}

// Resto do código continua igual...
let typingTimer = null;
function handleTyping() {
    if (!currentChatUser || !socket) return;
    
    socket.emit('typing', { recipientId: currentChatUser.id });
    
    clearTimeout(typingTimer);
    
    typingTimer = setTimeout(() => {
        socket.emit('stop_typing', { recipientId: currentChatUser.id });
    }, 1000);
}

function showTypingIndicator(username) {
    const indicator = document.getElementById('typing-indicator');
    if (!indicator) return;
    
    const userSpan = indicator.querySelector('.typing-user');
    if (userSpan) {
        userSpan.textContent = username;
    }
    indicator.classList.remove('hidden');
    scrollToBottom();
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.classList.add('hidden');
    }
}

function scrollToBottom() {
    const container = document.getElementById('chat-messages-container');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getFileIcon(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    const iconMap = {
        'pdf': '<i class="fas fa-file-pdf"></i>',
        'doc': '<i class="fas fa-file-word"></i>',
        'docx': '<i class="fas fa-file-word"></i>',
        'txt': '<i class="fas fa-file-alt"></i>',
        'jpg': '<i class="fas fa-file-image"></i>',
        'jpeg': '<i class="fas fa-file-image"></i>',
        'png': '<i class="fas fa-file-image"></i>',
        'gif': '<i class="fas fa-file-image"></i>'
    };
    return iconMap[extension] || '<i class="fas fa-file"></i>';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showNotification(message, type = 'info') {
    if (typeof showToast === 'function') {
        showToast(message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        const toast = document.getElementById('notification-toast');
        if (toast) {
            const messageSpan = document.getElementById('toast-message');
            if (messageSpan) {
                messageSpan.textContent = message;
                toast.classList.add('show');
                setTimeout(() => {
                    toast.classList.remove('show');
                }, 3000);
            }
        }
    }
}

window.showNotification = showNotification;

function playNotificationSound() {
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmEbBDuH0+OQfzs=');
        audio.play().catch(() => {});
    } catch (e) {
        // Ignorar erros de áudio
    }
}

window.addEventListener('beforeunload', () => {
    if (socket) {
        socket.disconnect();
    }
});