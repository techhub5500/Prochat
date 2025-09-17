const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const Mixpanel = require('mixpanel');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000; // Já usa a porta do .env (3000)

const mixpanel = Mixpanel.init(process.env.MIXPANEL_TOKEN);

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    // Adicionar URL do Render, ex: 'https://your-app.onrender.com'
  ],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Conectar ao MongoDB (removidas opções deprecated)
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('Conectado ao MongoDB'))
.catch(err => console.error('Erro ao conectar ao MongoDB:', err));

// ===== NOVO: Carregar códigos de organização válidos do .env =====
const VALID_ORGANIZATION_CODES = Object.keys(process.env)
  .filter(key => key.startsWith('EMPRESA_') && key.endsWith('_2024'))
  .map(key => process.env[key]); // Pegar os valores, não as chaves

console.log('Códigos de organização válidos carregados (valores):', VALID_ORGANIZATION_CODES);

// Schema do Usuário - ATUALIZADO com organizationCode OPCIONAL e campos para perfil
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  plan: { type: String, required: true },
  organizationCode: { type: String, default: null },
  lastTrackedReturn: { type: Date, default: null }, // Para rastrear a última vez que "User Returned" foi enviado
  lastLogin: { type: Date, default: null }, // NOVO: Último login (para perfil)
  lastSeen: { type: Date, default: null }, // NOVO: Último acesso (para perfil)
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);

// NOVO: Schema para eventos (métricas)
const eventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventType: { type: String, required: true }, // Ex.: 'User Signed Up', 'User Logged In', 'User Returned'
  properties: { type: Object, required: true }, // Objeto com as propriedades do evento
  timestamp: { type: Date, default: Date.now },
});

const Event = mongoose.model('Event', eventSchema);

