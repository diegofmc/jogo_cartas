const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

const CORES = ['Azul (Água)', 'Verde (Flora)', 'Amarelo (Energia)', 'Vermelho (Reciclagem)'];
const VALORES = ['1', '2', '3', '4', '5', 'Pular', 'Inverter', '+2', 'Descarte Irregular', 'Emissão de Carbono', 'Logística Reversa', 'Energia Renovável'];

// Gerenciamento de Salas
const rooms = {};

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function gerarBaralho() {
    let baralho = [];
    for (const cor of CORES) {
        for (const valor of VALORES) {
            baralho.push({ cor: cor, valor: valor });
            if (!['Descarte Irregular', 'Emissão de Carbono', 'Logística Reversa', 'Energia Renovável'].includes(valor)) {
                baralho.push({ cor: cor, valor: valor });
            }
        }
    }
    baralho.push({ cor: 'Verde (Flora)', valor: 'Reflorestamento' });
    baralho.push({ cor: 'Verde (Flora)', valor: 'Reflorestamento' });

    for (let i = 0; i < 4; i++) {
        baralho.push({ cor: 'Especial', valor: 'Coringa' });
        baralho.push({ cor: 'Especial', valor: '+4' });
    }
    for (let i = 0; i < 2; i++) {
        baralho.push({ cor: 'Especial', valor: 'Troca Cor Aleatória' });
        baralho.push({ cor: 'Especial', valor: 'Coringa Reciclagem' });
        baralho.push({ cor: 'Especial', valor: 'Super Seleção' });
        baralho.push({ cor: 'Especial', valor: 'Coringa Coleta Seletiva' });
        baralho.push({ cor: 'Especial', valor: 'Coringa Consumo Consciente' });
    }
    baralho.push({ cor: 'Especial', valor: 'Acordo de Paris' });

    return shuffle(baralho);
}

function avancarTurno(game, passos = 1) {
    const numPlayers = game.player_order.length;
    if (numPlayers > 0) {
        for (let i = 0; i < passos; i++) {
            game.current_turn_index = (game.current_turn_index + game.direction) % numPlayers;
            if (game.current_turn_index < 0) game.current_turn_index += numPlayers;

            let attempts = 0;
            // Pula jogadores desconectados
            while (!game.players[game.player_order[game.current_turn_index]].connected && attempts < numPlayers) {
                game.current_turn_index = (game.current_turn_index + game.direction) % numPlayers;
                if (game.current_turn_index < 0) game.current_turn_index += numPlayers;
                attempts++;
            }
        }
    }
}

function darCartas(game, playerId, quantidade) {
    for (let i = 0; i < quantidade; i++) {
        if (game.deck.length === 0) {
            if (game.pile.length > 1) {
                const ultima = game.pile.pop();
                game.deck = shuffle(game.pile);
                game.pile = [ultima];
            } else {
                break;
            }
        }
        if (game.deck.length > 0) {
            game.players[playerId].mao.push(game.deck.pop());
        }
    }
}

function enviarEstadoParaTodos(roomId) {
    const game = rooms[roomId];
    if (!game) return;

    if (!game.started || game.player_order.length === 0) {
        const jogadoresNaSala = Object.values(game.players).map(p => ({
            id: Object.keys(game.players).find(key => game.players[key] === p),
            nome: p.nome,
            connected: p.connected,
            isHost: (Object.keys(game.players).find(key => game.players[key] === p) === game.hostId)
        }));
        
        io.to(roomId).emit('estado_jogo', { 
            jogo_iniciado: false, 
            jogadores_na_sala: jogadoresNaSala,
            hostId: game.hostId
        });
        return;
    }

    const jogadorAtualId = game.player_order[game.current_turn_index];
    const infoOutrosJogadores = [];
    for (const [pid, info] of Object.entries(game.players)) {
        infoOutrosJogadores.push({
            id: pid,
            nome: info.nome,
            cartas_na_mao: info.mao.length,
            connected: info.connected,
            isHost: pid === game.hostId
        });
    }

    for (const [pid, info] of Object.entries(game.players)) {
        if (!info.connected) continue;
        const outrosJogadoresNaTela = infoOutrosJogadores.filter(p => p.id !== pid);
        const estado = {
            minha_mao: info.mao,
            carta_mesa: game.pile.length > 0 ? game.pile[game.pile.length - 1] : null,
            pilha_mesa: game.pile.slice(-5), // Envia as últimas 5 cartas para efeito visual
            cor_atual: game.current_color,
            valor_atual: game.current_value,
            eh_minha_vez: (pid === jogadorAtualId && info.connected),
            id_jogador_atual: jogadorAtualId, // Adicionado para destacar oponente
            jogadores_na_sala: infoOutrosJogadores, // Envia lista completa com IDs para UI de expulsão
            outros_jogadores: outrosJogadoresNaTela,
            jogo_iniciado: game.started,
            sentido: game.direction === 1 ? 'Horário' : 'Anti-horário',
            hostId: game.hostId
        };
        io.to(info.sid).emit('estado_jogo', estado);
    }
}

