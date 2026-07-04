require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const activeBoards = new Map();

async function findOrCacheGame(boardId) {
  const cached = activeBoards.get(boardId);
  if (cached?.gameId) {
    return cached;
  }

  const { data: activeGame, error } = await findActiveGame(boardId);
  //console.log("Game: ", activeGame);
  if (error || !activeGame) return null;

  const chess = new Chess();
  chess.loadPgn(activeGame.pgn);

  const boardState = activeBoards.get(boardId) || {};
  activeBoards.set(boardId, {
    ...boardState,
    gameId: activeGame.id,
    chess,
    lastSeen: Date.now()
  });

  return { data: activeGame, chess };
}

function boardRoom(boardId) {
  return `board:${boardId}`;
}

function getGameResult(chess) {
  if (chess.isCheckmate()) {
    return {
      status: 'ended',
      result: chess.turn() === 'b' ? 'white win' : 'black win',
      reason: 'checkmate'
    };
  }

  if (chess.isStalemate()) {
    return { status: 'ended', result: 'draw', reason: 'stalemate' };
  }

  if (chess.isThreefoldRepetition()) {
    return { status: 'ended', result: 'draw', reason: 'threefold repetition' };
  }

  if (chess.isInsufficientMaterial()) {
    return { status: 'ended', result: 'draw', reason: 'insufficient material' };
  }

  if (chess.isDraw()) {
    return { status: 'ended', result: 'draw', reason: 'draw' };
  }

  return { status: 'ongoing', result: null, reason: null };
}

async function createGame(boardId, whitePlayer = 'White', blackPlayer = 'Black') {
  if (!boardId) {
    return { ok: false, statusCode: 400, error: 'Missing board_id' };
  }

  const chess = new Chess();
  const { data: newGame, error } = await supabase
    .from('games')
    .insert([
      {
        board_id: boardId,
        white_player: whitePlayer,
        black_player: blackPlayer,
        current_fen: chess.fen(),
        pgn: chess.pgn(),
        status: 'ongoing',
        result: null
      }
    ])
    .select()
    .single();

  if (error) {
    console.error('[Supabase] Error creating game:', error.message);
    return { ok: false, statusCode: 500, error: 'Failed to create game in database' };
  }

  console.log(`[Game] New match initialized. Game ID: ${newGame.id}`);
  return { ok: true, statusCode: 201, game: newGame };
}

async function findActiveGame(boardId) {
  return supabase
    .from('games')
    .select('id, current_fen, pgn')
    .eq('board_id', boardId)
    .eq('status', 'ongoing')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
}

async function saveMoveToDatabase(gameId, newFen, newPgn, newStatus, newResult) {
  const { error } = await supabase
    .from('games')
    .update({
      current_fen: newFen,
      pgn: newPgn,
      status: newStatus,
      result: newResult
    })
    .eq('id', gameId);

  if (error) {
    console.error('[Supabase] Error saving move:', error.message);
    return false;
  }

  console.log('[Supabase] Move saved successfully.');
  return true;
}

async function applyMove(boardId, move) {
  if (!boardId || !/^([a-h][1-8][a-h][1-8]|O-O(-O)?)$/.test(move || '')) {
    return { valid: false, statusCode: 400, error: 'Invalid board_id or move format' };
  }
  const gameState = await findOrCacheGame(boardId);
  //console.log("Game: ", gameState);
  if (!gameState) {
    console.log(`[Validation] No active game found for Board: ${boardId}`);
    return { valid: false, statusCode: 200, error: 'No ongoing game for this board.' };
  }
  const chess = new Chess();
  let moveResult;
  chess.loadPgn(gameState.data.pgn);
  //console.log("Current FEN: ", chess.fen());
  if (move === 'O-O' || move === 'O-O-O') {
    moveResult = chess.move(move);
  }
  else{
    const from = move.substring(0, 2);
    const to = move.substring(2, 4);
    const piece = chess.get(from);
    const isPromotion = piece && piece.type === 'p' && (to[1] === '8' || to[1] === '1');
    moveResult = chess.move({
      from,
      to,
      promotion: isPromotion ? 'q' : undefined
    });
  }
 
  //console.log("Move result: ", moveResult);
  if (!moveResult) {
    console.log(`[Validation] Illegal move attempted: ${move}`);
    return { valid: false, statusCode: 200, error: 'Illegal move' };
  }

  const ending = getGameResult(chess);
  const newFen = chess.fen();
  const newPgn = chess.pgn();

  console.log(`[Validation] Valid Move. New FEN: ${newFen}`);

  const saved = await saveMoveToDatabase(
    gameState.data.id,
    newFen,
    newPgn,
    ending.status,
    ending.result
  );
  console.log("Saved: ", saved);
  if (!saved) {
    return { valid: false, statusCode: 500, error: 'Move valid, but database update failed' };
  }
  const boardState = activeBoards.get(boardId);
  if (boardState) {
    boardState.lastSeen = Date.now();
  }
  return {
    valid: true,
    statusCode: 200,
    move,
    result: ending.result,
    status: ending.status,
    reason: ending.reason
  };
}