// Rota de Cadastro - ATUALIZADA para isolamento gradual
app.post('/api/signup', async (req, res) => {
  try {
    const { username, name, email, password, plan, organizationCode } = req.body;

    // Verificar se o usuário já existe
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Usuário ou e-mail já existe' });
    }

    // NOVO: Se organizationCode foi fornecido, validar
    if (organizationCode && !VALID_ORGANIZATION_CODES.includes(organizationCode)) {
      return res.status(400).json({ message: 'Código da organização inválido' });
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Criar novo usuário - INCLUINDO organizationCode se fornecido
    const newUser = new User({ 
      username, 
      name, 
      email, 
      password: hashedPassword, 
      plan,
      organizationCode: organizationCode || null // Campo opcional
    });
    await newUser.save();

    // NOVO: Rastrear "User Signed Up" no Mixpanel
    mixpanel.track('User Signed Up', {
      distinct_id: newUser._id.toString(),
      username: newUser.username,
      email: newUser.email,
      plan: newUser.plan,
      organizationCode: newUser.organizationCode || 'None',
      timestamp: new Date().toISOString()
    });

    // NOVO: Armazenar evento no MongoDB
    const eventData = {
      distinct_id: newUser._id.toString(),
      username: newUser.username,
      email: newUser.email,
      plan: newUser.plan,
      organizationCode: newUser.organizationCode || 'None',
      timestamp: new Date().toISOString()
    };
    const newEvent = new Event({
      userId: newUser._id,
      eventType: 'User Signed Up',
      properties: eventData
    });
    await newEvent.save();

    // NOVO: Definir propriedades de pessoas para o perfil do usuário
    mixpanel.people.set(newUser._id.toString(), {
      $name: newUser.name, // Nome completo
      $email: newUser.email,
      username: newUser.username,
      plan: newUser.plan,
      organizationCode: newUser.organizationCode || 'None',
      $created: new Date().toISOString() // Data de criação
    });

    // Log de cadastro bem-sucedido
    console.log(`Usuário cadastrado com sucesso: ${username} (${email}) (Plano: ${plan}) (Org: ${organizationCode || 'Nenhuma'})`);

    // Gerar token JWT - INCLUINDO organizationCode se existir
    const token = jwt.sign({ 
      id: newUser._id, 
      username: newUser.username, 
      email: newUser.email,
      organizationCode: newUser.organizationCode // NOVO: Inclui no token
    }, process.env.JWT_SECRET || 'secret');

    res.status(201).json({ message: 'Usuário criado com sucesso', token });
  } catch (error) {
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

// Rota de Login - ATUALIZADA para isolamento gradual
app.post('/api/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    // Encontrar usuário por username ou email
    const user = await User.findOne({
      $or: [
        { email: identifier },
        { username: identifier }
      ]
    });
    if (!user) {
      return res.status(400).json({ message: 'Credenciais inválidas' });
    }

    // Verificar senha
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Credenciais inválidas' });
    }

    // NOVO: Rastrear "User Logged In" no Mixpanel
    mixpanel.track('User Logged In', {
      distinct_id: user._id.toString(),
      username: user.username,
      email: user.email,
      organizationCode: user.organizationCode || 'None',
      timestamp: new Date().toISOString()
    });

    // NOVO: Armazenar evento no MongoDB
    const eventData = {
      distinct_id: user._id.toString(),
      username: user.username,
      email: user.email,
      organizationCode: user.organizationCode || 'None',
      timestamp: new Date().toISOString()
    };
    const newEvent = new Event({
      userId: user._id,
      eventType: 'User Logged In',
      properties: eventData
    });
    await newEvent.save();

    // NOVO: Definir propriedades de pessoas no Mixpanel (atualiza perfil)
    mixpanel.people.set(user._id.toString(), {
      $name: user.name,
      $email: user.email,
      username: user.username,
      plan: user.plan,
      organizationCode: user.organizationCode || 'None',
      $last_login: new Date().toISOString()
    });

    // NOVO: Atualizar perfil no DB
    user.lastLogin = new Date();
    await user.save();

    // Log de login bem-sucedido
    console.log(`Usuário logado com sucesso: ${user.username} (${user.email}) (Org: ${user.organizationCode || 'Nenhuma'})`);

    // Gerar token JWT - INCLUINDO organizationCode
    const token = jwt.sign({ 
      id: user._id, 
      username: user.username, 
      email: user.email,
      organizationCode: user.organizationCode
    }, process.env.JWT_SECRET || 'secret');

    res.status(200).json({ message: 'Login bem-sucedido', token });
  } catch (error) {
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

// Middleware para verificar token (opcional para rotas protegidas futuras)
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Acesso negado' });

  jwt.verify(token, process.env.JWT_SECRET || 'secret', async (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Token inválido' });

    try {
      // Buscar o usuário no banco para verificar lastTrackedReturn
      const user = await User.findById(decoded.id);
      if (!user) return res.status(401).json({ message: 'Usuário não encontrado' });

      req.user = decoded;

      // Verificar se já foi rastreado hoje
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const lastTracked = user.lastTrackedReturn ? new Date(user.lastTrackedReturn) : null;
      const isSameDay = lastTracked && lastTracked >= today && lastTracked < new Date(today.getTime() + 24 * 60 * 60 * 1000);

      if (!isSameDay) {
        // NOVO: Rastrear "User Returned" no Mixpanel
        mixpanel.track('User Returned', {
          distinct_id: user._id.toString(),
          username: user.username,
          email: user.email,
          organizationCode: user.organizationCode || 'None',
          timestamp: new Date().toISOString()
        });

        // NOVO: Armazenar evento no MongoDB
        const eventData = {
          distinct_id: user._id.toString(),
          username: user.username,
          email: user.email,
          organizationCode: user.organizationCode || 'None',
          timestamp: new Date().toISOString()
        };
        const newEvent = new Event({
          userId: user._id,
          eventType: 'User Returned',
          properties: eventData
        });
        await newEvent.save();

        // NOVO: Atualizar propriedades de pessoas no Mixpanel
        mixpanel.people.set(user._id.toString(), {
          $last_seen: new Date().toISOString()
        });

        // NOVO: Atualizar perfil no DB
        user.lastSeen = new Date();
        user.lastTrackedReturn = new Date();
        await user.save();
      }

      next();
    } catch (error) {
      res.status(500).json({ message: 'Erro no servidor', error: error.message });
    }
  });
};

// Exemplo de rota protegida (futuro)
app.get('/api/protected', authenticateToken, (req, res) => {
  res.json({ message: 'Acesso autorizado', user: req.user });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`🏢 Isolamento por organização: ATIVADO (gradual.)`);
});