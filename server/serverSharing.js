const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();
const Mixpanel = require('mixpanel');

const mixpanel = Mixpanel.init(process.env.MIXPANEL_TOKEN);


const app = express();
const server = http.createServer(app);

// NOVO: Conectar ao MongoDB
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('💾 Conectado ao MongoDB (Sharing)'))
.catch(err => console.error('❌ Erro ao conectar ao MongoDB:', err));

// ✅ SCHEMA PARA CONVERSAS (ADICIONADO)
const conversationSchema = new mongoose.Schema({
    participants: [{ type: String, required: true }],
    participantNames: [{ type: String }],
    organizationCode: { type: String, required: true },
    lastMessageAt: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  plan: { type: String, required: true },
  organizationCode: { type: String, default: null },
  lastTrackedReturn: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);

// ✅ SCHEMA PARA EVENTOS DO CALENDÁRIO (ATUALIZADO)
const calendarEventSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    datetime: { type: String, required: true },
    participants: [{ type: String }],
    tag: { type: String, default: '' },
    createdBy: { type: String, required: true }, // Usar username para consistência
    createdByName: { type: String, required: true }, // Nome do criador
    organizationCode: { type: String, required: true }, // ✅ ADICIONADO
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// ✅ SCHEMA PARA MENSAGENS DO CHAT - COMPLETO
const chatMessageSchema = new mongoose.Schema({
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    recipientId: { type: String, required: true },
    recipientName: { type: String, required: true },
    message: { type: String },
    organizationCode: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    messageType: { type: String, enum: ['text', 'file'], default: 'text' },
    fileData: {
        originalName: String,
        filename: String,
        size: Number,
        mimeType: String,
        path: String
    },
    isRead: { type: Boolean, default: false }
});

const Conversation = mongoose.model('Conversation', conversationSchema);
const CalendarEvent = mongoose.model('CalendarEvent', calendarEventSchema);
const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

// NOVO: Modelo para eventos
const eventSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  eventType: { type: String, required: true },
  properties: { type: Object, required: true },
  timestamp: { type: Date, default: Date.now },
});
const Event = mongoose.model('Event', eventSchema);


// NOVO: Middleware de autenticação (unificado)
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'Token não fornecido' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Token inválido' });
    }
};

