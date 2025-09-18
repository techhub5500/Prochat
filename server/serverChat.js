const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const validator = require('validator');
const winston = require('winston');
const NodeCache = require('node-cache');
const path = require('path');
const fs = require('fs'); // Adicionado para ler arquivos HTML
const mixpanel = require('mixpanel'); // Adicionado para Mixpanel

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({
  origin: [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://prochat-frontend.onrender.com/dashboard.html',
    'https://www.prochatt.com.br',
    'https://www.prochatt.com.br/dashboard.html',
    // URLs do Render - ADICIONAR ESTAS LINHAS:
    'https://prochat-frontend.onrender.com',  // URL do seu site estático
    'https://prochat-login.onrender.com',
    'https://prochat-chat.onrender.com',
    'https://prochat-sharing.onrender.com'
  ],
  credentials: true
}));

// Limitação de taxa: 100 requisições por minuto por IP
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 100,
  message: 'Muitas requisições, tente novamente mais tarde.',
});
app.use(limiter);

// Cache para resumos (TTL 10 minutos)
const cache = new NodeCache({ stdTTL: 600 });

// Logs com Winston
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'server.log' })
  ]
});

// Verificações de variáveis de ambiente
if (!process.env.MONGO_URI) {
  throw new Error('MONGO_URI não definida');
}
if (!process.env.JWT_SECRET) logger.warn('JWT_SECRET não definida, usando padrão');
if (!process.env.MIXPANEL_TOKEN) logger.warn('MIXPANEL_TOKEN não definida');

// Conectar ao MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => logger.info('Conectado ao MongoDB Atlas'))
  .catch(err => logger.error('Erro ao conectar ao MongoDB:', err));

// Modelo de Chat
const chatSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  chatId: { type: String, required: true },
  title: { type: String, required: true },
  messages: [{ text: String, sender: String, timestamp: { type: Date, default: Date.now } }],
  summary: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
const Chat = mongoose.model('Chat', chatSchema);

// Novo modelo para rastreamento de tokens acumulados
const tokenUsageSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  model: { type: String, required: true }, // Ex.: 'gpt-4o-mini', 'deepseek-chat'
  totalTokens: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now }
});
tokenUsageSchema.index({ userId: 1, model: 1 }, { unique: true }); // Índice único para userId + model
const TokenUsage = mongoose.model('TokenUsage', tokenUsageSchema);

// NOVO: Modelo para eventos (exceto tokens, que usam TokenUsage)
const eventSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  eventType: { type: String, required: true }, // Ex.: 'User Sent Message to AI', 'Prompt Enhancement Attempted (Server)', etc.
  properties: { type: Object, required: true }, // Objeto com as propriedades do evento
  timestamp: { type: Date, default: Date.now },
});
const Event = mongoose.model('Event', eventSchema);

// Modelo para Backup de Chats Deletados
const deletedChatSchema = new mongoose.Schema({
  originalChat: Object, // Cópia completa do chat deletado
  deletedAt: { type: Date, default: Date.now }
});
const DeletedChat = mongoose.model('DeletedChat', deletedChatSchema);

