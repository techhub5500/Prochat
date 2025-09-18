document.addEventListener('DOMContentLoaded', () => {
  // ========================================
  // SISTEMA PRINCIPAL - PROCHAT
  // ========================================
  const ProChat = {
    // Estado da aplicação
    state: {
      currentChatId: null,
      selectedModel: 'gpt-4o-mini',
      isShareMode: false,
      isTyping: false,
      typingTimer: null
    },

    // Cache de elementos DOM
    elements: {},

    // Inicialização
    init() {
      console.log('🚀 Inicializando ProChat...');
      this.cacheElements();
      this.setupEventListeners();
      this.initializeSystems();
      console.log('✅ ProChat inicializado com sucesso');
    },

    // Cache de elementos para melhor performance
    cacheElements() {
      const elementIds = [
        'new-chat-btn', 'history-btn', 'model-btn', 'docs-btn', 'share-btn',
        'chat-input', 'send-embedded-btn', 'enhance-btn', 'chat-messages',
        'model-modal', 'history-modal', 'delete-modal'
      ];

      elementIds.forEach(id => {
        this.elements[id] = document.getElementById(id);
      });

      console.log('📦 Elementos DOM em cache:', Object.keys(this.elements).length);
    },

    // Configurar event listeners iniciais
    setupEventListeners() {
      // Botões principais
      this.elements['new-chat-btn'].addEventListener('click', () => this.systems.chat.newChat());
      this.elements['history-btn'].addEventListener('click', () => this.systems.chat.loadHistory());
      this.elements['docs-btn'].addEventListener('click', () => this.systems.documents.showModal());
      this.elements['share-btn'].addEventListener('click', () => this.systems.sharing.toggleMode());
      this.elements['enhance-btn'].addEventListener('click', () => this.systems.enhance.handleClick());

      // Input e envio
      this.elements['chat-input'].addEventListener('input', () => this.systems.chat.handleInput());
      this.elements['chat-input'].addEventListener('keypress', (e) => this.systems.chat.handleKeyPress(e));
      this.elements['send-embedded-btn'].addEventListener('click', () => this.systems.chat.sendMessage());

      // Modelos
      this.elements['model-btn'].addEventListener('click', () => this.systems.models.showModal());

      console.log('🎛️ Event listeners configurados');
    },

    // Inicializar sistemas modulares
    initializeSystems() {
    this.systems = {
      chat: ChatSystem.init(this),
      documents: DocumentSystem.init(this),
      sharing: SharingSystem.init(this),
      enhance: EnhanceSystem.init(this),
      models: ModelSystem.init(this),
      tutorial: TutorialSystem.init(this),  // ← ADICIONE ESTA LINHA
      utils: Utils.init(this)
    };
  },

    // Sistemas modulares
    systems: {}
  };

  // ========================================
  // SISTEMA DE UTILITÁRIOS
  // ========================================
  const Utils = {
    init(prochat) {
      this.prochat = prochat;
      return this;
    },

    // Debounce para otimizar performance
    debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(() => args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    },

    // Tratamento de erros padronizado
    handleError(operation, error, showUserMessage = true) {
      console.error(`❌ Erro em ${operation}:`, error);
      if (showUserMessage) {
        this.showPopup(error.message || `Erro em ${operation}`);
      }
    },

    // ✅ ADICIONADA: Função para extrair userId do token JWT
    getUserIdFromToken() {
      try {
        const token = localStorage.getItem('token');
        if (!token) return null;
        
        // Usar jwt_decode se disponível, senão fazer decode manual
        if (typeof jwt_decode !== 'undefined') {
          const decoded = jwt_decode(token);
          return decoded.id || decoded.userId || decoded.sub;
        } else {
          // Decode manual básico (apenas para JWT válidos)
          const payload = token.split('.')[1];
          const decoded = JSON.parse(atob(payload));
          return decoded.id || decoded.userId || decoded.sub;
        }
      } catch (error) {
        console.error('Erro ao decodificar token:', error);
        return null;
      }
    },

    // Popup moderno
    showPopup(message) {
      const overlay = document.createElement('div');
      overlay.className = 'modern-popup-overlay';
      overlay.innerHTML = `
        <div class="modern-popup">
          <p>${message}</p>
          <button class="modern-popup-btn">OK</button>
        </div>
      `;
      document.body.appendChild(overlay);

      setTimeout(() => overlay.classList.add('show'), 10);

      const closePopup = () => {
        overlay.classList.remove('show');
        setTimeout(() => document.body.removeChild(overlay), 300);
      };

      overlay.querySelector('.modern-popup-btn').addEventListener('click', closePopup);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePopup();
      });
    },

    // Verificar autenticação
    checkAuth() {
      const token = localStorage.getItem('token');
      if (!token) {
        this.showPopup('Usuário não autenticado. Faça login novamente.');
        return false;
      }
      return token;
    },

    // Auto-resize textarea
    autoResizeTextarea(textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 220) + 'px';
    }
  };

  // ========================================
  // SISTEMA DE CHAT
  // ========================================
  const ChatSystem = {
    init(prochat) {
      this.prochat = prochat;
      this.elements = prochat.elements;
      return this;
    },

    // Novo chat
    newChat() {
      this.elements['chat-messages'].innerHTML = '';
      this.prochat.state.currentChatId = Date.now().toString();
      this.showNewChatToast();
    },

    // Toast de novo chat
    showNewChatToast() {
      const toast = document.getElementById('new-chat-toast');
      if (toast) {
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
      }
    },

    // Carregar histórico
    async loadHistory() {
      const token = Utils.checkAuth();
      if (!token) return;

      try {
        const response = await fetch('https://prochat-chat.onrender.com/api/chat/history', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

        const data = await response.json();
        if (response.ok) {
          this.displayHistory(data.chats);
        } else {
          Utils.handleError('carregar histórico', new Error(data.message));
        }
      } catch (error) {
        Utils.handleError('carregar histórico', error);
      }
    },

    // Exibir histórico
    displayHistory(chats) {
      const modal = this.elements['history-modal'];
      const historyList = document.getElementById('history-list');
      const searchInput = document.getElementById('search-history');
      const closeBtn = document.querySelector('.history-close');

      historyList.innerHTML = '';
      chats.forEach(chat => {
        const item = document.createElement('div');
        item.className = 'history-item';

        const titleSpan = document.createElement('span');
        titleSpan.textContent = chat.title;
        titleSpan.style.flexGrow = '1';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-chat-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.title = 'Deletar chat';
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteChat(chat.chatId);
        });

        item.appendChild(titleSpan);
        item.appendChild(deleteBtn);
        item.addEventListener('click', () => this.loadChat(chat));
        historyList.appendChild(item);
      });

      modal.style.display = 'block';

      searchInput.addEventListener('input', Utils.debounce(() => {
        const query = searchInput.value.toLowerCase();
        const items = historyList.querySelectorAll('.history-item');
        items.forEach(item => {
          const text = item.textContent.toLowerCase();
          item.style.display = text.includes(query) ? 'block' : 'none';
        });
      }, 300));

      closeBtn.addEventListener('click', () => modal.style.display = 'none');
      window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
      });
    },

    // Deletar chat
    async deleteChat(chatId) {
      if (!chatId || chatId === 'undefined' || chatId === '') {
        Utils.showPopup('Chat sem ID válido, não pode ser deletado.');
        return;
      }

      const token = Utils.checkAuth();
      if (!token) return;

      this.showDeleteModal(chatId, token);
    },

    // Modal de delete
    showDeleteModal(chatId, token) {
      const modal = this.elements['delete-modal'];
      const cancelBtn = document.getElementById('delete-cancel-btn');
      const confirmBtn = document.getElementById('delete-confirm-btn');

      modal.style.display = 'block';

      const closeModal = () => modal.style.display = 'none';

      cancelBtn.addEventListener('click', closeModal);
      window.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      confirmBtn.addEventListener('click', async () => {
        closeModal();
        try {
          const response = await fetch(`https://prochat-chat.onrender.com/api/chat/${chatId}`, {
  method: 'DELETE',
  headers: { 'Authorization': `Bearer ${token}` }
});

          if (response.ok) {
            Utils.showPopup('Chat deletado com sucesso!');
            this.loadHistory(); // Recarrega histórico
          } else {
            const data = await response.json();
            Utils.handleError('deletar chat', new Error(data.message));
          }
        } catch (error) {
          Utils.handleError('deletar chat', error);
        }
      });
    },

    // Carregar chat
    loadChat(chat) {
      const chatMessages = this.elements['chat-messages'];
      chatMessages.innerHTML = '';

      chat.messages.forEach(msg => {
        let processedText = msg.text;

        // Processar Markdown se disponível
        if (msg.sender === 'ai' && typeof marked !== 'undefined') {
          try {
            processedText = marked.parse(msg.text);
          } catch (error) {
            console.error('Erro ao processar Markdown:', error);
            processedText = msg.text;
          }
        }

        const messageDiv = this.createMessageElement(processedText, msg.sender);
        chatMessages.appendChild(messageDiv);
      });

      // Aplicar Highlight.js
      if (typeof hljs !== 'undefined') {
        try {
          hljs.highlightAll();
        } catch (error) {
          console.warn('Erro ao aplicar Highlight.js:', error);
        }
      }

      chatMessages.scrollTop = chatMessages.scrollHeight;
      this.elements['history-modal'].style.display = 'none';
    },

    // Criar elemento de mensagem
    createMessageElement(text, sender) {
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message-main ' + (sender === 'user' ? 'message-user-main' : 'message-ai-main');

      if (sender === 'ai' && text.includes('<')) {
        messageDiv.innerHTML = text;
      } else {
        messageDiv.textContent = text;
      }

      // Event listener para compartilhamento
      messageDiv.addEventListener('click', () => {
        if (this.prochat.state.isShareMode) {
          messageDiv.classList.toggle('selected');
          this.prochat.systems.sharing.updateShareButton();
        }
      });

      // Botões de ação
      const buttonsContainer = document.createElement('div');
      buttonsContainer.className = 'message-buttons';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'message-btn copy-btn';
      copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>';
      copyBtn.title = 'Copiar mensagem';

      const feedbackText = document.createElement('span');
      feedbackText.className = 'copy-feedback';
      feedbackText.textContent = 'Copiada';
      feedbackText.style.display = 'none';

      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const textToCopy = sender === 'ai' && text.includes('<') ?
          messageDiv.textContent : text;
        navigator.clipboard.writeText(textToCopy).then(() => {
          feedbackText.style.display = 'inline';
          setTimeout(() => feedbackText.style.display = 'none', 1000);
        }).catch(err => console.error('Erro ao copiar:', err));
      });

      buttonsContainer.appendChild(copyBtn);
      buttonsContainer.appendChild(feedbackText);
      messageDiv.appendChild(buttonsContainer);

      return messageDiv;
    },

    // Criar mensagem de espera
    createWaitingMessage() {
      const waitingDiv = document.createElement('div');
      waitingDiv.className = 'message-main message-ai-main waiting-message';
      waitingDiv.innerHTML = `
        <span class="waiting-text">Pensando</span>
        <span class="waiting-dots">
          <span class="dot">.</span>
          <span class="dot">.</span>
          <span class="dot">.</span>
        </span>
      `;
      this.elements['chat-messages'].appendChild(waitingDiv);
      this.elements['chat-messages'].scrollTop = this.elements['chat-messages'].scrollHeight;
      return waitingDiv;
    },

    // Enviar para IA
    async sendToAI(message, model) {
      const token = Utils.checkAuth();
      if (!token) return 'Erro: Usuário não autenticado';

      try {
        const response = await fetch('https://prochat-chat.onrender.com/api/chat/ai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            text: message,
            model: model,
            chatId: this.prochat.state.currentChatId
          })
        });

        const data = await response.json();
        if (response.ok) {
          return data.response;
        } else {
          throw new Error(data.message || 'Erro na resposta da IA');
        }
      } catch (error) {
        console.error('Erro ao enviar para IA:', error);
        return 'Erro: Não foi possível obter resposta da IA.';
      }
    },

    // Enviar mensagem
    async sendMessage() {
      const message = this.elements['chat-input'].value.trim();
      const token = Utils.checkAuth();
      if (!token) return;

      if (!this.prochat.state.currentChatId) {
        this.prochat.state.currentChatId = Date.now().toString();
      }

      if (message) {
        const userMessage = this.createMessageElement(message, 'user');
        this.elements['chat-messages'].appendChild(userMessage);
        this.elements['chat-input'].value = '';

        // Salvar mensagem do usuário
        try {
          await fetch('https://prochat-chat.onrender.com/api/chat/message', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              text: message,
              sender: 'user',
              chatId: this.prochat.state.currentChatId
            })
          });
        } catch (error) {
          Utils.handleError('salvar mensagem do usuário', error, false);
        }

        // Criar mensagem de espera
        const waitingDiv = this.createWaitingMessage();

        // Desabilitar botão durante carregamento
        const sendBtn = this.elements['send-embedded-btn'];
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        // Obter resposta da IA
        const aiResponse = await this.sendToAI(message, this.prochat.state.selectedModel);

        // Processar resposta
        let formattedResponse = aiResponse;
        if (typeof marked !== 'undefined') {
          formattedResponse = marked.parse(aiResponse);
        }

        // Remover mensagem de espera
        this.elements['chat-messages'].removeChild(waitingDiv);

        // Criar mensagem da IA
        const aiMessage = this.createMessageElement(formattedResponse, 'ai');
        this.elements['chat-messages'].appendChild(aiMessage);

        // Aplicar Highlight.js
        if (typeof hljs !== 'undefined') {
          hljs.highlightAll();
        }

        // Resetar botão
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';

        // Salvar resposta da IA
        fetch('https://prochat-chat.onrender.com/api/chat/message', {  // ✅ URL completa adicionada
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          text: aiResponse,
          sender: 'ai',
          chatId: this.prochat.state.currentChatId
        })
      }).catch(err => console.error('Erro ao salvar resposta da IA:', err));

        this.elements['chat-messages'].scrollTop = this.elements['chat-messages'].scrollHeight;
      }
    },

    // Manipular input
    handleInput() {
      Utils.autoResizeTextarea(this.elements['chat-input']);

      // Ativar/desativar botão de aprimoramento
      const currentText = this.elements['chat-input'].value.trim();
      const wordCount = currentText.split(' ').length;
      const enhanceBtn = this.elements['enhance-btn'];

      if (wordCount >= 6) {
        enhanceBtn.classList.add('enhance-active');
      } else {
        enhanceBtn.classList.remove('enhance-active');
      }
    },

    // Manipular tecla Enter
    handleKeyPress(e) {
      if (e.key === 'Enter' && !this.prochat.state.isTyping) {
        this.sendMessage();
      }
    }
  };

  // ========================================
  // SISTEMA DE DOCUMENTOS
  // ========================================
  const DocumentSystem = {
    init(prochat) {
      this.prochat = prochat;
      this.elements = prochat.elements;
      return this;
    },

    // Mostrar modal de documentos
    async showModal() {
      console.log('🚀 Iniciando showDocumentsModal');

      const token = Utils.checkAuth();
      if (!token) return;

      // Criar modal se não existir
      let modal = document.getElementById('prochat-docs-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'prochat-docs-modal';
        modal.className = 'prochat-docs-modal';
        modal.innerHTML = `
          <div class="prochat-docs-modal-content">
            <div class="prochat-docs-modal-header">
              <h2 class="prochat-docs-modal-title">Meus Documentos</h2>
              <span class="prochat-docs-modal-close">&times;</span>
            </div>

            <div class="prochat-docs-modal-body">
              <div class="prochat-docs-loading" id="prochat-docs-loading">
                <div class="prochat-docs-spinner"></div>
                <p>Carregando documentos...</p>
              </div>

              <div class="prochat-docs-list" id="prochat-docs-list" style="display: none;"></div>

              <div class="prochat-docs-empty" id="prochat-docs-empty" style="display: none;">
                <div class="prochat-docs-empty-icon">📄</div>
                <h3>Nenhum documento encontrado</h3>
                <p>Crie seu primeiro documento compartilhando mensagens selecionadas.</p>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
      }

      // Aguardar DOM
      await new Promise(resolve => setTimeout(resolve, 50));

      // Configurar event listeners
      const closeBtn = modal.querySelector('.prochat-docs-modal-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          modal.style.setProperty('display', 'none', 'important');
        });
      }

      // Event listener para fechar ao clicar fora
      const handleOutsideClick = (e) => {
        if (e.target === modal) {
          modal.style.display = 'none';
          window.removeEventListener('click', handleOutsideClick);
        }
      };
      window.addEventListener('click', handleOutsideClick);

      modal.style.display = 'block';
      await this.loadDocumentsList();
    },

    // Carregar lista de documentos
    async loadDocumentsList() {
      await new Promise(resolve => setTimeout(resolve, 50));

      const loading = document.getElementById('prochat-docs-loading');
      const list = document.getElementById('prochat-docs-list');
      const empty = document.getElementById('prochat-docs-empty');

      if (!loading || !list || !empty) {
        console.error('Elementos do modal não encontrados');
        return;
      }

      loading.style.display = 'flex';
      list.style.display = 'none';
      empty.style.display = 'none';

      try {
        const token = Utils.checkAuth();
        if (!token) return;

        const response = await fetch('https://prochat-chat.onrender.com/api/documents', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
          throw new Error('Erro ao carregar documentos');
        }

        const data = await response.json();
        const documents = data.documents || [];

        loading.style.display = 'none';

        if (documents.length === 0) {
          empty.style.display = 'flex';
          return;
        }

        list.innerHTML = '';
        documents.forEach(doc => {
          const docCard = this.createDocumentCard(doc);
          list.appendChild(docCard);
        });

        list.style.display = 'grid';

      } catch (error) {
        Utils.handleError('carregar documentos', error);
        loading.style.display = 'none';
        empty.innerHTML = `
          <div class="prochat-docs-empty-icon">⚠️</div>
          <h3>Erro ao carregar documentos</h3>
          <p>Tente novamente mais tarde.</p>
        `;
        empty.style.display = 'flex';
      }
    },

    // Criar card de documento
    createDocumentCard(doc) {
      const card = document.createElement('div');
      card.className = 'prochat-docs-card';

      const createdDate = new Date(doc.createdAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      card.innerHTML = `
        <div class="prochat-docs-card-header">
          <div class="prochat-docs-card-title-section">
            <h3 class="prochat-docs-card-title">${doc.title}</h3>
            <button class="prochat-docs-delete-btn" title="Deletar documento">🗑️</button>
          </div>
          <span class="prochat-docs-card-date">${createdDate}</span>
        </div>

        <div class="prochat-docs-card-preview">
          <p class="prochat-docs-card-notes">${doc.notes || 'Sem observações'}</p>
          <span class="prochat-docs-card-count">
            ${doc.messages.length} mensagem${doc.messages.length !== 1 ? 'ens' : ''}
          </span>
        </div>

        <div class="prochat-docs-card-actions">
          <button class="prochat-docs-card-btn prochat-docs-view-btn">Ver Documento</button>
        </div>
      `;

      // Event listeners
      const deleteBtn = card.querySelector('.prochat-docs-delete-btn');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showDeleteModal(doc);
      });

      const viewBtn = card.querySelector('.prochat-docs-view-btn');
      viewBtn.addEventListener('click', () => {
        this.showDocumentDetail(doc);
      });

      return card;
    },

    // Modal de confirmação de delete
    showDeleteModal(doc) {
      const modal = document.createElement('div');
      modal.className = 'prochat-docs-delete-modal';
      modal.innerHTML = `
        <div class="prochat-docs-delete-content">
          <div class="prochat-docs-delete-header">
            <h3>Confirmar Exclusão</h3>
            <span class="prochat-docs-delete-close">&times;</span>
          </div>

          <div class="prochat-docs-delete-body">
            <div class="prochat-docs-delete-icon">⚠️</div>
            <p>Tem certeza que deseja deletar o documento <strong>"${doc.title}"</strong>?</p>
            <p class="prochat-docs-delete-warning">Esta ação não pode ser desfeita.</p>
          </div>

          <div class="prochat-docs-delete-footer">
            <button class="prochat-docs-delete-cancel">Cancelar</button>
            <button class="prochat-docs-delete-confirm">Deletar</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // ✅ CORREÇÃO: FORÇAR EXIBIÇÃO DO MODAL
      modal.style.display = 'block';

      const closeModal = () => document.body.removeChild(modal);

      modal.querySelector('.prochat-docs-delete-close').addEventListener('click', closeModal);
      modal.querySelector('.prochat-docs-delete-cancel').addEventListener('click', closeModal);
      window.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      modal.querySelector('.prochat-docs-delete-confirm').addEventListener('click', async () => {
        await this.deleteDocument(doc.documentId);
        closeModal();
      });
    },

    // Deletar documento
    async deleteDocument(documentId) {
      const token = Utils.checkAuth();
      if (!token) return;

      try {
        const response = await fetch(`https://prochat-chat.onrender.com/api/documents/${documentId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Erro ao deletar documento');
        }

        Utils.showPopup('Documento deletado com sucesso!');
        await this.loadDocumentsList();

      } catch (error) {
        Utils.handleError('deletar documento', error);
      }
    },

    // Mostrar detalhes do documento
    showDocumentDetail(doc) {
      const modal = document.createElement('div');
      modal.className = 'prochat-docs-detail-modal';
      modal.innerHTML = `
        <div class="prochat-docs-detail-content">
          <div class="prochat-docs-detail-header">
            <div class="prochat-docs-detail-info">
              <h2 class="prochat-docs-detail-title">${doc.title}</h2>
              <span class="prochat-docs-detail-date">
                Criado em ${new Date(doc.createdAt).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
            <div class="prochat-docs-detail-actions">
              <button class="prochat-docs-download-btn" id="download-btn">📥 Download</button>
              <span class="prochat-docs-detail-close">&times;</span>
            </div>
          </div>

          <div class="prochat-docs-detail-messages">
            <h3>Conversação</h3>
            <div class="prochat-docs-messages-list">
              ${doc.messages.map(msg => `
                <div class="prochat-docs-message ${msg.sender === 'user' ? 'user' : 'ai'}">
                  <div class="prochat-docs-message-header">
                    <span class="prochat-docs-message-sender">
                      ${msg.sender === 'user' ? '👤 Você' : '🤖 IA'}
                    </span>
                  </div>
                  <div class="prochat-docs-message-content">
                    ${msg.html || msg.content}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // Forçar exibição do modal
      modal.style.display = 'block';

      const closeModal = () => document.body.removeChild(modal);

      modal.querySelector('.prochat-docs-detail-close').addEventListener('click', closeModal);
      modal.querySelector('#download-btn').addEventListener('click', () => {
        this.downloadDocumentAsPDF(doc);
      });

      window.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      // Aplicar highlight.js - CORRIGIDO PARA EVITAR ERRO DE RE-HIGHLIGHT
      if (typeof hljs !== 'undefined') {
        setTimeout(() => {
          try {
            // Limpar highlights anteriores para evitar erro
            hljs.unhighlightAll();
            // Aplicar highlight novamente
            hljs.highlightAll();
          } catch (error) {
            console.warn('Erro ao aplicar highlight:', error);
          }
        }, 100);
      }
    },

    // Download como PDF
    downloadDocumentAsPDF(doc) {
      if (typeof html2pdf === 'undefined') {
        Utils.showPopup('Biblioteca de PDF não carregada.');
        return;
      }

      Utils.showPopup('Gerando PDF...');

      // ✅ Usando as MESMAS classes CSS do arquivo prochat.css
      const pdfContent = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <title>${doc.title}</title>
          <style>
            /* ========================================
               RESET E GERAIS - Copiado do prochat.css
               ======================================== */
            * { margin: 0; padding: 0; box-sizing: border-box; }
            
            body {
              font-family: 'Inter', 'Segoe UI', sans-serif;
              background: white;
              padding: 20px;
              color: #1e293b;
              line-height: 1.6;
              orphans: 3;
              widows: 3;
            }

            /* ========================================
               HEADER - Usando classes similares do CSS
               ======================================== */
            .pdf-header {
              text-align: center;
              margin-bottom: 30px;
              padding-bottom: 20px;
              border-bottom: 2px solid #3B82F6;
            }

            .page-title-main {
              font-size: 28px;
              font-weight: 600;
              color: #3B82F6;
              margin-bottom: 8px;
              position: relative;
              display: inline-block;
            }

            .page-title-main::after {
              content: '';
              position: absolute;
              bottom: -8px;
              left: 50%;
              transform: translateX(-50%);
              width: 60px;
              height: 3px;
              background: linear-gradient(90deg, #3B82F6, #8B5CF6);
              border-radius: 2px;
            }

            .pdf-date {
              font-size: 14px;
              color: #666;
              margin-top: 12px;
            }

            /* ========================================
               NOTES - Usando estilo similar aos modals
               ======================================== */
            .pdf-notes {
              background-color: #F8F9FA;
              border: 1px solid #E5E7EB;
              border-left: 4px solid #3B82F6;
              border-radius: 8px;
              padding: 20px;
              margin-bottom: 30px;
            }

            .pdf-notes h3 {
              font-size: 18px;
              font-weight: 600;
              color: #3B82F6;
              margin-bottom: 12px;
            }

            .pdf-notes p {
              margin: 0;
              color: #374151;
              line-height: 1.5;
            }

            /* ========================================
               MESSAGES - USANDO AS MESMAS CLASSES DO CSS
               ======================================== */
            .pdf-messages h3 {
              font-size: 22px;
              font-weight: 600;
              color: #1A1A1A;
              margin-bottom: 20px;
              padding-bottom: 10px;
              border-bottom: 1px solid #E0E0E0;
            }

            /* CLASSES EXATAS DO CSS ORIGINAL */
            .message-main {
              max-width: 100%;
              padding: 12px 18px;
              border-radius: 20px;
              font-size: 16px;
              font-weight: 400;
              line-height: 1.6;
              word-wrap: break-word;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
              margin-bottom: 30px;
              position: relative;
              break-inside: avoid;
              page-break-inside: avoid;
              width: 100%;
            }

            .message-user-main {
              background: linear-gradient(135deg, #3B82F6, #1D4ED8);
              color: #FFFFFF;
              border-bottom-right-radius: 4px;
              align-self: flex-end;
              margin-left: 0;
              break-inside: avoid;
            }

            .message-ai-main {
              background-color: #F8F9FA;
              color: #374151;
              border: 1px solid #E5E7EB;
              border-bottom-left-radius: 4px;
              align-self: flex-start;
              margin-right: 0;
              break-inside: avoid;
            }

            /* MARKDOWN STYLING - CLASSES EXATAS DO CSS */
            .message-ai-main {
              font-family: 'Inter', 'Segoe UI', sans-serif;
              font-size: 16px;
              line-height: 1.6;
              color: #1e293b;
              overflow-wrap: break-word;
            }

            .message-ai-main h1,
            .message-ai-main h2,
            .message-ai-main h3,
            .message-ai-main h4,
            .message-ai-main h5,
            .message-ai-main h6 {
              font-weight: 600;
              margin: 1em 0 0.5em 0;
              line-height: 1.3;
              color: #0f172a;
              break-after: avoid;
              page-break-after: avoid;
            }

            .message-ai-main p {
              margin: 0.75em 0;
              color: #1e293b;
              orphans: 2;
              widows: 2;
            }

            .message-ai-main ul,
            .message-ai-main ol {
              margin: 0.75em 0 0.75em 1.5em;
              padding: 0;
            }

            .message-ai-main li {
              margin: 0.4em 0;
            }

            .message-ai-main strong {
              font-weight: 600;
            }

            .message-ai-main em {
              font-style: italic;
            }

            .message-ai-main code {
              background-color: #f1f5f9;
              color: #dc2626;
              font-family: ui-monospace, monospace;
              font-size: 0.9em;
              padding: 0.15em 0.35em;
              border-radius: 4px;
              word-wrap: break-word;
              overflow-wrap: break-word;
              white-space: pre-wrap;
            }

            .message-ai-main pre {
              background-color: #0d1117;
              color: #e6edf3;
              font-family: ui-monospace, monospace;
              font-size: 0.85em;
              line-height: 1.4;
              border-radius: 8px;
              padding: 0.8em;
              overflow-x: visible;
              word-wrap: break-word;
              white-space: pre-wrap;
              margin: 1em -10px;
              break-inside: avoid;
              page-break-inside: avoid;
              max-width: calc(100% + 20px);
              width: calc(100% + 20px);
              box-sizing: border-box;
              position: relative;
            }

            .message-ai-main pre code {
              background: none;
              color: inherit;
              padding: 0;
              font-size: inherit;
              word-wrap: break-word;
              white-space: pre-wrap;
              overflow-wrap: break-word;
            }

            .message-ai-main blockquote {
              border-left: 4px solid #d1d5db;
              margin: 1em 0;
              padding-left: 1em;
              color: #475569;
              font-style: italic;
            }

            .message-ai-main a {
              color: #2563eb;
              text-decoration: none;
            }

            .message-ai-main a:hover {
              text-decoration: underline;
            }

            .message-ai-main table {
              border-collapse: collapse;
              width: 100%;
              margin: 1em 0;
              font-size: 0.9em;
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .message-ai-main th,
            .message-ai-main td {
              border: 1px solid #e2e8f0;
              padding: 0.6em 0.8em;
              text-align: left;
            }

            .message-ai-main th {
              background-color: #f8fafc;
              font-weight: 600;
            }

            .message-ai-main hr {
              border: none;
              border-top: 1px solid #e2e8f0;
              margin: 1.5em 0;
            }

            /* Header da mensagem */
            .message-header {
              font-weight: 600;
              font-size: 14px;
              margin-bottom: 8px;
              display: flex;
              align-items: center;
              gap: 8px;
              break-after: avoid;
              page-break-after: avoid;
            }

            .message-user-main .message-header {
              color: rgba(255, 255, 255, 0.9);
            }

            .message-ai-main .message-header {
              color: #374151;
            }

            /* Print optimization - MELHORADO */
            @media print {
              body { 
                font-size: 12px;
                orphans: 3;
                widows: 3;
              }
              
              .message-main { 
                break-inside: avoid;
                page-break-inside: avoid;
                margin-bottom: 20px;
              }
              
              .message-ai-main pre { 
                break-inside: avoid;
                page-break-inside: avoid;
                font-size: 0.8em;
                padding: 0.6em;
                margin: 1em -15px;
                max-width: calc(100% + 30px);
                width: calc(100% + 30px);
                max-height: 200px;
                overflow: visible;
              }
              
              .message-ai-main table { 
                break-inside: avoid;
                page-break-inside: avoid;
              }
              
              .page-title-main { 
                break-after: avoid;
                page-break-after: avoid;
              }
              
              .pdf-notes { 
                break-inside: avoid;
                page-break-inside: avoid;
              }

              .message-header {
                break-after: avoid;
                page-break-after: avoid;
              }

              p {
                orphans: 2;
                widows: 2;
              }

              .message-ai-main h1,
              .message-ai-main h2,
              .message-ai-main h3 {
                break-after: avoid;
                page-break-after: avoid;
              }
            }

            /* Container para as mensagens */
            .pdf-container {
              max-width: 100%;
              margin: 0;
              padding: 0;
            }
          </style>
        </head>
        <body>
          <div class="pdf-container">
            <div class="pdf-header">
              <h1 class="page-title-main">${doc.title}</h1>
              <div class="pdf-date">
                Criado em ${new Date(doc.createdAt).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>

            ${doc.notes ? `
              <div class="pdf-notes">
                <h3>Observações</h3>
                <p>${doc.notes}</p>
              </div>
            ` : ''}

            <div class="pdf-messages">
              <h3>Conversação</h3>
              ${doc.messages.map((msg, index) => `
                <div class="message-main ${msg.sender === 'user' ? 'message-user-main' : 'message-ai-main'}">
                  <div class="message-header">
                    ${msg.sender === 'user' ? '👤 Você' : '🤖 IA'} - Mensagem ${index + 1}
                  </div>
                  <div class="message-content">
                    ${msg.html || msg.content}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </body>
        </html>
      `;

      // Criar iframe invisível
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(pdfContent);
      iframeDoc.close();

      iframe.onload = () => {
        // Aplicar highlight.js se disponível
        if (typeof hljs !== 'undefined') {
          try {
            const codeBlocks = iframeDoc.querySelectorAll('pre code');
            codeBlocks.forEach(block => {
              hljs.highlightElement(block);
            });
          } catch (error) {
            console.warn('Erro ao aplicar highlight no PDF:', error);
          }
        }

        // Aguardar renderização e gerar PDF
        setTimeout(() => {
          const options = {
            margin: [10, 10, 10, 10],
            filename: `${doc.title.replace(/[^a-z0-9\s]/gi, '_').toLowerCase()}.pdf`,
            image: { 
              type: 'jpeg', 
              quality: 0.98 
            },
            html2canvas: { 
              scale: 1.8,
              useCORS: true,
              allowTaint: false,
              letterRendering: true,
              logging: false,
              windowWidth: 1400,
              windowHeight: 800,
              scrollX: 0,
              scrollY: 0
            },
            jsPDF: { 
              unit: 'mm', 
              format: 'a4', 
              orientation: 'portrait',
              compress: true,
              putOnlyUsedFonts: true
            },
            pagebreak: { 
              mode: ['avoid-all', 'css', 'legacy']
            }
          };

          html2pdf()
            .set(options)
            .from(iframeDoc.body)
            .save()
            .then(() => {
              Utils.showPopup('PDF baixado com sucesso!');
              document.body.removeChild(iframe);
            })
            .catch((error) => {
              Utils.handleError('gerar PDF', error);
              document.body.removeChild(iframe);
            });
        }, 1000);
      };

      // Fallback caso iframe não carregue
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          Utils.showPopup('Gerando PDF (modo fallback)...');
          const fallbackOptions = {
            margin: 15,
            filename: `${doc.title.replace(/[^a-z0-9\s]/gi, '_').toLowerCase()}.pdf`,
            html2canvas: { scale: 1.5, useCORS: true },
            jsPDF: { format: 'a4', orientation: 'portrait' }
          };

          html2pdf()
            .set(fallbackOptions)
            .from(iframeDoc.body)
            .save()
            .then(() => {
              Utils.showPopup('PDF baixado com sucesso!');
              document.body.removeChild(iframe);
            })
            .catch((error) => {
              Utils.handleError('gerar PDF', error);
              document.body.removeChild(iframe);
            });
        }
      }, 4000);
    }
  };

  // ========================================
  // SISTEMA DE COMPARTILHAMENTO
  // ========================================
  const SharingSystem = {
    init(prochat) {
      this.prochat = prochat;
      this.shareSelectedBtn = null;
      return this;
    },

    // Alternar modo de compartilhamento
    toggleMode() {
      this.prochat.state.isShareMode = !this.prochat.state.isShareMode;

      const shareBtn = this.prochat.elements['share-btn'];
      const chatMessages = this.prochat.elements['chat-messages'];

      if (this.prochat.state.isShareMode) {
        chatMessages.classList.add('share-mode-active');
        shareBtn.innerHTML = '<i class="fas fa-times"></i>';
        shareBtn.title = 'Cancelar compartilhamento';
        shareBtn.classList.add('share-active');
        Utils.showPopup('Modo de compartilhamento ativado. Clique nas mensagens para selecioná-las.');
      } else {
        chatMessages.classList.remove('share-mode-active');
        document.querySelectorAll('.message-main.selected').forEach(el => el.classList.remove('selected'));
        shareBtn.innerHTML = '<i class="fas fa-share-alt"></i>';
        shareBtn.title = 'Compartilhar mensagens';
        shareBtn.classList.remove('share-active');
        this.removeShareButton();
      }
    },

    // Atualizar botão de compartilhar
    updateShareButton() {
      const selectedCount = document.querySelectorAll('.message-main.selected').length;

      if (selectedCount > 0 && !this.shareSelectedBtn) {
        this.createShareButton();
      } else if (selectedCount === 0 && this.shareSelectedBtn) {
        this.removeShareButton();
      }
    },

    // Criar botão de compartilhar
    createShareButton() {
      const existingBtn = document.querySelector('.share-selected-btn');
      if (existingBtn) existingBtn.remove();

      this.shareSelectedBtn = document.createElement('button');
      this.shareSelectedBtn.textContent = 'Compartilhar Selecionadas';
      this.shareSelectedBtn.className = 'share-selected-btn';
      this.shareSelectedBtn.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ff7b00ff;
        color: white;
        border: none;
        padding: 12px 16px;
        border-radius: 6px;
        cursor: pointer;
        z-index: 10000;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        transition: all 0.2s ease;
      `;

      this.shareSelectedBtn.addEventListener('click', () => {
        const selectedMessages = document.querySelectorAll('.message-main.selected');
        if (selectedMessages.length === 0) {
          Utils.showPopup('Nenhuma mensagem selecionada.');
          return;
        }
        this.shareSelectedMessages(selectedMessages);
      });

      document.body.appendChild(this.shareSelectedBtn);
    },

    // Remover botão de compartilhar
    removeShareButton() {
      if (this.shareSelectedBtn) {
        this.shareSelectedBtn.remove();
        this.shareSelectedBtn = null;
      }
    },

    // Compartilhar mensagens selecionadas
    shareSelectedMessages(selectedMessages) {
      const modal = document.createElement('div');
      modal.id = 'doc-modal';
      modal.className = 'modal-backdrop';  // Atualizado para corresponder ao novo HTML
      modal.innerHTML = `
        <div class="create-document-modal">
            <div class="modal-header-section">
                <h2 class="document-title-heading">Criar Documento</h2>
                <span class="close-modal-btn">&times;</span>
            </div>

            <div class="modal-content-area">
                <div class="input-field-group">
                    <label for="document-title-input" class="field-label-text">Título do Documento *</label>
                    <input type="text" id="document-title-input" class="title-input-field" placeholder="Digite o título do seu documento...">
                </div>

                <div class="input-field-group">
                    <label for="document-notes-textarea" class="field-label-text">Observações (opcional)</label>
                    <textarea id="document-notes-textarea" class="notes-textarea-field" placeholder="Adicione observações, contexto ou detalhes extras..." rows="3"></textarea>
                </div>

                <div class="messages-preview-section">
                    <h3 class="preview-section-title">Mensagens Selecionadas:</h3>
                    <div class="selected-messages-container" id="selected-messages-preview">
                        <em>Nenhuma mensagem selecionada ainda</em>
                    </div>
                </div>
            </div>

            <div class="modal-footer-section">
                <button class="action-button cancel-action-btn">Cancelar</button>
                <button class="action-button create-document-btn">
                    <span>Criar Documento</span>
                </button>
              </div>
              </div>
      `;

      document.body.appendChild(modal);

      // Preencher preview - Limpar conteúdo inicial e adicionar mensagens
      const previewContainer = modal.querySelector('#selected-messages-preview');  // Atualizado para novo ID
      previewContainer.innerHTML = '';  // Limpar o <em> inicial
      selectedMessages.forEach(msg => {
        const msgClone = msg.cloneNode(true);
        const buttons = msgClone.querySelector('.message-buttons');
        if (buttons) buttons.remove();
        msgClone.classList.remove('selected');
        previewContainer.appendChild(msgClone);
      });

      // Event listeners - Atualizados para novas classes
      const titleInput = modal.querySelector('#document-title-input');  // Atualizado para novo ID
      const saveBtn = modal.querySelector('.create-document-btn');  // Atualizado para nova classe

      titleInput.addEventListener('input', () => {
        saveBtn.disabled = !titleInput.value.trim();
      });

      saveBtn.addEventListener('click', async () => {
        const title = titleInput.value.trim();
        const notes = modal.querySelector('#document-notes-textarea').value.trim();  // Atualizado para novo ID

        if (!title) {
          Utils.showPopup('O título é obrigatório.');
          return;
        }

        const token = Utils.checkAuth();
        if (!token) return;

        const documentData = {
          documentId: Date.now().toString(),
          title: title,
          notes: notes,
          messages: Array.from(selectedMessages).map(msg => ({
            sender: msg.classList.contains('message-user-main') ? 'user' : 'ai',
            content: msg.textContent.trim(),
            html: msg.innerHTML
          }))
        };

        try {
          const response = await fetch('https://prochat-chat.onrender.com/api/documents', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(documentData)
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Erro ao salvar documento');
          }

          document.body.removeChild(modal);
          Utils.showPopup(`Documento "${title}" criado com sucesso!`);
          this.toggleMode();

        } catch (error) {
          Utils.handleError('salvar documento', error);
        }
      });

      const closeModal = () => document.body.removeChild(modal);
      modal.querySelector('.close-modal-btn').addEventListener('click', closeModal);  // Atualizado para nova classe
      modal.querySelector('.cancel-action-btn').addEventListener('click', closeModal);  // Atualizado para nova classe
      window.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      setTimeout(() => titleInput.focus(), 100);
    }
  };

  // ========================================
  // SISTEMA DE APRIMORAMENTO
  // ========================================
  const EnhanceSystem = {
    init(prochat) {
      this.prochat = prochat;
      return this;
    },

    // Manipular clique no botão de aprimoramento
    handleClick() {
      const currentText = this.prochat.elements['chat-input'].value.trim();
      const wordCount = currentText.split(' ').length;

      if (wordCount < 6) {
        Utils.showPopup('O prompt deve ter pelo menos 6 palavras para ser aprimorado.');
        return;
      }

      this.enhancePrompt(currentText);
    },

    // ✅ ATUALIZADA: Aprimorar prompt com rastreamento Mixpanel
    async enhancePrompt(originalPrompt) {
      const token = this.prochat.systems.utils.checkAuth();
      if (!token) return;

      console.log('Iniciando aprimooramento de prompt...'); // Log de debug

      const modal = this.createModal();
      const textarea = modal.querySelector('#enhance-textarea');
      textarea.value = 'Carregando aprimoramento...';
      modal.style.display = 'block';

      // ✅ CORREÇÃO: Usar a função correta para obter userId
      const userId = this.prochat.systems.utils.getUserIdFromToken();

      // Rastrear tentativa de aprimoramento
      if (window.mixpanelClient) {
        console.log('Rastreando tentativa de aprimoramento:', userId); // Log de debug
        window.mixpanelClient.track('Prompt Enhancement Attempted', {
          distinct_id: userId || 'anonymous',
          originalPromptLength: originalPrompt.length,
          timestamp: new Date().toISOString(),
          wordCount: originalPrompt.split(' ').length
        });
      } else {
        console.warn('Mixpanel não inicializado'); // Log de debug
      }

      try {
        const instruction = `Você é um especialista em inteligência artificial com mais de 10 anos de experiência na criação de prompts eficazes. Sua função é reescrever o prompt original enviado pelo usuário, tornando-o mais claro, completo e direto, sem alterar sua intenção principal. O resultado deve ser um texto fluido e bem estruturado, redigido em primeira pessoa, como se fosse o próprio usuário falando diretamente com a IA. Comece com e não use títulos e asteriscos. Não execute a tarefa solicitada no prompt. Sua única responsabilidade é aprimorar o texto do prompt. Prompt original: "${originalPrompt}"`;

        const response = await fetch('https://prochat-chat.onrender.com/api/chat/ai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            text: instruction,
            model: 'deepseek-chat',
            max_tokens: 400
          })
        });

        const data = await response.json();
        if (response.ok) {
          textarea.value = data.response;
          console.log('Aprimooramento bem-sucedido'); // Log de debug

          // ✅ CORREÇÃO: Rastrear sucesso do aprimoramento
          if (window.mixpanelClient) {
            console.log('Raastreando sucesso do aprimoramento:', userId); // Log de debug
            window.mixpanelClient.track('Prompt Enhanced Successfully', {
              distinct_id: userId || 'anonymous',
              originalPromptLength: originalPrompt.length,
              enhancedPromptLength: data.response.length,
              modelUsed: 'deepseek-chat',
              timestamp: new Date().toISOString(),
              improvementRatio: (data.response.length / originalPrompt.length).toFixed(2)
            });
          }
        } else {
          textarea.value = 'Erro ao aprimorar prompt: ' + data.message;
          console.error('Erro na resposta:', data.message); // Log de debug

          // ✅ CORREÇÃO: Rastrear erro no aprimoramento
          if (window.mixpanelClient) {
            window.mixpanelClient.track('Prompt Enhancement Failed', {
              distinct_id: userId || 'anonymous',
              error: data.message,
              originalPromptLength: originalPrompt.length,
              timestamp: new Date().toISOString(),
              errorType: 'API_ERROR'
            });
          }
        }
      } catch (error) {
        textarea.value = 'Erro de conexão: ' + error.message;
        console.error('Erro de conexão:', error.message); // Log de debug

        // ✅ CORREÇÃO: Rastrear erro de conexão
        if (window.mixpanelClient) {
          window.mixpanelClient.track('Prompt Enhancement Error', {
            distinct_id: userId || 'anonymous',
            error: error.message,
            originalPromptLength: originalPrompt.length,
            timestamp: new Date().toISOString(),
            errorType: 'CONNECTION_ERROR'
          });
        }
      }
    },

    // ✅ ATUALIZADA: Criar modal com rastreamento adicional
    createModal() {
      const modal = document.createElement('div');
      modal.id = 'enhance-modal';
      modal.className = 'enhance-modal';
      modal.innerHTML = `
        <div class="enhance-modal-content">
          <span class="enhance-close">&times;</span>
          <h2>Melhorar Prompt</h2>
          <textarea id="enhance-textarea" placeholder="Edite o prompt aprimorado aqui..."></textarea>
          <div class="enhance-buttons">
            <button id="enhance-cancel-btn">Cancelar</button>
            <button id="enhance-send-btn">Enviar Prompt</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const closeModal = () => {
        modal.style.display = 'none';
        
        // ✅ ADICIONADO: Rastrear cancelamento do modal
        if (window.mixpanelClient) {
          const userId = this.prochat.systems.utils.getUserIdFromToken();
          window.mixpanelClient.track('Prompt Enhancement Modal Closed', {
            distinct_id: userId || 'anonymous',
            timestamp: new Date().toISOString(),
            action: 'modal_closed'
          });
        }
      };

      modal.querySelector('.enhance-close').addEventListener('click', closeModal);
      modal.querySelector('#enhance-cancel-btn').addEventListener('click', closeModal);
      window.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      modal.querySelector('#enhance-send-btn').addEventListener('click', () => {
        const enhancedText = modal.querySelector('#enhance-textarea').value.trim();
        if (enhancedText) {
          // ✅ ADICIONADO: Rastrear uso do prompt aprimorado
          if (window.mixpanelClient) {
            const userId = this.prochat.systems.utils.getUserIdFromToken();
            window.mixpanelClient.track('Enhanced Prompt Used', {
              distinct_id: userId || 'anonymous',
              enhancedPromptLength: enhancedText.length,
              timestamp: new Date().toISOString(),
              action: 'prompt_sent'
            });
          }

          this.prochat.elements['chat-input'].value = enhancedText;
          modal.style.display = 'none';
          this.prochat.systems.chat.sendMessage();
        } else {
          this.prochat.systems.utils.showPopup('O prompt não pode estar vazio.');
        }
      });

      return modal;
    }
  };

  // ========================================
  // SISTEMA DE MODELOS
  // ========================================
  const ModelSystem = {
    init(prochat) {
      this.prochat = prochat;
      return this;
    },

    // Mostrar modal de modelos
    showModal() {
      const modal = this.prochat.elements['model-modal'];
      modal.style.display = 'block';
      this.highlightCurrentModel();

      // Fechar modal
      document.querySelector('.model-close').addEventListener('click', () => {
        modal.style.display = 'none';
      });

      window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
      });
    },

    // Destacar modelo atual
    highlightCurrentModel() {
      document.querySelectorAll('.model-select-btn').forEach(btn => {
        btn.classList.remove('in-use');
        btn.textContent = btn.textContent.replace(' (Em Uso)', '');
      });

      const currentBtn = document.querySelector(`.model-select-btn[data-model="${this.prochat.state.selectedModel}"]`);
      if (currentBtn) {
        currentBtn.classList.add('in-use');
        currentBtn.textContent += ' (Em Uso)';
      }
    },

    // Mapear nomes de modelos
    getModelDisplayName(model) {
      const modelNames = {
        'gpt-4o-mini': 'GPT-5',
        'gpt-3.5-turbo': 'GPT-3.5 Turbo',
        'claude-sonnet-4-20250514': 'Claude Sonnet',
        'gemini-1.5-pro': 'Gemini 1.5 Pro',
        'deepseek-chat': 'DeepSeek Chat'
      };
      return modelNames[model] || 'IA Desconhecida';
    },

    // Atualizar nome da IA
    updateAIName(model) {
      const aiNameElement = document.getElementById('ai-name-text');
      if (aiNameElement) {
        aiNameElement.textContent = this.getModelDisplayName(model);
      }
    },

    // Mostrar popup da IA
    showAIPopup(model) {
      const popup = document.getElementById('ai-popup');
      const popupText = document.getElementById('ai-popup-text');
      const closeBtn = document.getElementById('ai-popup-close'); // Novo botão de fechar

      if (popup && popupText) {
        popupText.textContent = this.getModelDisplayName(model);
        popup.style.display = 'block';

        // Remover timeout automático
        // setTimeout(() => popup.style.display = 'none', 2000); // REMOVIDO

        // Adicionar event listener para fechar
        if (closeBtn) {
          closeBtn.onclick = () => {
            popup.style.display = 'none';
          };
        }

        // Opcional: Fechar ao clicar fora do popup
        popup.onclick = (e) => {
          if (e.target === popup) {
            popup.style.display = 'none';
          }
        };
      }
    }

  };
  
  // ========================================
// SISTEMA DE TUTORIAL - ADICIONE AQUI (APÓS ModelSystem)
// ========================================
const TutorialSystem = {
  init() {
    this.currentImageIndex = 0;
    this.images = Array.from({ length: 10 }, (_, i) => `../image/tutorial${i + 1}.jpg`);
    this.accessCount = parseInt(localStorage.getItem('tutorialAccessCount') || 0);
    this.checkAndShowTutorial();
    this.setupEventListeners();
      console.log('TutorialSystem: Iniciando...');
    const modal = document.getElementById('tutorial-modal');
    console.log('Modal encontrado:', modal);  // Deve mostrar o elemento, não null
 
  },

  checkAndShowTutorial() {
    if (this.accessCount < 4) {
      this.showModal();
      this.accessCount++;
      localStorage.setItem('tutorialAccessCount', this.accessCount);
    }
  },

  showModal() {
    const modal = document.getElementById('tutorial-modal');
    modal.style.display = 'flex';
    this.updateImage();
    this.updateButtons();
  },

  hideModal() {
    const modal = document.getElementById('tutorial-modal');
    modal.style.display = 'none';
  },

  updateImage() {
    const img = document.getElementById('tutorial-image');
    img.src = this.images[this.currentImageIndex];
    document.getElementById('tutorial-counter').textContent = `${this.currentImageIndex + 1} / 10`;
  },

  updateButtons() {
    const prevBtn = document.getElementById('tutorial-prev-btn');
    const nextBtn = document.getElementById('tutorial-next-btn');
    const closeBtn = document.getElementById('tutorial-close-btn');

    prevBtn.disabled = this.currentImageIndex === 0;
    nextBtn.textContent = this.currentImageIndex === 9 ? 'Finalizar' : 'Próxima →';

    // Na primeira vez, desabilitar fechamento até o final
    if (this.accessCount === 1) {
      closeBtn.style.display = this.currentImageIndex === 9 ? 'block' : 'none';
    } else {
      closeBtn.style.display = 'block';
    }
  },

  nextImage() {
    if (this.currentImageIndex < 9) {
      this.currentImageIndex++;
      this.updateImage();
      this.updateButtons();
    } else {
      this.hideModal();
    }
  },

  prevImage() {
    if (this.currentImageIndex > 0) {
      this.currentImageIndex--;
      this.updateImage();
      this.updateButtons();
    }
  },

  setupEventListeners() {
    document.getElementById('tutorial-next-btn').addEventListener('click', () => this.nextImage());
    document.getElementById('tutorial-prev-btn').addEventListener('click', () => this.prevImage());
    document.getElementById('tutorial-close-btn').addEventListener('click', () => this.hideModal());
    document.getElementById('tutorial-modal').addEventListener('click', (e) => {
      if (e.target === document.getElementById('tutorial-modal')) this.hideModal();
    });
  }
};

  // ========================================
  // INICIALIZAÇÃO
  // ========================================
  ProChat.init();

  // Configurar seletores de modelo (fora dos sistemas para compatibilidade)
  document.querySelectorAll('.model-select-btn').forEach(option => {
    option.addEventListener('click', () => {
      const selectedModel = option.getAttribute('data-model');
      ProChat.state.selectedModel = selectedModel;

      document.querySelectorAll('.model-select-btn').forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');

      ProChat.systems.models.showAIPopup(selectedModel);
      ProChat.systems.models.updateAIName(selectedModel);
      ProChat.elements['model-modal'].style.display = 'none';
    });
  });
});