// ✅ CORS ATUALIZADO PARA INCLUIR PORTA 5500
app.use(cors({
    origin: [
        'http://localhost:3001', 
        'http://127.0.0.1:3001',
        'http://localhost:5500',  // ✅ ADICIONADO
        'http://127.0.0.1:5500'   // ✅ ADICIONADO
    ],
    credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// ✅ SOCKET.IO CORS ATUALIZADO PARA INCLUIR PORTA 5500
const io = socketIo(server, {
    cors: {
        origin: [
            'http://localhost:3001', 
            'http://127.0.0.1:3001',
            'http://localhost:5500',  // ✅ ADICIONADO
            'http://127.0.0.1:5500'   // ✅ ADICIONADO
        ],
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    }
});

// ✅ FUNÇÃO PARA ENCONTRAR OU CRIAR CONVERSA
async function findOrCreateConversation(user1Id, user1Name, user2Id, user2Name, organizationCode) {
    try {
        // Procurar conversa existente
        const participants = [user1Id, user2Id].sort();
        let conversation = await Conversation.findOne({
            participants: { $all: participants },
            organizationCode: organizationCode
        });

        if (!conversation) {
            // Criar nova conversa
            conversation = new Conversation({
                participants: participants,
                participantNames: [user1Name, user2Name],
                organizationCode: organizationCode
            });
            await conversation.save();
            console.log('💬 Nova conversa criada:', conversation._id);
        }

        return conversation;
    } catch (error) {
        console.error('❌ Erro ao criar/encontrar conversa:', error);
        throw error;
    }
}

// ✅ NOVA ROTA: Buscar todos os usuários da organização
app.get('/api/users', verifyToken, async (req, res) => {
  try {
    const organizationCode = req.user.organizationCode;
    const users = await User.find({ organizationCode: organizationCode }, 'username name email'); // Buscar apenas campos necessários
    res.json({ success: true, users });
  } catch (error) {
    console.error('❌ Erro ao buscar usuários:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

// ✅ ROTA PARA BUSCAR EVENTOS DO CALENDÁRIO (ATUALIZADA)
app.get('/api/calendar/events', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const username = req.user.username; // Usar username para consistência
        const organizationCode = req.user.organizationCode;

        console.log('📅 Buscando eventos do calendário para:', username);

        // Buscar eventos criados pelo usuário ou onde ele é participante
        const events = await CalendarEvent.find({
            $or: [
                { createdBy: username }, // ✅ CORRIGIDO: Usar username
                { participants: userId }
            ],
            organizationCode: organizationCode
        }).sort({ datetime: 1 });

        console.log('📅 Eventos encontrados:', events.length);

        res.json({ 
            success: true, 
            events: events 
        });

    } catch (error) {
        console.error('❌ Erro ao buscar eventos:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
});

// ✅ ROTA PARA SALVAR EVENTO DO CALENDÁRIO (ATUALIZADA)
app.post('/api/calendar/events', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const username = req.user.username;
        const organizationCode = req.user.organizationCode;

        const { id, title, description, datetime, participants, tag } = req.body;

        console.log('📅 Dados recebidos:', { id, title, description, datetime, participants, tag });
        console.log('📅 Usuário autenticado:', { userId, username, organizationCode });

        // ✅ VALIDAÇÃO ADICIONAL
        if (!title || !datetime) {
            console.log('❌ Validação falhou: Título ou data/hora ausentes');
            return res.status(400).json({ success: false, message: 'Título e data/hora são obrigatórios' });
        }

        if (!id) {
            console.log('❌ Validação falhou: ID ausente');
            return res.status(400).json({ success: false, message: 'ID do evento é obrigatório' });
        }

        console.log('📅 Salvando evento:', { id, title, datetime });

        // Verificar se o evento já existe
        let event = await CalendarEvent.findOne({ id: id });
        console.log('📅 Evento encontrado no banco:', event ? event._id : 'Nenhum');

        if (event) {
            // Atualizar evento existente
            event.title = title;
            event.description = description;
            event.datetime = datetime;
            event.participants = participants || [];
            event.tag = tag || '';
            event.updatedAt = new Date();
            await event.save();
            console.log('📅 Evento atualizado:', event._id);
        } else {
            // Criar novo evento
            event = new CalendarEvent({
                id: id,
                title: title,
                description: description,
                datetime: datetime,
                participants: participants || [],
                tag: tag || '',
                createdBy: username,
                createdByName: username,
                organizationCode: organizationCode
            });
            await event.save();
            console.log('📅 Novo evento criado:', event._id);
        }

        res.json({ 
            success: true, 
            message: 'Evento salvo com sucesso',
            event: event 
        });

    } catch (error) {
        console.error('❌ Erro detalhado ao salvar evento:', error);
        console.error('❌ Stack trace:', error.stack);
        res.status(500).json({ success: false, message: 'Erro interno do servidor', details: error.message });
    }
});

// ✅ ROTA PARA EXCLUIR EVENTO (ADICIONADA)
app.delete('/api/calendar/events/:eventId', verifyToken, async (req, res) => {
    try {
        const { eventId } = req.params;
        const username = req.user.username;

        const deletedEvent = await CalendarEvent.findOneAndDelete({ 
            id: eventId, 
            createdBy: username // Apenas o criador pode excluir
        });
        
        if (!deletedEvent) {
            return res.status(404).json({ success: false, message: 'Evento não encontrado' });
        }
        
        res.json({ success: true, message: 'Evento excluído com sucesso' });
    } catch (error) {
        console.error('❌ Erro ao excluir evento:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
});

// ✅ ROTA PARA BUSCAR HISTÓRICO DE MENSAGENS
app.get('/api/messages/:recipientId', verifyToken, async (req, res) => {
    try {
        const { recipientId } = req.params;
        const senderId = req.user.id;
        const organizationCode = req.user.organizationCode;

        console.log('🔍 Buscando mensagens entre:', senderId, 'e', recipientId);

        // Encontrar a conversa
        const participants = [senderId, recipientId].sort();
        const conversation = await Conversation.findOne({
            participants: { $all: participants },
            organizationCode: organizationCode
        });

        if (!conversation) {
            console.log('📭 Nenhuma conversa encontrada');
            return res.json({ success: true, messages: [] });
        }

        // Buscar mensagens da conversa
        const messages = await ChatMessage.find({
            conversationId: conversation._id
        }).sort({ timestamp: 1 }).limit(100); // Últimas 100 mensagens

        console.log('📜 Mensagens encontradas:', messages.length);

        res.json({ 
            success: true, 
            messages: messages,
            conversationId: conversation._id
        });

    } catch (error) {
        console.error('❌ Erro ao buscar mensagens:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
});

// ✅ ROTA PARA BUSCAR CONVERSAS DO USUÁRIO
app.get('/api/conversations', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const organizationCode = req.user.organizationCode;

        const conversations = await Conversation.find({
            participants: userId,
            organizationCode: organizationCode
        }).sort({ lastMessageAt: -1 });

        res.json({ success: true, conversations });

    } catch (error) {
        console.error('❌ Erro ao buscar conversas:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
});

// Upload de arquivos
app.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
    try {
        console.log('📁 Iniciando upload...');
        
        if (!req.file) {
            console.log('❌ Nenhum arquivo no upload');
            return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado' });
        }

        const { recipientId } = req.body;
        const senderId = req.user.id;
        const senderName = req.user.username;
        const organizationCode = req.user.organizationCode;

        if (!recipientId) {
            console.log('❌ RecipientId não fornecido');
            return res.status(400).json({ success: false, message: 'ID do destinatário não fornecido' });
        }

        console.log('📁 Upload recebido:', {
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            senderId,
            recipientId
        });

        // ✅ BUSCAR NOME DO DESTINATÁRIO
        const recipient = connectedUsers.get(recipientId);
        const recipientName = recipient ? recipient.username : 'Usuário';

        // ✅ ENCONTRAR OU CRIAR CONVERSA
        const conversation = await findOrCreateConversation(
            senderId, senderName, recipientId, recipientName, organizationCode
        );

        // ✅ SALVAR MENSAGEM NO MONGODB
        const fileMessage = new ChatMessage({
            conversationId: conversation._id,
            senderId: senderId,
            senderName: senderName,
            recipientId: recipientId,
            recipientName: recipientName,
            organizationCode: organizationCode,
            messageType: 'file',
            fileData: {
                originalName: req.file.originalname,
                filename: req.file.filename,
                size: req.file.size,
                mimeType: req.file.mimetype,
                path: req.file.path
            }
        });

        await fileMessage.save();
        console.log('💾 Arquivo salvo no MongoDB:', fileMessage._id);

        // Atualizar última mensagem da conversa
        conversation.lastMessageAt = new Date();
        await conversation.save();

        // Emitir via Socket.IO para o destinatário
        const recipientSocket = connectedUsers.get(recipientId);
        if (recipientSocket) {
            io.to(recipientSocket.socketId).emit('file_received', {
                messageId: fileMessage._id,
                senderId: senderId,
                senderName: senderName,
                timestamp: fileMessage.timestamp,
                fileData: {
                    originalName: req.file.originalname,
                    filename: req.file.filename,
                    size: req.file.size
                }
            });
            console.log('📤 Arquivo enviado via socket para:', recipientName);
        }

        res.json({ 
            success: true, 
            message: 'Arquivo enviado com sucesso',
            messageId: fileMessage._id,
            filename: req.file.filename 
        });

        console.log('✅ Upload completado com sucesso');

    } catch (error) {
        console.error('❌ Erro no upload:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
});

// Servir arquivos uploadados
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Armazenar usuários conectados
const connectedUsers = new Map();

// Middleware de autenticação para Socket.IO
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
        return next(new Error('Token não fornecido'));
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
        next();
    } catch (error) {
        next(new Error('Token inválido'));
    }
});

// Conexões Socket.IO
io.on('connection', (socket) => {
  const user = socket.user;
  console.log(`👤 Usuário conectado: ${user.username} (${user.id})`);
  
  // Adicionar usuário à lista de conectados
  connectedUsers.set(user.id, {
    socketId: socket.id,
    id: user.id,
    username: user.username,
    organizationCode: user.organizationCode
  });
  
  // ✅ NOVO: Buscar e entregar mensagens não lidas ao conectar
  (async () => {
    try {
      const unreadMessages = await ChatMessage.find({
        recipientId: user.id,
        isRead: false
      }).sort({ timestamp: 1 });
      
      unreadMessages.forEach(msg => {
        socket.emit('new_message', {
          messageId: msg._id,
          senderId: msg.senderId,
          senderName: msg.senderName,
          message: msg.message,
          timestamp: msg.timestamp
        });
        // Marcar como lida
        msg.isRead = true;
        msg.save();
      });
    } catch (error) {
      console.error('❌ Erro ao entregar mensagens pendentes:', error);
    }
  })();
  
  // Emitir lista de usuários online para a organização
  const onlineUsers = Array.from(connectedUsers.values())
    .filter(u => u.organizationCode === user.organizationCode);
  
  io.emit('users_online', onlineUsers);
    
    // ✅ LISTENER PARA MENSAGENS DE TEXTO
    socket.on('send_message', async (data) => {
    try {
        const { recipientId, message } = data;
        const senderId = user.id;
        const senderName = user.username;
        const organizationCode = user.organizationCode;

        console.log(`💬 Mensagem de ${senderName} para ${recipientId}: ${message}`);

        // ✅ BUSCAR NOME DO DESTINATÁRIO
        const recipient = connectedUsers.get(recipientId);
        const recipientName = recipient ? recipient.username : 'Usuário';

        // ✅ ENCONTRAR OU CRIAR CONVERSA
        const conversation = await findOrCreateConversation(
            senderId, senderName, recipientId, recipientName, organizationCode
        );

        // ✅ SALVAR MENSAGEM NO MONGODB
        const chatMessage = new ChatMessage({
            conversationId: conversation._id,
            senderId: senderId,
            senderName: senderName,
            recipientId: recipientId,
            recipientName: recipientName,
            message: message,
            organizationCode: organizationCode,
            messageType: 'text',
            isRead: false // NOVO: Marcar como não lida inicialmente
        });

        await chatMessage.save();
        console.log('💾 Mensagem salva no MongoDB:', chatMessage._id);

        // Atualizar última mensagem da conversa
        conversation.lastMessageAt = new Date();
        await conversation.save();

        // NOVO: Rastrear "Message Sent" no Mixpanel
        mixpanel.track('Message Sent', {
            distinct_id: user.id, // Usar o ID do usuário como distinct_id
            senderId: senderId,
            senderName: senderName,
            recipientId: recipientId,
            recipientName: recipientName,
            organizationCode: organizationCode,
            messageType: 'text',
            timestamp: new Date().toISOString()
        });

        // NOVO: Armazenar evento no MongoDB
        const newEvent = new Event({
            userId: user.id,
            eventType: 'Message Sent',
            properties: {
                distinct_id: user.id,
                senderId: senderId,
                senderName: senderName,
                recipientId: recipientId,
                recipientName: recipientName,
                organizationCode: organizationCode,
                messageType: 'text',
                timestamp: new Date().toISOString()
            }
        });
        await newEvent.save();

        // Emitir para o destinatário
        const recipientSocket = connectedUsers.get(recipientId);
        if (recipientSocket) {
            io.to(recipientSocket.socketId).emit('new_message', {
                messageId: chatMessage._id,
                senderId: senderId,
                senderName: senderName,
                message: message,
                timestamp: chatMessage.timestamp
            });

            console.log('📤 Mensagem enviada via socket para:', recipientName);
        }

    } catch (error) {
        console.error('❌ Erro ao enviar mensagem:', error);
    }
});
    
    // Typing indicators
    socket.on('typing', (data) => {
        const recipientSocket = connectedUsers.get(data.recipientId);
        if (recipientSocket) {
            io.to(recipientSocket.socketId).emit('user_typing', {
                userId: user.id,
                username: user.username
            });
        }
    });
    
    socket.on('stop_typing', (data) => {
        const recipientSocket = connectedUsers.get(data.recipientId);
        if (recipientSocket) {
            io.to(recipientSocket.socketId).emit('user_stopped_typing', {
                userId: user.id,
                username: user.username
            });
        }
    });
    
    // Desconexão
    socket.on('disconnect', () => {
        console.log(`👋 Usuário desconectado: ${user.username}`);
        connectedUsers.delete(user.id);
        
        // Atualizar lista de usuários online
        const onlineUsers = Array.from(connectedUsers.values())
            .filter(u => u.organizationCode === user.organizationCode);
        
        io.emit('users_online', onlineUsers);
    });

    // ✅ LISTENER PARA EVENTOS DO CALENDÁRIO (ATUALIZADO)
    socket.on('calendar_event', async (data) => {
        try {
            const { event, recipientId } = data;
            
            console.log('📅 Evento de calendário recebido:', event.title);
            
            // Salvar ou atualizar o evento no banco
            let dbEvent = await CalendarEvent.findOne({ id: event.id });
            
            if (dbEvent) {
                dbEvent.title = event.title;
                dbEvent.description = event.description;
                dbEvent.datetime = event.datetime;
                dbEvent.participants = event.participants || [];
                dbEvent.tag = event.tag || '';
                dbEvent.updatedAt = new Date();
                await dbEvent.save();
            } else {
                dbEvent = new CalendarEvent({
                    id: event.id,
                    title: event.title,
                    description: event.description,
                    datetime: event.datetime,
                    participants: event.participants || [],
                    tag: event.tag || '',
                    createdBy: event.createdBy, // Já é username
                    createdByName: event.createdBy, // Nome do criador
                    organizationCode: user.organizationCode
                });
                await dbEvent.save();
            }
            
            // Emitir para o destinatário
            const recipientSocket = connectedUsers.get(recipientId);
            if (recipientSocket) {
                io.to(recipientSocket.socketId).emit('calendar_event', {
                    event: dbEvent
                });
                console.log('📅 Evento enviado via socket para:', recipientId);
            }
            
        } catch (error) {
            console.error('❌ Erro ao processar evento de calendário:', error);
        }
    });
});

const PORT = process.env.SHARING_PORT || 5002;
server.listen(PORT, () => {
    console.log(`🚀 Servidor de Sharing rodando na porta ${PORT}`);
    console.log(`📡 CORS habilitado para portas: 3001, 5500`);
});