// Modelo de Documento
const documentSchema = new mongoose.Schema({
  userId: { type: String, required: true },        // ID do usuário (do JWT)
  documentId: { type: String, required: true },    // ID único do documento
  title: { type: String, required: true },         // Título do documento
  notes: { type: String, default: '' },            // Observações opcionais
  messages: [{                                     // Array das mensagens
    sender: { type: String, enum: ['user', 'ai'], required: true },
    content: { type: String, required: true },     // Conteúdo limpo
    html: { type: String, required: true }         // HTML formatado
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Índices para melhor performance
documentSchema.index({ userId: 1, createdAt: -1 }); // Busca por usuário e data
documentSchema.index({ documentId: 1 }, { unique: true }); // ID único

const Document = mongoose.model('Document', documentSchema);

// Instâncias das APIs
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// Mixpanel client
const mixpanelClient = mixpanel.init(process.env.MIXPANEL_TOKEN);

// Middleware de autenticação
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token não fornecido' });
  try {
    const secret = process.env.JWT_SECRET || 'secret';
    const decoded = jwt.verify(token, secret);
    req.userId = decoded.id;
    next();
  } catch (err) {
    logger.error('Erro ao verificar token:', err.message);
    res.status(401).json({ message: 'Token inválido' });
  }
};

// Função para gerar resumo com cache e otimização
const generateSummary = async (previousSummary, lastMessages) => {
  const cacheKey = `summary_${previousSummary}_${lastMessages.map(m => m.text).join('')}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const conversationText = lastMessages.map(msg => `${msg.sender === 'user' ? 'Usuário' : 'IA'}: ${msg.text}`).join('\n');
  const summaryPrompt = `Atualize o resumo abaixo com as novas mensagens. Mantenha o resumo acumulativo, focando nos pontos mais importantes. Limite a no máximo 40 palavras\n\nResumo anterior: ${previousSummary}\n\nNovas mensagens:\n${conversationText}`;

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: summaryPrompt }],
        max_tokens: 50,
      }),
    });
    const data = await response.json();
    const summary = data.choices[0].message.content.trim();
    cache.set(cacheKey, summary);
    return summary;
  } catch (error) {
    logger.error('Erro ao gerar resumo com DeepSeek:', error);
    return previousSummary;
  }
};

// Função para decidir se precisa de pesquisa
async function askModelForSearchDecision(userPrompt, modeloIA) {
  const now = new Date();
  const currentDateShort = now.toLocaleDateString('pt-BR'); // ex: 28/08/2025
  const currentMonthYear = now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }); // ex: agosto 2025

  const instruction = `Analise a pergunta do usuário abaixo e decida se uma pesquisa web externa é necessária.
DATA ATUAL: ${currentDateShort}

A saída OBRIGATÓRIA deve começar pela TAG em maiúsculas em linha própria: uma das:
#NO_SEARCH
#NEEDS_SEARCH#DEEPSEARCH (pesquisa aprofundada)
#NEEDS_SEARCH#SIMPLESEARCH (pesquisa simples)

Se a decisão for #NO_SEARCH, explique brevemente.
Se for #NEEDS_SEARCH, especifique o tipo.

Pergunta do usuário: "${userPrompt}"`;

  try {
    let response;
    if (modeloIA === 'gpt-4o-mini') {
      response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: instruction }],
        max_tokens: 50,
      });
      response = response.choices[0].message.content.trim();
    } else if (modeloIA === 'gpt-3.5-turbo') {
      response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: instruction }],
        max_tokens: 50,
      });
      response = response.choices[0].message.content.trim();
    } else if (modeloIA === 'claude-sonnet-4-20250514') {
      response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 50,
        messages: [{ role: 'user', content: instruction }],
      });
      response = response.content[0].text.trim();
    } else if (modeloIA === 'gemini-1.5-pro') {
      const modelGemini = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
      const result = await modelGemini.generateContent(instruction);
      response = result.response.text().trim();
    } else if (modeloIA === 'deepseek-chat') {
      const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: instruction }],
          max_tokens: 50,
        }),
      });
      const data = await res.json();
      response = data.choices[0].message.content.trim();
    } else {
      throw new Error('Modelo não suportado');
    }

    // Extrair decisões
    const noSearch = response.includes('#NO_SEARCH');
    const needsSearch = response.includes('#NEEDS_SEARCH');
    const isDeepSearch = response.includes('#DEEPSEARCH');
    const isSimpleSearch = response.includes('#SIMPLESEARCH');

    // Console.log das decisões
    console.log(`Decisão de Pesquisa: ${needsSearch ? 'Precisa' : 'Não precisa'}`);
    console.log(`Tipo de Pesquisa: ${isDeepSearch ? 'Aprofundada' : isSimpleSearch ? 'Simples' : 'Nenhuma'}`);

    return { noSearch, needsSearch, isDeepSearch, isSimpleSearch, response };
  } catch (error) {
    console.error('Erro ao decidir pesquisa:', error);
    return { noSearch: true, needsSearch: false, isDeepSearch: false, isSimpleSearch: false, response: 'Erro na decisão' };
  }
}

// Função para buscar com Serper
async function performSearch(query, numResults) {
  try {
    const searchResponse = await fetch(`https://google.serper.dev/search`, {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SEARCH_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query,
        num: numResults,
      }),
    });
    const searchData = await searchResponse.json();
    const searchResults = searchData.organic?.slice(0, numResults).map(result => `${result.title}: ${result.snippet}`).join('\n') || 'Nenhum resultado encontrado.';
    return searchResults;
  } catch (error) {
    console.error('Erro na busca:', error);
    return 'Erro na busca.';
  }
}

