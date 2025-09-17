class AIRecommendationSystem {
  constructor() {
    this.aiModels = null;
    this.modal = null;
    this.currentRecommendation = null;
    this.init();
  }

  async init() {
    try {
      // Carrega os modelos de IA
      await this.loadAIModels();
      
      // Inicializa elementos do DOM
      this.initializeDOM();
      
      // Configura event listeners
      this.setupEventListeners();
    } catch (error) {
      console.error('Erro ao inicializar sistema de recomendação:', error);
    }
  }

  async loadAIModels() {
    try {
      // Tenta carregar do arquivo JSON local primeiro
      const response = await fetch('../../server/data/ai-models.json');
      if (response.ok) {
        this.aiModels = await response.json();
        console.log('Modelos de IA carregados com sucesso');
        return;
      }
      throw new Error('Arquivo não encontrado');
    } catch (error) {
      // Fallback para dados incorporados
      console.warn('Usando dados incorporados para modelos de IA');
      this.aiModels = {
        "models": {
          "deepseek-chat": {
            "name": "DeepSeek",
            "icon": "🔧",
            "description": "Especialista em código e raciocínio lógico",
            "strengths": [
              "Desenvolvimento de software e programação",
              "Arquitetura de sistemas complexos", 
              "Debugging e otimização de código",
              "Raciocínio algorítmico avançado",
              "Análise de performance e eficiência"
            ],
            "keywords": {
              "high": [
                "código", "programação", "algoritmo", "debug", "arquitetura", 
                "performance", "otimização", "função", "variável", "loop",
                "array", "objeto", "classe", "método", "api", "database",
                "sql", "javascript", "python", "react", "node", "framework",
                "biblioteca", "compilar", "executar", "sintaxe", "erro",
                "exception", "refatorar", "clean code", "design pattern",
                "estrutura de dados", "complexidade", "big o", "recursão"
              ],
              "medium": [
                "lógica", "matemática", "eficiência", "sistema", "técnico",
                "desenvolvimento", "implementar", "solução", "problema",
                "análise", "calcular", "computar", "processar"
              ],
              "low": [
                "desenvolver", "criar", "fazer", "construir", "montar"
              ]
            },
            "patterns": [
              "escreva.*código",
              "como.*programar",
              "otimiz.*performance",
              "debug.*erro",
              "criar.*função",
              "implementar.*algoritmo",
              "corrigir.*bug",
              "melhorar.*código",
              "como.*funciona.*código",
              "explicar.*programação"
            ],
            "negative_keywords": [
              "criativo", "história", "poema", "arte", "desenho", "música",
              "marketing", "vendas", "redação publicitária"
            ],
            "complexity_preference": "high",
            "confidence_boost": {
              "programming": 0.9,
              "logic": 0.8,
              "efficiency": 0.9,
              "mathematics": 0.8
            }
          },
          "claude-sonnet-4-20250514": {
            "name": "Claude",
            "icon": "🧠",
            "description": "Analista crítico e estratégico",
            "strengths": [
              "Análise crítica e estratégica profunda",
              "Tomada de decisão ética e responsável",
              "Pesquisa acadêmica e científica",
              "Consultoria e planejamento estratégico",
              "Análise de dados complexos e relatórios"
            ],
            "keywords": {
              "high": [
                "análise", "analise", "estratégia", "ética", "crítica",
                "pesquisa", "acadêmico", "científico", "consulta", "consultoria",
                "decisão", "dilema", "considerações", "avaliação", "relatório",
                "estudo", "investigação", "metodologia", "hipótese", "conclusão",
                "argumento", "evidência", "dados", "estatística", "comparar",
                "contrastar", "avaliar", "julgar", "ponderar", "reflexão"
              ],
              "medium": [
                "explicar", "analisar", "estudar", "examinar", "investigar",
                "comparação", "avaliação", "pensamento", "raciocínio",
                "lógico", "racional", "sistemático", "metódico"
              ],
              "low": [
                "pensar", "considerar", "refletir", "meditar"
              ]
            },
            "patterns": [
              "analise.*este",
              "avalie.*esta",
              "compare.*entre",
              "qual.*melhor.*estratégia",
              "como.*devo.*decidir",
              "preciso.*de.*conselho",
              "dilema.*ético",
              "considerações.*importantes",
              "prós.*e.*contras",
              "impacto.*de.*decisão"
            ],
            "negative_keywords": [
              "código", "programação", "desenvolver sistema", "html", "css",
              "javascript", "python", "sql"
            ],
            "complexity_preference": "high",
            "confidence_boost": {
              "analysis": 0.95,
              "strategy": 0.9,
              "ethics": 0.95,
              "research": 0.9,
              "decision_making": 0.9
            }
          },
          "gpt-4o-mini": {
            "name": "ChatGPT",
            "icon": "💬",
            "description": "Assistente versátil e comunicativo",
            "strengths": [
              "Comunicação clara e adaptável",
              "Escrita criativa e copywriting",
              "Educação e explicações didáticas",
              "Brainstorming e geração de ideias",
              "Suporte geral e conversação"
            ],
            "keywords": {
              "high": [
                "criativo", "escrita", "comunicação", "marketing", "copywriting",
                "educação", "ensino", "explicação", "didático", "tutorial",
                "brainstorming", "ideias", "versátil", "ajuda", "suporte",
                "redação", "texto", "artigo", "post", "conteúdo", "blog",
                "email", "carta", "mensagem", "apresentação", "discurso"
              ],
              "medium": [
                "criar", "escrever", "ajudar", "explicar", "ensinar",
                "gerar", "produzir", "desenvolver", "elaborar",
                "simples", "fácil", "rápido", "prático"
              ],
              "low": [
                "fazer", "dizer", "mostrar", "contar"
              ]
            },
            "patterns": [
              "escreva.*um.*texto",
              "crie.*um.*artigo",
              "me.*ajude.*com",
              "preciso.*de.*ideias",
              "como.*explicar.*para",
              "redija.*um.*email",
              "faça.*um.*resumo",
              "conte.*uma.*história",
              "brainstorm.*para",
              "gere.*ideias.*para"
            ],
            "negative_keywords": [
              "programação avançada", "arquitetura de software", "algoritmo complexo",
              "análise estratégica profunda", "pesquisa acadêmica"
            ],
            "complexity_preference": "medium",
            "confidence_boost": {
              "creativity": 0.9,
              "communication": 0.95,
              "education": 0.9,
              "versatility": 0.95,
              "brainstorming": 0.9
            }
          },
          "gemini-1.5-pro": {
            "name": "Gemini",
            "icon": "🌟",
            "description": "Especialista multimodal e pesquisa",
            "strengths": [
              "Processamento de imagens e conteúdo visual",
              "Pesquisa em tempo real e integração web",
              "Análise de documentos visuais complexos", 
              "Tradução e processamento multilíngue",
              "Integração com serviços Google"
            ],
            "keywords": {
              "high": [
                "imagem", "visual", "foto", "vídeo", "multimodal",
                "pesquisa", "buscar", "encontrar", "procurar", "atual",
                "tempo real", "integração", "google", "mapas", "tradução",
                "traduzir", "idioma", "língua", "multilíngue", "documento",
                "pdf", "gráfico", "tabela", "diagrama", "infográfico"
              ],
              "medium": [
                "ver", "analisar imagem", "descrever", "identificar",
                "localizar", "geografico", "regional", "internacional",
                "informações atuais", "notícias", "tendências"
              ],
              "low": [
                "mostrar", "visualizar", "apresentar"
              ]
            },
            "patterns": [
              "analise.*esta.*imagem",
              "descreva.*esta.*foto",
              "pesquise.*sobre",
              "encontre.*informações.*sobre",
              "traduza.*para",
              "onde.*fica",
              "informações.*atuais.*sobre",
              "o.*que.*está.*acontecendo",
              "notícias.*sobre",
              "tendências.*de"
            ],
            "negative_keywords": [
              "apenas texto", "sem imagens", "programação pura",
              "matemática abstrata"
            ],
            "complexity_preference": "medium",
            "confidence_boost": {
              "multimodal": 0.95,
              "search": 0.9,
              "translation": 0.9,
              "visual_analysis": 0.95,
              "integration": 0.8
            }
          }
        },
        "rules": {
          "fallback_priority": ["gpt-4o-mini", "claude-sonnet-4-20250514", "deepseek-chat", "gemini-1.5-pro"],
          "multimodal_triggers": ["imagem", "visual", "foto", "vídeo", "ver", "mostrar", "analisar imagem"],
          "urgency_triggers": ["urgente", "rápido", "agora", "imediato", "já", "pressa"],
          "programming_triggers": ["código", "programar", "desenvolver", "algoritmo", "função", "debug"],
          "creative_triggers": ["criar", "escrever", "redação", "história", "poema", "criativo"],
          "analysis_triggers": ["analisar", "avaliar", "comparar", "estratégia", "decidir", "ética"],
          "minimum_confidence": 0.3,
          "word_count_thresholds": {
            "simple": 10,
            "medium": 20, 
            "complex": 30
          },
          "penalty_multiplier": 0.3
        }
      };
    }
  }

  initializeDOM() {
    this.modal = document.getElementById('ai-recommendation-modal');
    this.taskDescription = document.getElementById('task-description');
    this.analyzeBtn = document.getElementById('analyze-task-btn');
    this.resultContainer = document.getElementById('recommendation-result');
    this.formContainer = document.querySelector('.ai-recommendation-form');
  }

  setupEventListeners() {
  // Botão de sugestão na sidebar
  const suggestionBtn = document.getElementById('sugestion-btn');
  if (suggestionBtn) {
    suggestionBtn.addEventListener('click', () => this.openModal());
  }

  // Fechar modal
  const closeBtn = document.getElementById('close-ai-recommendation-modal');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => this.closeModal());
  }

  // Analisar tarefa
  if (this.analyzeBtn) {
    this.analyzeBtn.addEventListener('click', () => this.analyzeTask());
  }

  // Cancelar
  const cancelBtn = document.getElementById('cancel-recommendation-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => this.closeModal());
  }

  // Usar IA recomendada
  const useAIBtn = document.getElementById('use-recommended-ai-btn');
  if (useAIBtn) {
    useAIBtn.addEventListener('click', () => this.useRecommendedAI());
  }

  // Tentar novamente
  const tryAgainBtn = document.getElementById('try-another-analysis-btn');
  if (tryAgainBtn) {
    tryAgainBtn.addEventListener('click', () => this.resetForm());
  }

  // Fechar modal ao clicar fora
  window.addEventListener('click', (event) => {
    if (event.target === this.modal) {
      this.closeModal();
    }
  });

  // Fechar modal com ESC
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && this.modal.classList.contains('show')) {
      this.closeModal();
    }
  });
}

  openModal() {
  if (this.modal) {
    this.modal.classList.add('show');
    this.resetForm();
    if (this.taskDescription) {
      this.taskDescription.focus();
    }
  }
}