app.post('/api/games/new', async (req, res) => {
  try {
    const { board_id, white_player, black_player } = req.body;
    const result = await createGame(board_id, white_player, black_player);

    if (!result.ok) {
      return res.status(result.statusCode).json({ error: result.error });
    }

    return res.status(result.statusCode).json({ game: result.game });
  } catch (err) {
    console.error('[Server] Fatal error creating game:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/move', async (req, res) => {
  try {
    const { board_id, move } = req.body;
    console.log(`[Hardware] Move attempt received: ${move}`);
    const result = await applyMove(board_id, move);
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.log(`[Validation] Move processing failed: ${error.message}`);
    return res.status(500).json({ valid: false, error: 'Move processing error' });
  }
});

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  socket.on('board_register', ({ board_id }) => {
    if (!board_id) {
      socket.emit('board_error', { action: 'board_register', error: 'Missing board_id' });
      return;
    }

    socket.data.board_id = board_id;
    socket.join(boardRoom(board_id));
    activeBoards.set(board_id, { socketId: socket.id, lastSeen: Date.now() });
    console.log(`[Socket] Board registered: ${board_id}`);
    socket.emit('board_registered', { board_id, status: 'connected' });
  });

  socket.on('heartbeat', ({ board_id }) => {
    const id = board_id || socket.data.board_id;
    if (id) {
      activeBoards.set(id, { socketId: socket.id, lastSeen: Date.now() });
    }
    socket.emit('heartbeat_ack', { board_id: id, server_time: Date.now() });
  });

  socket.on('new_game', async ({ board_id, white_player, black_player }) => {
    try {
      const id = board_id || socket.data.board_id;
      const result = await createGame(id, white_player, black_player);

      if (!result.ok) {
        socket.emit('board_error', { action: 'new_game', error: result.error });
        return;
      }

      socket.emit('game_started', { board_id: id, game: result.game });
    } catch (error) {
      console.error('[Socket] New game failed:', error);
      socket.emit('board_error', { action: 'new_game', error: 'New game failed' });
    }
  });

  socket.on('move', async ({ board_id, move }) => {
    try {
      const id = board_id || socket.data.board_id;
      console.log(`[Socket] Move from ${id}: ${move}`);
      const result = await applyMove(id, move);

      socket.emit('move_result', result);

      if (result.valid && result.status === 'ended') {
        activeBoards.delete(id);
        socket.emit('game_over', {
          board_id: id,
          result: result.result,
          reason: result.reason
        });
      }
    } catch (error) {
      console.error('[Socket] Move failed:', error);
      socket.emit('move_result', { valid: false, error: 'Move processing error' });
    }
  });

  socket.on('disconnect', () => {
    const boardId = socket.data.board_id;
    if (boardId) {
      activeBoards.delete(boardId);
      console.log(`[Socket] Board disconnected: ${boardId}`);
    } else {
      console.log(`[Socket] Disconnected: ${socket.id}`);
    }
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [boardId, board] of activeBoards.entries()) {
    if (now - board.lastSeen > 2000000) {
      console.log(`[Socket] Heartbeat stale for board ${boardId}`);
      activeBoards.delete(boardId);
    }
  }
}, 5000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Chess Hub Node Bridge running on port ${PORT}`);
  console.log('Ready to accept connections from the ESP32.');
});