// Função para chamar IA (atualizada com decisão de pesquisa)
const callAI = async (model, message, context = '', maxTokens = null) => {
  const sanitizedMessage = validator.escape(message);
  const basePrompt = `Hoje é ${new Date().toISOString().split('T')[0]}. ${context ? `${context}\n\n` : ''}Responda sempre em português brasileiro. ${sanitizedMessage}`;
  
  logger.info(`Mensagem enviada: "${sanitizedMessage}" | Modelo: ${model} | Contexto: ${context ? 'Sim' : 'Não'} | Max Tokens: ${maxTokens}`);
  
  let tokenUsage = null; // Inicializar para capturar uso
  
  try {
    // Verificações de API configurada
    if (model === 'gpt-4o-mini' && !openai) throw new Error('OpenAI API não configurada');
    if (model === 'claude-sonnet-4-20250514' && !anthropic) throw new Error('Anthropic API não configurada');
    if (model === 'gemini-1.5-pro' && !genAI) throw new Error('Gemini API não configurada');

    const decision = await askModelForSearchDecision(sanitizedMessage, model);
    
    if (decision.needsSearch) {
      const numResults = decision.isDeepSearch ? 3 : 1;
      const searchResults = await performSearch(sanitizedMessage, numResults);
      const finalPrompt = `${basePrompt}\n\nResultados da pesquisa (${numResults} resultado${numResults > 1 ? 's' : ''}):\n${searchResults}\n\nBaseie sua resposta final nestes dados.`;
      
      if (model === 'gpt-4o-mini') {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: finalPrompt }],
          max_tokens: maxTokens || 2500,
        });
        tokenUsage = response.usage.total_tokens;
        return { response: response.choices[0].message.content, tokenUsage };
      } else if (model === 'gpt-3.5-turbo') {
        const response = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: finalPrompt }],
          max_tokens: maxTokens || 2500,
        });
        tokenUsage = response.usage.total_tokens;
        return { response: response.choices[0].message.content, tokenUsage };
      } else if (model === 'claude-sonnet-4-20250514') {
        const response = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: maxTokens || 2500,
          messages: [{ role: 'user', content: finalPrompt }],
        });
        tokenUsage = response.usage.input_tokens + response.usage.output_tokens; // Anthropic retorna separado
        return { response: response.content[0].text, tokenUsage };
      } else if (model === 'gemini-1.5-pro') {
        const modelGemini = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
        const result = await modelGemini.generateContent(finalPrompt);
        tokenUsage = result.response.usageMetadata.totalTokenCount; // Gemini retorna total
        return { response: result.response.text(), tokenUsage };
      } else if (model === 'deepseek-chat') {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: finalPrompt }],
            max_tokens: maxTokens || 2500,
          }),
        });
        const data = await response.json();
        tokenUsage = data.usage.total_tokens; // Assumindo formato similar ao OpenAI
        return { response: data.choices[0].message.content, tokenUsage };
      }
    } else {
      if (model === 'gpt-4o-mini') {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: basePrompt }],
          max_tokens: maxTokens || 2500,
        });
        tokenUsage = response.usage.total_tokens;
        return { response: response.choices[0].message.content, tokenUsage };
      } else if (model === 'gpt-3.5-turbo') {
        const response = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: basePrompt }],
          max_tokens: maxTokens || 2500,
        });
        tokenUsage = response.usage.total_tokens;
        return { response: response.choices[0].message.content, tokenUsage };
      } else if (model === 'claude-sonnet-4-20250514') {
        const response = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: maxTokens || 2500,
          messages: [{ role: 'user', content: basePrompt }],
        });
        tokenUsage = response.usage.input_tokens + response.usage.output_tokens;
        return { response: response.content[0].text, tokenUsage };
      } else if (model === 'gemini-1.5-pro') {
        const modelGemini = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
        const result = await modelGemini.generateContent(basePrompt);
        tokenUsage = result.response.usageMetadata.totalTokenCount;
        return { response: result.response.text(), tokenUsage };
      } else if (model === 'deepseek-chat') {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: basePrompt }],
            max_tokens: maxTokens || 2500,
          }),
        });
        const data = await response.json();
        tokenUsage = data.usage.total_tokens;
        return { response: data.choices[0].message.content, tokenUsage };
      }
    }
  } catch (error) {
    logger.error('Erro na API da IA:', error);
    return { response: 'Erro: Não foi possível obter resposta da IA.', tokenUsage: 0 }; // Retornar 0 em caso de erro
  }
};

