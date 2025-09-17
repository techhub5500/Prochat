// ===== INICIALIZAÇÃO =====
// Aguarda o DOM carregar completamente antes de executar o código
document.addEventListener('DOMContentLoaded', () => {
  // Seleção de elementos (mover para o topo para evitar erro de referência)
  const loginSection = document.getElementById('login-section');
  const dashboardSection = document.getElementById('dashboard-section');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const formTitle = document.getElementById('form-title');
  const toggleLink = document.getElementById('toggle-link');
  const sideImage = document.querySelector('.side-image-main'); // Atualizado para classe única

  // Verificar se usuário está logado (multi-usuário) - se sim, mostrar dashboard ou inicializar diretamente
  const token = localStorage.getItem('token');
  if (token) {
    if (loginSection) {
      // Estamos em login.html: mostrar dashboard (mas como é separado, redirecionar)
      window.location.href = 'dashboard.html';
    } else {
      // Estamos em dashboard.html: inicializar diretamente (sem alternar seções)
      initDashboard();
    }
  } else {
    if (loginSection) {
      // Estamos em login.html: mostrar login
      showLogin();
    } else {
      // Estamos em dashboard.html sem token: redirecionar para login
      window.location.href = 'login.html';
    }
  }

  // Funções para alternar visualizações (usadas apenas em login.html)
  function showLogin() {
    if (loginSection && dashboardSection) {
      loginSection.style.display = 'block';
      dashboardSection.style.display = 'none';
    }
  }

  function showDashboard() {
    if (loginSection && dashboardSection) {
      loginSection.style.display = 'none';
      dashboardSection.style.display = 'block';
      initDashboard();
    }
  }

  // ===== ALTERNÂNCIA ENTRE LOGIN E CADASTRO =====
  // Usa delegação de eventos para alternar entre formulários de login e cadastro
  if (toggleLink) {
    toggleLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (e.target.id === 'toggle-signup') {
        // Mostra formulário de cadastro e oculta login
        if (signupForm && loginForm) {
          signupForm.style.display = 'block';
          loginForm.style.display = 'none';
        }
        if (formTitle) formTitle.textContent = 'Cadastro';
        if (toggleLink) toggleLink.innerHTML = 'Já tem conta? <a href="#" id="toggle-login">Entrar</a>';
        if (sideImage) sideImage.src = '../image/cadastro.png'; // Muda imagem para cadastro
      } else if (e.target.id === 'toggle-login') {
        // Mostra formulário de login e oculta cadastro
        if (signupForm && loginForm) {
          signupForm.style.display = 'none';
          loginForm.style.display = 'block';
        }
        if (formTitle) formTitle.textContent = 'Login';
        if (toggleLink) toggleLink.innerHTML = 'Não tem conta? <a href="#" id="toggle-signup">Cadastrar</a>';
        if (sideImage) sideImage.src = '../image/login.png'; // Volta imagem para login
      }
    });
  }

  // ===== SUBMISSÃO DO FORMULÁRIO DE LOGIN =====
  // Trata a submissão do formulário de login via API
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const identifier = document.getElementById('identifier').value;
      const password = document.getElementById('password').value;

      try {
        // Faz requisição POST para a API de login
        const response = await fetch('http://localhost:3000/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, password }),
        });

        const data = await response.json();
        if (response.ok) {
          // Sucesso: armazena token e redireciona para dashboard
          localStorage.setItem('token', data.token);
          window.location.href = 'dashboard.html';
        } else {
          // Erro: mostra mensagem da API
          alert(data.message || 'Erro no login');
        }
      } catch (error) {
        // Erro de conexão
        alert('Erro de conexão: ' + error.message);
      }
    });
  }

  // ===== SUBMISSÃO DO FORMULÁRIO DE CADASTRO =====
  // Trata a submissão do formulário de cadastro via API
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value;
      const name = document.getElementById('name').value;
      const email = document.getElementById('signup-email').value;
      const password = document.getElementById('signup-password').value;
      const plan = document.querySelector('input[name="plan"]:checked')?.value;
      
      // NOVO: Pegar código da organização (opcional)
      const organizationCode = document.getElementById('organization-code')?.value?.trim() || null;

      try {
        // Faz requisição POST para a API de cadastro
        const response = await fetch('http://localhost:3000/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, name, email, password, plan, organizationCode }),
        });

        const data = await response.json();
        if (response.ok) {
          // Sucesso: armazena token e redireciona para dashboard
          localStorage.setItem('token', data.token);
          window.location.href = 'dashboard.html';
        } else {
          // Erro: mostra mensagem da API
          alert(data.message || 'Erro no cadastro');
        }
      } catch (error) {
        // Erro de conexão
        alert('Erro de conexão: ' + error.message);
      }
    });
  }

  // ===== DASHBOARD FUNCIONALIDADES =====
  function initDashboard() {
    // Elementos da sidebar
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const logoutBtn = document.getElementById('logout-btn');
    const navProchat = document.getElementById('nav-prochat');
    const navSharing = document.getElementById('nav-sharing');
    const pageProchat = document.getElementById('page-prochat');
    const pageSharing = document.getElementById('page-sharing');

    // Recolher/expandir sidebar
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', () => {
        if (sidebar) sidebar.classList.toggle('collapsed');
      });
    }

    // Auto-retrair após 15 segundos
    setTimeout(() => {
      if (sidebar) sidebar.classList.add('collapsed');
    }, 15000);

    // Navegação entre páginas
    if (navProchat) {
      navProchat.addEventListener('click', (e) => {
        e.preventDefault();
        navProchat.classList.add('active');
        if (navSharing) navSharing.classList.remove('active');
        if (pageProchat) pageProchat.classList.remove('hidden');
        if (pageSharing) pageSharing.classList.add('hidden');
      });
    }

    if (navSharing) {
      navSharing.addEventListener('click', (e) => {
        e.preventDefault();
        navSharing.classList.add('active');
        if (navProchat) navProchat.classList.remove('active');
        if (pageSharing) pageSharing.classList.remove('hidden');
        if (pageProchat) pageProchat.classList.add('hidden');
      });
    }

    // Logout
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token'); // Limpar token para multi-usuário
        window.location.href = 'login.html'; // Redirecionar para login
      });
    }

    // Funcionalidades básicas de chat (placeholder para ProChat)
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-embedded-btn'); // Corrigido para o ID correto
    const chatMessages = document.getElementById('chat-messages');

    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        const message = chatInput?.value.trim();
        if (message && chatMessages) {
          // Adicionar mensagem do usuário
          const userMessage = document.createElement('div');
          userMessage.textContent = `Você: ${message}`;
          chatMessages.appendChild(userMessage);
          if (chatInput) chatInput.value = '';
          // Simular resposta da IA (placeholder)
          setTimeout(() => {
            const aiMessage = document.createElement('div');
            aiMessage.textContent = 'IA: Resposta simulada.';
            chatMessages.appendChild(aiMessage);
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }, 1000);
        }
      });
    }

  }
});