// --- Gerador de Minijogos (Matemática e Lógica) ---
function gerarDesafio() {
    const tipo = Math.random();
    if (tipo < 0.3) {
        const operacoes = ['+', '-', 'x', 'x'];
        const op = operacoes[Math.floor(Math.random() * operacoes.length)];
        let a, b, res;
        if (op === 'x') { a = Math.floor(Math.random() * 12) + 2; b = Math.floor(Math.random() * 10) + 2; res = a * b; }
        else if (op === '-') { a = Math.floor(Math.random() * 50) + 20; b = Math.floor(Math.random() * 20) + 1; res = a - b; }
        else { a = Math.floor(Math.random() * 50) + 10; b = Math.floor(Math.random() * 50) + 10; res = a + b; }
        let opcoes = new Set([res.toString()]);
        while (opcoes.size < 4) { let erro = res + (Math.floor(Math.random() * 10) - 5); if (erro !== res && erro > 0) opcoes.add(erro.toString()); }
        return { tipo: 'texto', pergunta: `Cálculo Rápido: Quanto é ${a} ${op} ${b}?`, opcoes: shuffle(Array.from(opcoes)), resposta: res.toString() };
    } else if (tipo < 0.6) {
        const cores = ['🔴', '🔵', '🟢', '🟡'];
        let sequencia = [];
        for(let i=0; i<4; i++) sequencia.push(cores[Math.floor(Math.random() * cores.length)]);
        const posIndex = Math.floor(Math.random() * 4);
        const posicoes = ['primeira', 'segunda', 'terceira', 'quarta'];
        return { tipo: 'memoria', sequencia: sequencia.join(' '), pergunta: `Qual era a ${posicoes[posIndex]} cor da sequência?`, opcoes: shuffle([...cores]), resposta: sequencia[posIndex] };
    } else {
        const perguntas = [
            { pergunta: 'Qual destes materiais leva mais tempo para se decompor?', opcoes: ['Papel', 'Vidro', 'Plástico', 'Alumínio'], resposta: 'Vidro' },
            { pergunta: 'O que é "Greenwashing"?', opcoes: ['Lavagem ecológica', 'Marketing falso de sustentabilidade', 'Limpeza de rios', 'Pintar casas de verde'], resposta: 'Marketing falso de sustentabilidade' },
            { pergunta: 'Qual a melhor forma de economizar água ao escovar os dentes?', opcoes: ['Usar água quente', 'Fechar a torneira', 'Escovar rápido', 'Usar copo descartável'], resposta: 'Fechar a torneira' },
            { pergunta: 'Charada: Sou leve como uma pena, mas nem o homem mais forte consegue me segurar por muito tempo. O que sou?', opcoes: ['O Vento', 'A Respiração', 'O Pensamento', 'A Água'], resposta: 'A Respiração' },
            { pergunta: 'Lógica: Se você recicla 1 garrafa por dia, quantas recicla em um ano bissexto?', opcoes: ['365', '360', '366', '300'], resposta: '366' },
            { pergunta: 'Quebra-cabeça: O pai de Maria tem 5 filhas: Lalá, Lelé, Lili, Loló. Qual o nome da quinta filha?', opcoes: ['Lulu', 'Maria', 'Lylá', 'Marta'], resposta: 'Maria' },
            { pergunta: 'A ação antrópica é um termo que se refere à atuação do ser humano no ambiente. Essa ação tem como resultado a:', opcoes: ['Manutenção das características naturais', 'Formação de paisagens naturais', 'Modificação do ambiente natural em larga escala', 'Alteração apenas dos aspectos físicos', 'Acumulação de materiais naturais'], resposta: 'Modificação do ambiente natural em larga escala' },
            { pergunta: 'O termo impacto ambiental negativo refere-se à:', opcoes: ['Ação do homem no espaço geográfico', 'Utilização de recursos da natureza', 'Formação de paisagens naturais', 'Manutenção dos aspectos do espaço', 'Transformação danosa do espaço natural'], resposta: 'Transformação danosa do espaço natural' },
            { pergunta: 'A Revolução Industrial aumentou a ação antrópica. Uma característica desse período foi:', opcoes: ['Aumento das emissões de poluentes atmosféricos', 'Crescimento da igualdade social', 'Utilização de fontes alternativas', 'Modificação das matrizes energéticas', 'Técnicas produtivas artesanais'], resposta: 'Aumento das emissões de poluentes atmosféricos' },
            { pergunta: 'Qual fenômeno é causado pelo lançamento de clorofluorcarbonetos (CFCs) na atmosfera?', opcoes: ['Destruição da camada de ozônio', 'Ilhas de calor', 'Inversão térmica', 'Chuvas ácidas', 'Elevação dos oceanos'], resposta: 'Destruição da camada de ozônio' },
            { pergunta: 'Qual impacto é gerado pela remoção da vegetação nativa em zonas declivosas (encostas)?', opcoes: ['Sedimentação dos vales', 'Contaminação do solo', 'Deslizamentos de terra', 'Formação de tornados', 'Intemperismo biológico'], resposta: 'Deslizamentos de terra' },
            { pergunta: 'As chuvas ácidas são comuns em qual tipo de área?', opcoes: ['Zona rural', 'Localidade pequena', 'Floresta preservada', 'Encosta sem vegetação', 'Região altamente industrializada'], resposta: 'Região altamente industrializada' },
            { pergunta: 'Qual tipo de ação antrópica é comumente registrada no Brasil?', opcoes: ['Atuação de massas polares', 'Descongelamento de geleiras', 'Abalos sísmicos', 'Ocorrência de desmatamentos', 'Aumento do nível dos rios'], resposta: 'Ocorrência de desmatamentos' },
            { pergunta: 'Um exemplo de impacto ambiental positivo da ação antrópica é:', opcoes: ['Alimentos transgênicos', 'Fontes fósseis de energia', 'Impermeabilização do solo', 'Substituição da vegetação', 'Separação adequada do lixo doméstico'], resposta: 'Separação adequada do lixo doméstico' },
            { pergunta: 'Sobre a laterização do solo, é correto afirmar:', opcoes: ['É um processo exclusivo de regiões frias', 'Não compromete a fertilidade', 'É um processo de diagênese que pode resultar de ações antrópicas', 'Impede a erosão', 'Melhora o lençol freático'], resposta: 'É um processo de diagênese que pode resultar de ações antrópicas' },
            { pergunta: 'A ação antrópica na Floresta Amazônica pode causar:', opcoes: ['Compactação e erosão laminar dos solos', 'Aumento do lençol freático', 'Aumento de chuvas', 'Menos inundações', 'Crescimento da vegetação'], resposta: 'Compactação e erosão laminar dos solos' },
            { pergunta: 'O que contribui para enchentes nas cidades pela diminuição da infiltração da água?', opcoes: ['Ilha de calor', 'Impermeabilização dos solos', 'Inversão térmica', 'Efeito estufa', 'Chuva ácida'], resposta: 'Impermeabilização dos solos' },
            { pergunta: 'A erosão do solo é um processo:', opcoes: ['Apenas artificial', 'Apenas natural', 'Causado por agentes naturais e antrópicos', 'Favorável à agricultura', 'Onde a ação natural não importa'], resposta: 'Causado por agentes naturais e antrópicos' }
        ];
        const desafio = perguntas[Math.floor(Math.random() * perguntas.length)];
        return { ...desafio, tipo: 'texto', opcoes: shuffle(desafio.opcoes) };
    }
}