// Rota para IA com contexto (atualizada para aceitar max_tokens)
app.post('/api/chat/ai', authenticate, [
  body('text').isLength({ min: 1 }).withMessage('Texto é obrigatório'),
  body('model').isIn(['gpt-4o-mini', 'gpt-3.5-turbo', 'claude-sonnet-4-20250514', 'gemini-1.5-pro', 'deepseek-chat']).withMessage('Modelo inválido'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { text, model, chatId, max_tokens } = req.body;
  const userId = req.userId;

  // Rastrear evento existente
  mixpanelClient.track('User Sent Message to AI', {
    distinct_id: userId,
    model: model,
    chatId: chatId || null,
    messageLength: text.length
  });

  // NOVO: Armazenar evento no MongoDB
  const eventData = {
    distinct_id: userId,
    model: model,
    chatId: chatId || null,
    messageLength: text.length,
    timestamp: new Date().toISOString()
  };
  const newEvent = new Event({
    userId,
    eventType: 'User Sent Message to AI',
    properties: eventData
  });
  await newEvent.save();

  try {
    let context = '';
    if (chatId) {
      const chat = await Chat.findOne({ userId, chatId });
      if (chat && chat.messages.length > 0) {
        const lastMessages = chat.messages.length > 20 ? chat.messages.slice(-5) : chat.messages.slice(-2);
        const updatedSummary = await generateSummary(chat.summary, lastMessages);
        
        chat.summary = updatedSummary;
        await chat.save();
        
        context = updatedSummary;
        logger.info(`Resumo atualizado para chat ${chatId}: ${context}`);
      }
    }

    const result = await callAI(model, text, context, max_tokens);
    const { response, tokenUsage } = result;

    // Acumular tokens no DB e enviar evento
    if (tokenUsage !== null && tokenUsage > 0) {
      // Buscar ou criar registro de uso para userId + model
      let usageRecord = await TokenUsage.findOne({ userId, model });
      if (!usageRecord) {
        usageRecord = new TokenUsage({ userId, model, totalTokens: 0 });
      }
      
      // Adicionar tokens atuais ao total
      usageRecord.totalTokens += tokenUsage;
      usageRecord.lastUpdated = new Date();
      await usageRecord.save();
      
      // Enviar evento ao Mixpanel com total acumulado
      mixpanelClient.track('Tokens Used', {
        distinct_id: userId,
        model: model,
        totalTokensUsed: usageRecord.totalTokens, // Total acumulado por modelo
        tokensInThisInteraction: tokenUsage, // Tokens desta interação (opcional para debug)
        timestamp: new Date().toISOString()
      });
      
      logger.info(`Tokens acumulados atualizados: ${usageRecord.totalTokens} para usuário ${userId} e modelo ${model}`);
    }

    res.json({ response });
  } catch (err) {
    logger.error('Erro na rota IA:', err);
    res.status(500).json({ message: 'Erro ao processar IA' });
  }
});

// Rota para salvar mensagem
app.post('/api/chat/message', authenticate, [
  body('text').isLength({ min: 1 }).withMessage('Texto é obrigatório'),
  body('sender').isIn(['user', 'ai']).withMessage('Sender deve ser user ou ai'),
  body('chatId').isLength({ min: 1 }).withMessage('ChatId é obrigatório'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { text, sender, chatId } = req.body;
  const userId = req.userId;

  try {
    let chat = await Chat.findOne({ userId, chatId });
    if (!chat) {
      const title = validator.escape(text.split(' ').slice(0, 5).join(' ') + '...');
      chat = new Chat({ userId, chatId, title, messages: [] });
    }

    // ✅ CORREÇÃO: Sanitizar apenas mensagens do usuário
    const messageText = sender === 'user' ? validator.escape(text) : text;
    chat.messages.push({ text: messageText, sender });
    await chat.save();

    res.json({ message: 'Mensagem salva' });
  } catch (err) {
    logger.error('Erro ao salvar mensagem:', err);
    res.status(500).json({ message: 'Erro ao salvar mensagem' });
  }
});

// Rota para servir o dashboard.html com o token do Mixpanel injetado
app.get('/dashboard', (req, res) => {
  try {
    const htmlPath = path.join(__dirname, '../client/html/dashboard.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    
    // Substituir pelo token do env
    html = html.replace(/\{\{MIXPANEL_TOKEN\}\}/g, process.env.MIXPANEL_TOKEN);
    
    console.log('HTML injetado enviado para dashboard'); // Log para debug
    res.send(html);
  } catch (error) {
    console.error('Erro ao servir dashboard.html:', error); // Log de erro
    res.status(500).send('Erro interno do servidor');
  }
});

app.post('/api/analytics/prompt-enhancement', authenticate, [
  body('action').isIn(['attempted', 'success', 'failed', 'used']).withMessage('Ação inválida'),
  body('originalPromptLength').isNumeric().withMessage('Tamanho do prompt original deve ser numérico'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { action, originalPromptLength, enhancedPromptLength, error } = req.body;
  const userId = req.userId;

  try {
    // Preparar dados para o Mixpanel
    const eventData = {
      distinct_id: userId,
      originalPromptLength,
      timestamp: new Date().toISOString(),
      serverSide: true
    };

    // Adicionar dados específicos baseados na ação
    if (action === 'success' && enhancedPromptLength) {
      eventData.enhancedPromptLength = enhancedPromptLength;
      eventData.improvementRatio = (enhancedPromptLength / originalPromptLength).toFixed(2);
    }

    if (action === 'failed' && error) {
      eventData.error = error;
      eventData.errorType = 'SERVER_SIDE';
    }

    // Enviar evento para Mixpanel
    const eventName = {
      'attempted': 'Prompt Enhancement Attempted (Server)',
      'success': 'Prompt Enhanced Successfully (Server)',
      'failed': 'Prompt Enhancement Failed (Server)',
      'used': 'Enhanced Prompt Used (Server)'
    }[action];

    mixpanelClient.track(eventName, eventData);

    // NOVO: Armazenar evento no MongoDB
    const newEvent = new Event({
      userId,
      eventType: eventName,
      properties: eventData
    });
    await newEvent.save();

    logger.info(`Evento Mixpanel enviado: ${eventName} para usuário ${userId}`);
    res.json({ message: 'Evento rastreado com sucesso' });

  } catch (err) {
    logger.error('Erro ao rastrear evento:', err);
    res.status(500).json({ message: 'Erro ao rastrear evento' });
  }
});

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, '../client')));

// Rota para obter histórico com busca e paginação
app.get('/api/chat/history', authenticate, async (req, res) => {
  const userId = req.userId;
  const { search, page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  try {
    let query = { userId };
    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }

    const chats = await Chat.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await Chat.countDocuments(query);
    res.json({ chats, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    logger.error('Erro ao carregar histórico:', err);
    res.status(500).json({ message: 'Erro ao carregar histórico' });
  }
});

// Rota para deletar chat com backup
app.delete('/api/chat/:chatId', authenticate, async (req, res) => {
  const { chatId } = req.params;
  const userId = req.userId;
  
  console.log('Tentando deletar chatId:', chatId, 'para userId:', userId); // Log para depuração
  
  if (!chatId || chatId === 'undefined') {
    return res.status(400).json({ message: 'ID do chat inválido' });
  }
  
  const chatIdentifier = chatId !== 'undefined' ? { chatId } : { _id: chatId };
  
  try {
    const chat = await Chat.findOne({ userId, ...chatIdentifier });
    if (!chat) {
      console.log('Chat não encontrado:', chatIdentifier); // Log para depuração
      return res.status(404).json({ message: 'Chat não encontrado' });
    }
    
    // Backup opcional
    const backup = new DeletedChat({ originalChat: chat });
    await backup.save();
    
    const result = await Chat.deleteOne({ userId, ...chatIdentifier });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Chat não encontrado' });
    }
    res.json({ message: 'Chat deletado' });
  } catch (err) {
    console.error('Erro ao deletar chat:', err);
    res.status(500).json({ message: 'Erro ao deletar chat' });
  }
});

// Rota para salvar documento
app.post('/api/documents', authenticate, [
  body('documentId').isLength({ min: 1 }).withMessage('DocumentId é obrigatório'),
  body('title').isLength({ min: 1 }).withMessage('Título é obrigatório'),
  body('messages').isArray({ min: 1 }).withMessage('Pelo menos uma mensagem é obrigatória'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { documentId, title, notes, messages } = req.body;
  const userId = req.userId;

  try {
    // Verificar se documento já existe
    const existingDoc = await Document.findOne({ userId, documentId });
    if (existingDoc) {
      return res.status(409).json({ message: 'Documento já existe' });
    }

    // Criar novo documento
    const document = new Document({
      userId,
      documentId,
      title: validator.escape(title), // Sanitizar título
      notes: notes ? validator.escape(notes) : '', // Sanitizar observações
      messages: messages.map(msg => ({
        sender: msg.sender,
        content: msg.sender === 'user' ? validator.escape(msg.content) : msg.content,
        html: msg.sender === 'user' ? validator.escape(msg.html) : msg.html
      }))
    });

    await document.save();
    logger.info(`Documento criado: ${title} para usuário ${userId}`);
    
    res.status(201).json({ 
      message: 'Documento criado com sucesso',
      documentId: document.documentId 
    });
  } catch (err) {
    logger.error('Erro ao salvar documento:', err);
    res.status(500).json({ message: 'Erro ao salvar documento' });
  }
});

// Rota para obter documentos do usuário
app.get('/api/documents', authenticate, async (req, res) => {
  const userId = req.userId;
  const { page = 1, limit = 10, search } = req.query;
  const skip = (page - 1) * limit;

  try {
    let query = { userId };
    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }

    const documents = await Document.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v'); // Excluir campo __v

    const total = await Document.countDocuments(query);
    
    res.json({ 
      documents, 
      total, 
      page: parseInt(page), 
      pages: Math.ceil(total / limit) 
    });
  } catch (err) {
    logger.error('Erro ao carregar documentos:', err);
    res.status(500).json({ message: 'Erro ao carregar documentos' });
  }
});

// Rota para obter documento específico
app.get('/api/documents/:documentId', authenticate, async (req, res) => {
  const { documentId } = req.params;
  const userId = req.userId;

  try {
    const document = await Document.findOne({ userId, documentId });
    if (!document) {
      return res.status(404).json({ message: 'Documento não encontrado' });
    }

    res.json({ document });
  } catch (err) {
    logger.error('Erro ao carregar documento:', err);
    res.status(500).json({ message: 'Erro ao carregar documento' });
  }
});

// Rota para deletar documento
app.delete('/api/documents/:documentId', authenticate, async (req, res) => {
  const { documentId } = req.params;
  const userId = req.userId;

  try {
    const result = await Document.deleteOne({ userId, documentId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Documento não encontrado' });
    }

    logger.info(`Documento deletado: ${documentId} para usuário ${userId}`);
    res.json({ message: 'Documento deletado com sucesso' });
  } catch (err) {
    logger.error('Erro ao deletar documento:', err);
    res.status(500).json({ message: 'Erro ao deletar documento' });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => logger.info(`Servidor de chat rodando naa porta ${PORT}`));