closeModal() {
  if (this.modal) {
    this.modal.classList.remove('show');
    this.resetForm();
  }
}

  resetForm() {
    if (this.taskDescription) {
      this.taskDescription.value = '';
    }
    if (this.formContainer) {
      this.formContainer.style.display = 'block';
    }
    if (this.resultContainer) {
      this.resultContainer.classList.add('hidden');
    }
    this.currentRecommendation = null;
  }

  analyzeTask() {
    const description = this.taskDescription.value.trim();
    
    if (!description) {
      this.showToast('Por favor, descreva o que você quer fazer', 'warning');
      return;
    }

    if (description.length < 10) {
      this.showToast('Descrição muito curta. Seja mais específico', 'warning');
      return;
    }

    // Mostra loading
    this.analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analisando...';
    this.analyzeBtn.disabled = true;

    // Simula processamento
    setTimeout(() => {
      const recommendation = this.calculateRecommendation(description);
      this.displayRecommendation(recommendation);
      
      // Reset botão
      this.analyzeBtn.innerHTML = '<i class="fas fa-magic"></i> Analisar e Recomendar';
      this.analyzeBtn.disabled = false;
    }, 1500);
  }

  calculateRecommendation(description) {
    const text = description.toLowerCase();
    const scores = {};

    // Calcula score para cada modelo
    Object.keys(this.aiModels.models).forEach(modelKey => {
      const model = this.aiModels.models[modelKey];
      let score = 0;
      const reasons = [];
      let keywordMatches = 0;

      // Score baseado em keywords
      ['high', 'medium', 'low'].forEach(priority => {
        const keywords = model.keywords[priority] || [];
        const multiplier = priority === 'high' ? 3 : priority === 'medium' ? 2 : 1;
        
        keywords.forEach(keyword => {
          if (text.includes(keyword.toLowerCase())) {
            score += multiplier;
            keywordMatches++;
            if (priority === 'high') {
              reasons.push(`Palavra-chave relevante: "${keyword}"`);
            }
          }
        });
      });

      // Score baseado em patterns
      if (model.patterns) {
        model.patterns.forEach(pattern => {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(text)) {
            score += 5;
            reasons.push('Padrão de linguagem identificado');
          }
        });
      }

      // Penalidade por palavras negativas
      if (model.negative_keywords) {
        model.negative_keywords.forEach(negativeKeyword => {
          if (text.includes(negativeKeyword.toLowerCase())) {
            score *= 0.5; // Reduz score pela metade
            reasons.push(`Menos adequado para: ${negativeKeyword}`);
          }
        });
      }

      // Boost de confiança
      if (model.confidence_boost) {
        Object.keys(model.confidence_boost).forEach(category => {
          const categoryKeywords = this.getCategoryKeywords(category);
          if (categoryKeywords.some(keyword => text.includes(keyword))) {
            score *= model.confidence_boost[category];
            reasons.push(`Especialização em ${this.translateCategory(category)}`);
          }
        });
      }

      // Score mínimo baseado nas forças da IA
      if (keywordMatches === 0) {
        score = 1; // Score base mínimo
      }

      scores[modelKey] = {
        score: score,
        reasons: reasons.slice(0, 3), // Limita a 3 razões
        model: model
      };
    });

    // Encontra o melhor score
    const bestModel = Object.keys(scores).reduce((best, current) => {
      return scores[current].score > scores[best].score ? current : best;
    });

    const maxScore = Math.max(...Object.values(scores).map(s => s.score));
    const confidence = Math.min(Math.round((scores[bestModel].score / maxScore) * 100), 95);

    return {
      modelKey: bestModel,
      model: scores[bestModel].model,
      confidence: Math.max(confidence, 35), // Confiança mínima de 35%
      reasons: scores[bestModel].reasons,
      score: scores[bestModel].score
    };
  }

  getCategoryKeywords(category) {
    const categoryMap = {
      'programming': ['código', 'programação', 'desenvolver', 'algoritmo', 'função', 'debug'],
      'analysis': ['análise', 'analisar', 'avaliar', 'estudar', 'examinar'],
      'creativity': ['criativo', 'criar', 'escrever', 'redação', 'artigo', 'texto'],
      'multimodal': ['imagem', 'visual', 'foto', 'vídeo', 'ver', 'analisar imagem'],
      'search': ['pesquisar', 'buscar', 'encontrar', 'procurar'],
      'logic': ['lógica', 'matemática', 'raciocínio', 'cálculo'],
      'communication': ['comunicação', 'conversar', 'explicar', 'ensinar'],
      'strategy': ['estratégia', 'planejamento', 'decisão'],
      'ethics': ['ética', 'moral', 'responsável'],
      'education': ['educação', 'ensino', 'tutorial', 'explicação'],
      'versatility': ['versátil', 'geral', 'diversos'],
      'efficiency': ['eficiência', 'performance', 'otimização'],
      'translation': ['tradução', 'traduzir', 'idioma', 'língua'],
      'visual_analysis': ['visual', 'imagem', 'gráfico', 'diagrama'],
      'integration': ['integração', 'conectar', 'combinar']
    };
    
    return categoryMap[category] || [];
  }

  translateCategory(category) {
    const translations = {
      'programming': 'programação',
      'analysis': 'análise',
      'creativity': 'criatividade',
      'multimodal': 'processamento multimodal',
      'search': 'pesquisa',
      'logic': 'lógica',
      'communication': 'comunicação',
      'strategy': 'estratégia',
      'ethics': 'ética',
      'education': 'educação',
      'versatility': 'versatilidade',
      'efficiency': 'eficiência',
      'translation': 'tradução',
      'visual_analysis': 'análise visual',
      'integration': 'integração'
    };
    
    return translations[category] || category;
  }

  displayRecommendation(recommendation) {
    this.currentRecommendation = recommendation;
    
    // Esconde formulário e mostra resultado
    this.formContainer.style.display = 'none';
    this.resultContainer.classList.remove('hidden');

    // Atualiza informações da IA
    document.getElementById('recommended-ai-icon').textContent = recommendation.model.icon;
    document.getElementById('recommended-ai-name').textContent = recommendation.model.name;
    document.getElementById('recommended-ai-description').textContent = recommendation.model.description;

    // Atualiza barra de confiança
    const confidenceFill = document.getElementById('confidence-fill');
    const confidencePercentage = document.getElementById('confidence-percentage');
    
    confidenceFill.style.width = `${recommendation.confidence}%`;
    confidencePercentage.textContent = `${recommendation.confidence}%`;
    
    // Define cor da barra baseada na confiança
    if (recommendation.confidence >= 80) {
      confidenceFill.style.backgroundColor = '#4CAF50';
    } else if (recommendation.confidence >= 60) {
      confidenceFill.style.backgroundColor = '#FF9800';
    } else {
      confidenceFill.style.backgroundColor = '#f44336';
    }

    // Atualiza lista de razões
    const reasonsList = document.getElementById('recommendation-reasons-list');
    reasonsList.innerHTML = '';
    
    if (recommendation.reasons.length > 0) {
      recommendation.reasons.forEach(reason => {
        const li = document.createElement('li');
        li.textContent = reason;
        reasonsList.appendChild(li);
      });
    } else {
      const li = document.createElement('li');
      li.textContent = 'Análise baseada nas capacidades gerais da IA';
      reasonsList.appendChild(li);
    }

    // Adiciona forças da IA
    recommendation.model.strengths.slice(0, 2).forEach(strength => {
      const li = document.createElement('li');
      li.textContent = strength;
      reasonsList.appendChild(li);
    });
  }

  useRecommendedAI() {
    if (!this.currentRecommendation) return;

    // Integra com o sistema de seleção de modelo existente
    const modelKey = this.currentRecommendation.modelKey;
    
    // Simula clique no botão do modelo correspondente
    const modelButtons = document.querySelectorAll('.model-select-btn');
    modelButtons.forEach(button => {
      if (button.dataset.model === modelKey) {
        button.click();
      }
    });

    // Também armazena no localStorage como backup
    localStorage.setItem('selectedAIModel', modelKey);
    localStorage.setItem('selectedAIModelName', this.currentRecommendation.model.name);

    this.showToast(`${this.currentRecommendation.model.name} selecionada com sucesso!`, 'success');
    this.closeModal();
  }

  showToast(message, type = 'info') {
    // Reutiliza o sistema de toast existente
    const toast = document.getElementById('notification-toast');
    if (toast) {
      const messageElement = document.getElementById('toast-message');
      if (messageElement) {
        messageElement.textContent = message;
        toast.classList.add('show');
        
        // Remove a classe show após 3 segundos
        setTimeout(() => {
          toast.classList.remove('show');
        }, 3000);
      }
    } else {
      // Fallback: cria um toast simples
      const toastElement = document.createElement('div');
      toastElement.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#4CAF50' : type === 'warning' ? '#FF9800' : '#2196F3'};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        font-family: inherit;
        font-size: 14px;
      `;
      toastElement.textContent = message;
      document.body.appendChild(toastElement);
      
      setTimeout(() => {
        toastElement.remove();
      }, 3000);
    }
  }
}

// Inicializa o sistema quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
  new AIRecommendationSystem();
});