function getRoomBySocketId(socketId) {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        for (const pid in room.players) {
            if (room.players[pid].sid === socketId) return room;
        }
    }
    return null;
}

function getPlayerIdBySocketId(room, socketId) {
    for (const pid in room.players) {
        if (room.players[pid].sid === socketId) return pid;
    }
    return null;
}

io.on('connection', (socket) => {
    console.log('Novo cliente:', socket.id);

    socket.on('listar_salas', () => {
        const lista = Object.values(rooms).map(r => ({
            id: r.id,
            nome: r.nome,
            jogadores: Object.keys(r.players).length,
            iniciado: r.started
        }));
        socket.emit('lista_salas', lista);
    });

    socket.on('criar_sala', (data) => {
        const roomId = uuidv4().slice(0, 6).toUpperCase();
        const nomeSala = data.nome_sala || `Mesa ${roomId}`;
        
        rooms[roomId] = {
            id: roomId,
            nome: nomeSala,
            hostId: null,
            players: {},
            deck: [],
            pile: [],
            current_turn_index: 0,
            direction: 1,
            started: false,
            current_color: null,
            current_value: null,
            player_order: [],
            minigame_context: null,
            constraint_value: null
        };
        
        socket.emit('sala_criada', { roomId: roomId });
        io.emit('atualizar_lista_salas');
    });

    socket.on('entrar_sala', (data) => {
        const { roomId, nome, player_id } = data;
        const room = rooms[roomId];
        
        if (!room) {
            socket.emit('notificacao', { msg: 'Sala não encontrada!', tipo: 'erro' });
            return;
        }
        
        socket.join(roomId);
        
        let pid = player_id;
        // Verifica se é reconexão
        if (pid && room.players[pid]) {
            room.players[pid].sid = socket.id;
            room.players[pid].connected = true;
            socket.emit('notificacao', { msg: `👋 Bem-vindo(a) de volta, ${room.players[pid].nome}!`, tipo: 'info' });
        } else {
            // Novo jogador
            if (room.started) {
                socket.emit('notificacao', { msg: 'O jogo já começou nesta sala.', tipo: 'erro' });
                socket.leave(roomId);
                return;
            }
            pid = uuidv4();
            const nomeFinal = nome || `Jogador ${Object.keys(room.players).length + 1}`;
            room.players[pid] = { nome: nomeFinal, mao: [], sid: socket.id, connected: true };
            
            // Se for o primeiro, vira host
            if (!room.hostId) room.hostId = pid;
            
            io.to(roomId).emit('notificacao', { msg: `🌱 ${nomeFinal} entrou!`, tipo: 'info' });
        }
        
        socket.emit('id_atribuido', { player_id: pid, roomId: roomId });
        enviarEstadoParaTodos(roomId);
        io.emit('atualizar_lista_salas');
    });

    socket.on('iniciar_jogo', () => {
        const room = getRoomBySocketId(socket.id);
        if (!room) return;
        
        const playerId = getPlayerIdBySocketId(room, socket.id);
        if (room.hostId !== playerId) {
            socket.emit('notificacao', { msg: 'Apenas o criador da sala pode iniciar!', tipo: 'erro' });
            return;
        }

        const connectedPlayers = Object.keys(room.players).filter(pid => room.players[pid].connected);
        if (connectedPlayers.length < 2) {
            socket.emit('notificacao', { msg: 'Mínimo 2 jogadores!', tipo: 'erro' });
            return;
        }
        
        room.started = true;
        room.deck = gerarBaralho();
        room.pile = [];
        room.player_order = shuffle([...connectedPlayers]);
        room.direction = 1;
        for (const pid of room.player_order) darCartas(room, pid, 7);
        
        let primeira = room.deck.pop();
        while (primeira.cor === 'Especial') {
            room.deck.unshift(primeira);
            primeira = room.deck.pop();
        }
        room.pile.push(primeira);
        room.current_color = primeira.cor;
        room.current_value = primeira.valor;
        room.current_turn_index = 0;
        room.minigame_context = null;
        room.constraint_value = null;
        
        io.to(room.id).emit('notificacao', { msg: '🌍 Jogo iniciado!', tipo: 'info' });
        enviarEstadoParaTodos(room.id);
        io.emit('atualizar_lista_salas');
    });

    socket.on('fechar_sala', () => {
        const room = getRoomBySocketId(socket.id);
        if (!room) return;
        const playerId = getPlayerIdBySocketId(room, socket.id);
        
        if (room.hostId === playerId) {
            io.to(room.id).emit('sala_fechada');
            io.to(room.id).emit('notificacao', { msg: 'A sala foi encerrada pelo anfitrião.', tipo: 'erro' });
            // Desconectar todos da sala
            io.in(room.id).socketsLeave(room.id);
            delete rooms[room.id];
            io.emit('atualizar_lista_salas');
        }
    });

    socket.on('expulsar_jogador', (data) => {
        const room = getRoomBySocketId(socket.id);
        if (!room) return;
        const playerId = getPlayerIdBySocketId(room, socket.id);
        
        if (room.hostId === playerId) {
            const targetId = data.targetId;
            if (targetId && room.players[targetId]) {
                const targetSocketId = room.players[targetId].sid;
                const targetSocket = io.sockets.sockets.get(targetSocketId);
                
                if (targetSocket) {
                    targetSocket.leave(room.id);
                    targetSocket.emit('voce_foi_expulso');
                }
                
                delete room.players[targetId];
                
                // Se o jogo já começou, remove da ordem
                if (room.started) {
                    room.player_order = room.player_order.filter(pid => pid !== targetId);
                    // Ajusta turno se necessário (simplificado)
                    if (room.current_turn_index >= room.player_order.length) {
                        room.current_turn_index = 0;
                    }
                }
                
                io.to(room.id).emit('notificacao', { msg: 'Um jogador foi removido da sala.', tipo: 'info' });
                enviarEstadoParaTodos(room.id);
                io.emit('atualizar_lista_salas');
            }
        }
    });

    socket.on('jogar_carta', (data) => {
        const room = getRoomBySocketId(socket.id);
        if (!room) return;
        const playerId = getPlayerIdBySocketId(room, socket.id);
        
        const jogadorAtualId = room.player_order[room.current_turn_index];
        if (playerId !== jogadorAtualId) {
            socket.emit('notificacao', { msg: 'Não é sua vez!', tipo: 'erro' });
            return;
        }

        const jogador = room.players[playerId];
        const carta = jogador.mao[data.indice];
        
        let ehCompativel = (carta.cor === room.current_color) || (carta.valor === room.current_value) || (carta.cor === 'Especial');
        
        if (room.constraint_value !== null) {
            const valorNumerico = parseInt(carta.valor);
            if (!isNaN(valorNumerico) && valorNumerico >= room.constraint_value) {
                socket.emit('notificacao', { msg: `Consumo Consciente! Você só pode jogar cartas menores que ${room.constraint_value}!`, tipo: 'erro' });
                return;
            }
            room.constraint_value = null;
        }
        
        const ALL_ACTION_CARDS = ['Pular', 'Inverter', '+2', 'Descarte Irregular', 'Emissão de Carbono', 'Logística Reversa', 'Energia Renovável', 'Reflorestamento', 'Coringa', '+4', 'Troca Cor Aleatória', 'Coringa Reciclagem', 'Super Seleção', 'Coringa Coleta Seletiva', 'Coringa Consumo Consciente', 'Acordo de Paris'];

        if (ehCompativel) {
            // Se for uma carta de ação, dispara o minijogo
            if (ALL_ACTION_CARDS.includes(carta.valor)) {
                 if (['Coringa', '+4', 'Coringa Coleta Seletiva', 'Coringa Consumo Consciente', 'Acordo de Paris'].includes(carta.valor) && !data.nova_cor) {
                     socket.emit('notificacao', { msg: 'Escolha uma cor!', tipo: 'erro' });
                     return;
                 }
                 const desafio = gerarDesafio();
                 room.minigame_context = {
                     playerId: playerId,
                     cardType: carta.valor,
                     cardIndex: data.indice,
                     novaCor: data.nova_cor
                 };
                 socket.emit('minijogo', desafio);
                 io.to(room.id).emit('notificacao', { msg: `🧠 ${jogador.nome} usou uma carta de ação! Resolva o desafio para ativar!`, tipo: 'info' });
                 return;
            }

            // --- LÓGICA PARA CARTAS NUMÉRICAS ---
            room.current_color = carta.cor;
            room.current_value = carta.valor;
            room.pile.push(jogador.mao.splice(data.indice, 1)[0]);

            if (jogador.mao.length === 0) {
                io.to(room.id).emit('mensagem_vitoria', { vencedor: jogador.nome });
                room.started = false;
                room.players = {};
                room.pile = [];
                io.emit('atualizar_lista_salas');
                return;
            }

            avancarTurno(room, 1);
            enviarEstadoParaTodos(room.id);
        } else {
            socket.emit('notificacao', { msg: 'Jogada inválida!', tipo: 'erro' });
        }
    });

    socket.on('comprar_carta', () => {
        const room = getRoomBySocketId(socket.id);
        if (!room) return;
        const playerId = getPlayerIdBySocketId(room, socket.id);
        
        const jogadorAtualId = room.player_order[room.current_turn_index];
        if (playerId !== jogadorAtualId) return;

        darCartas(room, playerId, 1);
        io.to(room.id).emit('notificacao', { msg: `📦 ${room.players[playerId].nome} comprou carta.`, tipo: 'info' });
        avancarTurno(room, 1);
        enviarEstadoParaTodos(room.id);
    });

    socket.on('resposta_minijogo', (data) => {
        const room = getRoomBySocketId(socket.id);
        if (!room) return;
        const playerId = getPlayerIdBySocketId(room, socket.id);
        
        const jogadorAtualId = room.player_order[room.current_turn_index];
        if (playerId !== jogadorAtualId) return;

        if (data.carta_escolhida) {
            room.players[playerId].mao.push(data.carta_escolhida);
            io.to(room.id).emit('notificacao', { msg: `🌟 ${room.players[playerId].nome} escolheu a melhor carta!`, tipo: 'info' });
            avancarTurno(room, 1);
            enviarEstadoParaTodos(room.id);
            return;
        }

        if (data.acertou) {
            const context = room.minigame_context;
            const numPlayers = room.player_order.length;
            let passos = 1;
            
            const cartaJogada = room.players[playerId].mao[context.cardIndex];

            // Ações que mudam a cor antes de jogar a carta na pilha
            if (['Coringa', 'Coringa Coleta Seletiva', 'Coringa Consumo Consciente', 'Acordo de Paris', '+4'].includes(context.cardType)) {
                room.current_color = context.novaCor;
            } else if (context.cardType === 'Troca Cor Aleatória') {
                const novaCor = CORES[Math.floor(Math.random() * CORES.length)];
                room.current_color = novaCor;
                io.to(room.id).emit('notificacao', { msg: `Tempestade solar! Cor: ${novaCor}`, tipo: 'info' });
            } else {
                room.current_color = cartaJogada.cor;
            }

            // Remove a carta da mão e joga na pilha
            room.pile.push(room.players[playerId].mao.splice(context.cardIndex, 1)[0]);
            room.current_value = context.cardType;
            
            // --- APLICAÇÃO DOS EFEITOS DAS CARTAS ESPECIAIS ---
            
            if (context.cardType === 'Pular') {
                passos = 2;
                io.to(room.id).emit('notificacao', { msg: '🛑 Vez pulada!', tipo: 'info' });
            } else if (context.cardType === 'Inverter') {
                room.direction *= -1;
                if (numPlayers === 2) passos = 2;
                io.to(room.id).emit('notificacao', { msg: '🔄 Sentido invertido!', tipo: 'info' });
            } else if (context.cardType === '+2') {
                passos = 2;
                let vitimaIdx = (room.current_turn_index + room.direction) % numPlayers;
                if (vitimaIdx < 0) vitimaIdx += numPlayers;
                darCartas(room, room.player_order[vitimaIdx], 2);
                io.to(room.id).emit('notificacao', { msg: '🗑️ Próximo jogador compra 2!', tipo: 'erro' });
            } else if (context.cardType === 'Descarte Irregular') {
                passos = 2;
                let vitimaIdx = (room.current_turn_index + room.direction) % numPlayers;
                if (vitimaIdx < 0) vitimaIdx += numPlayers;
                darCartas(room, room.player_order[vitimaIdx], 3);
                io.to(room.id).emit('notificacao', { msg: `🚯 Lixão! Próximo jogador compra 3.`, tipo: 'erro' });
            } else if (context.cardType === 'Emissão de Carbono') {
                for (const pid of room.player_order) {
                    if (pid !== playerId) darCartas(room, pid, 1);
                }
                io.to(room.id).emit('notificacao', { msg: `🏭 Poluição! Todos os outros compram 1.`, tipo: 'erro' });
            } else if (context.cardType === 'Logística Reversa') {
                if (room.pile.length >= 2) {
                    const cartaResgatada = room.pile.splice(room.pile.length - 2, 1)[0];
                    room.players[playerId].mao.push(cartaResgatada);
                    io.to(room.id).emit('notificacao', { msg: `♻️ Reuso! ${room.players[playerId].nome} resgatou uma carta.`, tipo: 'info' });
                }
                passos = 0; // Joga de novo
            } else if (context.cardType === 'Energia Renovável') {
                passos = 0; // Joga de novo
                let vitimaIdx = (room.current_turn_index + room.direction) % numPlayers;
                if (vitimaIdx < 0) vitimaIdx += numPlayers;
                const nomeVitima = room.players[room.player_order[vitimaIdx]].nome;
                io.to(room.id).emit('notificacao', { msg: `⚡ Turbo! ${nomeVitima} foi pulado e ${room.players[playerId].nome} joga de novo!`, tipo: 'info' });
            } else if (context.cardType === 'Reflorestamento') {
                let count = 0;
                for (const [pid, pdata] of Object.entries(room.players)) {
                    const indexVerde = pdata.mao.findIndex(c => c.cor.includes('Verde'));
                    if (indexVerde !== -1) {
                        const cVerde = pdata.mao.splice(indexVerde, 1)[0];
                        room.pile.unshift(cVerde); // Coloca no fundo
                        count++;
                    }
                }
                io.to(room.id).emit('notificacao', { msg: `🌳 Plantio! ${count} cartas verdes descartadas!`, tipo: 'info' });
            } else if (context.cardType === 'Coringa Reciclagem') {
                let targetIdx = (room.current_turn_index + room.direction) % numPlayers;
                if (targetIdx < 0) targetIdx += numPlayers;
                const targetId = room.player_order[targetIdx];
                
                const minhaMao = room.players[playerId].mao;
                const maoAlvo = room.players[targetId].mao;
                room.players[playerId].mao = maoAlvo;
                room.players[targetId].mao = minhaMao;

                io.to(room.id).emit('notificacao', { msg: `🔄 Intercâmbio! ${room.players[playerId].nome} trocou de mão com ${room.players[targetId].nome}!`, tipo: 'info' });
            } else if (context.cardType === 'Super Seleção') {
                let opcoes = [];
                for(let i=0; i<3; i++) {
                    if(room.deck.length > 0) opcoes.push(room.deck.pop());
                    else if(room.pile.length > 1) {
                         const ultima = room.pile.pop();
                         room.deck = shuffle(room.pile);
                         room.pile = [ultima];
                         if(room.deck.length > 0) opcoes.push(room.deck.pop());
                    }
                }
                socket.emit('selecionar_recompensa', { cartas: opcoes });
                return;
            } else if (context.cardType === '+4') {
                passos = 2;
                let vitimaIdx = (room.current_turn_index + room.direction) % numPlayers;
                if (vitimaIdx < 0) vitimaIdx += numPlayers;
                darCartas(room, room.player_order[vitimaIdx], 4);
                io.to(room.id).emit('notificacao', { msg: `🛢️ Desastre! Próximo compra 4 e a cor é ${context.novaCor}!`, tipo: 'erro' });
            } else if (context.cardType === 'Coringa Coleta Seletiva') {
                let punidos = [];
                for (const pid of room.player_order) {
                    if (pid === playerId) continue;
                    const temCor = room.players[pid].mao.some(c => c.cor === context.novaCor || c.cor === 'Especial');
                    if (!temCor) {
                        darCartas(room, pid, 2);
                        punidos.push(room.players[pid].nome);
                    }
                }
                if (punidos.length > 0) io.to(room.id).emit('notificacao', { msg: `🚮 Coleta Seletiva (${context.novaCor})! Punidos: ${punidos.join(', ')}`, tipo: 'erro' });
                else io.to(room.id).emit('notificacao', { msg: `✅ Todos colaboraram com a Coleta Seletiva!`, tipo: 'info' });
            } else if (context.cardType === 'Coringa Consumo Consciente') {
                room.constraint_value = 5;
                io.to(room.id).emit('notificacao', { msg: `📉 Consumo Consciente! Limite de valor 5 ativado.`, tipo: 'info' });
            } else if (context.cardType === 'Acordo de Paris') {
                const maos = room.player_order.map(pid => room.players[pid].mao);
                const ultimaMao = maos.pop();
                maos.unshift(ultimaMao);
                room.player_order.forEach((pid, index) => { room.players[pid].mao = maos[index]; });
                io.to(room.id).emit('notificacao', { msg: `🤝 Cúpula! Mãos trocadas!`, tipo: 'info' });
            }

            // Verifica Vitória após jogar a carta especial
            if (room.players[playerId].mao.length === 0) {
                io.to(room.id).emit('mensagem_vitoria', { vencedor: room.players[playerId].nome });
                room.started = false;
                room.players = {};
                room.pile = [];
                io.emit('atualizar_lista_salas');
                return;
            }
            
            room.minigame_context = null;
            avancarTurno(room, passos);
            enviarEstadoParaTodos(room.id);

        } else {
            // ERROU O MINIGAME
            // Punição: Compra 1 carta, perde a vez e NÃO joga a carta especial (ela continua na mão)
            darCartas(room, playerId, 1);
            io.to(room.id).emit('notificacao', { msg: `❌ Errou o desafio! A carta falhou e você recebeu uma punição (+1).`, tipo: 'erro' });
            
            room.minigame_context = null;
            avancarTurno(room, 1);
            enviarEstadoParaTodos(room.id);
        }
    });

    socket.on('disconnect', () => {
        const room = getRoomBySocketId(socket.id);
        if (room) {
            const playerId = getPlayerIdBySocketId(room, socket.id);
            if (playerId) {
                room.players[playerId].connected = false;
                io.to(room.id).emit('notificacao', { msg: `💨 ${room.players[playerId].nome} saiu.`, tipo: 'erro' });
                enviarEstadoParaTodos(room.id);
                
                // Se o HOST sair, fecha a sala automaticamente
                if (room.hostId === playerId) {
                    io.to(room.id).emit('sala_fechada');
                    io.to(room.id).emit('notificacao', { msg: 'O anfitrião saiu. A sala foi encerrada.', tipo: 'erro' });
                    
                    // Remove todos os sockets da sala
                    io.in(room.id).socketsLeave(room.id);
                    
                    delete rooms[room.id];
                    io.emit('atualizar_lista_salas');
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});