#include <WiFi.h>
#include <string.h>
#include <SocketIOclient.h>
#include <Adafruit_NeoPixel.h>

constexpr uint8_t NUM_ROWS = 8;
constexpr uint8_t NUM_COLS = 8;
constexpr uint8_t MAX_CHANGED_SQUARES = 4;
constexpr uint8_t LED_PIN = 4;
constexpr uint8_t NUM_LEDS = 64;

// Row 0 is rank 8, row 7 is rank 1.
const uint8_t rowPins[NUM_ROWS] = { 23, 22, 21, 19, 18, 17, 14, 13 };
const uint8_t colPins[NUM_COLS] = { 32, 33, 25, 26, 27, 5, 16, 15 };

const char *BOARD_ID = "hardware-board-1";
const char *WIFI_SSID = "DIGI-3w66";
const char *WIFI_PASSWORD = "FamPetri2025";
const char *SERVER_HOST = "192.168.100.25";
const uint16_t SERVER_PORT = 3000;

Adafruit_NeoPixel strip(NUM_LEDS, LED_PIN, NEO_GRB + NEO_KHZ800);

constexpr unsigned long SETTLE_DELAY_MS = 400;
constexpr unsigned long SETUP_STABLE_DELAY_MS = 1500;
constexpr unsigned long DEBUG_INTERVAL_MS = 1000;
constexpr unsigned long WIFI_RETRY_INTERVAL_MS = 5000;
constexpr unsigned long HEARTBEAT_INTERVAL_MS = 5000;


struct CastleConfig {
  uint8_t kingFrom;
  uint8_t kingTo;
  uint8_t rookTo;
};

constexpr uint8_t squareIndex(uint8_t row, uint8_t col) {
  return row * NUM_COLS + col;
}

const CastleConfig castleLookup[] = {
  { squareIndex(7, 4), squareIndex(7, 6), squareIndex(7, 5) },
  { squareIndex(7, 4), squareIndex(7, 2), squareIndex(7, 3) },
  { squareIndex(0, 4), squareIndex(0, 6), squareIndex(0, 5) },
  { squareIndex(0, 4), squareIndex(0, 2), squareIndex(0, 3) }
};

bool currentBoard[NUM_ROWS][NUM_COLS];
bool wasLifted[NUM_ROWS][NUM_COLS];
bool wasPlaced[NUM_ROWS][NUM_COLS];
SocketIOclient socketIO;

bool moveInProgress = false;
bool gameActive = false;
bool gameCreateInProgress = false;
bool socketConnected = false;
bool debugEnabled = true;
unsigned long lastBoardChangeTime = 0;
unsigned long setupReadySince = 0;
unsigned long lastDebugTime = 0;
unsigned long lastMoveWaitLogTime = 0;
unsigned long lastWifiRetryTime = 0;
unsigned long lastHeartbeatTime = 0;

uint8_t squareRow(uint8_t square) { return square / NUM_COLS; }
uint8_t squareCol(uint8_t square) { return square % NUM_COLS; }
uint8_t lastSentFromSquare = 255;
uint8_t lastSentToSquare = 255;
bool illegalMoveActive = false;

void squareName(uint8_t square, char out[3]) {
  out[0] = 'a' + squareCol(square);
  out[1] = '8' - squareRow(square);
  out[2] = '\0';
}

uint16_t getLEDIndex(uint8_t square) {
  uint8_t row = squareRow(square);
  uint8_t col = squareCol(square);
  uint16_t columnBase = col * NUM_ROWS;
  if (col % 2 == 0) {
    return columnBase + row;
  } 
  else {
    return columnBase + ((NUM_ROWS - 1) - row);
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  for (uint8_t row = 0; row < NUM_ROWS; row++) {
    pinMode(rowPins[row], OUTPUT);
    digitalWrite(rowPins[row], HIGH);
  }

  for (uint8_t col = 0; col < NUM_COLS; col++) {
    pinMode(colPins[col], INPUT_PULLUP);
  }


  strip.begin();
  strip.setBrightness(40);
  strip.clear();
  strip.show();
  connectWifi();
  connectSocket();
  scanMatrix(false);
  Serial.println("Waiting for the standard starting position before accepting moves.");
}

void loop() {
  maintainWifi();
  socketIO.loop();
  sendHeartbeat();

  if (scanMatrix(true)) {
    lastBoardChangeTime = millis();
    setupReadySince = 0;

    if (!gameActive) {
      clearMoveBuffers();
    }
  }

  if (!gameActive) {
    waitForStartingPosition();
    printDebugMatrix();
    return;
  }

  if (moveInProgress && millis() - lastBoardChangeTime >= SETTLE_DELAY_MS) {
    if (processMove()) {
      clearMoveBuffers();
      moveInProgress = false;
    }
  }
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to WiFi");
  unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < 10000) {
    Serial.print(".");
    delay(250);
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi connected: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi not connected yet.");
  }
}

void connectSocket() {
  socketIO.begin(SERVER_HOST, SERVER_PORT, "/socket.io/?EIO=4");
  socketIO.onEvent(socketEvent);
  socketIO.setReconnectInterval(5000);
}

void socketEvent(socketIOmessageType_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case sIOtype_CONNECT:
      socketIO.send(sIOtype_CONNECT, "/");
      socketConnected = true;
      Serial.println("Socket connected.");
      sendSocketEvent("board_register", "{\"board_id\":\"hardware-board-1\"}");
      break;
    case sIOtype_DISCONNECT:
      socketConnected = false;
      gameCreateInProgress = false;
      Serial.println("Socket disconnected.");
      break;
    case sIOtype_EVENT:
      handleSocketEvent(payload, length);
      break;
    case sIOtype_ERROR:
      Serial.println("Socket error.");
      break;
    default:
      break;
  }
}

void handleSocketEvent(uint8_t *payload, size_t length) {
  String message;
  message.reserve(length);
  for (size_t i = 0; i < length; i++) {
    message += char(payload[i]);
  }

  Serial.print("Socket event: ");
  Serial.println(message);

  if (message.indexOf("\"game_started\"") >= 0) {
    gameActive = true;
    gameCreateInProgress = false;
    clearMoveBuffers();
    Serial.println("Server game created. Game input is now active.");
  } else if (message.indexOf("\"board_error\"") >= 0) {
    gameCreateInProgress = false;
    setupReadySince = millis();
  } else if(message.indexOf("\"move_result\"") >= 0 && message.indexOf("\"valid\":false") >= 0){
    gameCreateInProgress = false;
    setupReadySince = millis();
    Serial.println("Illegal Move");
    illegalMoveActive = true;
    fireIllegalMoveLeds();
  } else if (message.indexOf("\"game_over\"") >= 0) {
    gameActive = false;
    gameCreateInProgress = false;
    moveInProgress = false;
    clearMoveBuffers();
    fireGameOverLeds();
    Serial.println("Game over. Waiting for a new starting position.");
  }
}

void maintainWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  socketConnected = false;
  if (millis() - lastWifiRetryTime >= WIFI_RETRY_INTERVAL_MS) {
    lastWifiRetryTime = millis();
    WiFi.reconnect();
    Serial.println("Trying to reconnect.");
  }
}

void sendHeartbeat() {
  if (!socketConnected || millis() - lastHeartbeatTime < HEARTBEAT_INTERVAL_MS) {
    return;
  }

  lastHeartbeatTime = millis();
  sendSocketEvent("heartbeat", "{\"board_id\":\"hardware-board-1\"}");
}

bool sendSocketEvent(const char *event, const char *json) {
  if (!socketConnected) {
    return false;
  }

  String message = "[\"";
  message += event;
  message += "\",";
  message += json;
  message += "]";
  socketIO.sendEVENT(message);
  return true;
}

bool scanMatrix(bool trackChanges) {
  bool changed = false;
  bool newMove = trackChanges && gameActive && !moveInProgress;

  for (uint8_t row = 0; row < NUM_ROWS; row++) {
    digitalWrite(rowPins[row], LOW);
    delayMicroseconds(50);

    for (uint8_t col = 0; col < NUM_COLS; col++) {
      bool piecePresent = digitalRead(colPins[col]) == LOW;

      if (piecePresent != currentBoard[row][col]) {
        if (trackChanges) {
          if (newMove) {
            clearMoveBuffers();
            moveInProgress = true;
            newMove = false;
          }

          if (currentBoard[row][col] && !piecePresent) {
            wasLifted[row][col] = true;
          } else if (!currentBoard[row][col] && piecePresent) {
            wasPlaced[row][col] = true;
          }
        }

        currentBoard[row][col] = piecePresent;
        changed = true;
      }
    }

    digitalWrite(rowPins[row], HIGH);
  }

  return changed;
}

void clearMoveBuffers() {
  memset(wasLifted, 0, sizeof(wasLifted));
  memset(wasPlaced, 0, sizeof(wasPlaced));
}

bool isStartingPositionReady() {
  for (uint8_t row = 0; row < NUM_ROWS; row++) {
    for (uint8_t col = 0; col < NUM_COLS; col++) {
      bool shouldHavePiece = row <= 1 || row >= 6;
      if (currentBoard[row][col] != shouldHavePiece) {
        return false;
      }
    }
  }

  return true;
}

void waitForStartingPosition() {
  if (!isStartingPositionReady()) {
    setupReadySince = 0;
    gameCreateInProgress = false;
    return;
  }

  if (setupReadySince == 0) {
    setupReadySince = millis();
    Serial.println("Starting position detected. Waiting for it to remain stable.");
    return;
  }

  if (millis() - setupReadySince >= SETUP_STABLE_DELAY_MS && !gameCreateInProgress) {
    requestNewGame();
  }
}

void requestNewGame() {
  if (!socketConnected) {
    Serial.println("Cannot create game yet: socket disconnected.");
    setupReadySince = millis();
    return;
  }

  Serial.println("Board ready. Requesting a new server game.");
  gameCreateInProgress = sendSocketEvent("new_game", "{\"board_id\":\"hardware-board-1\"}");
  if (!gameCreateInProgress) {
    setupReadySince = millis();
  }
}

bool processMove() {
  uint8_t lifted[MAX_CHANGED_SQUARES];
  uint8_t placed[MAX_CHANGED_SQUARES];
  uint8_t liftedCount = collectSquares(wasLifted, false, lifted);
  uint8_t placedCount = collectSquares(wasPlaced, true, placed);

  if (illegalMoveActive) {
    uint8_t fromRow = squareRow(lastSentFromSquare);
    uint8_t fromCol = squareCol(lastSentFromSquare);
    uint8_t toRow = squareRow(lastSentToSquare);
    uint8_t toCol = squareCol(lastSentToSquare);

    if (currentBoard[fromRow][fromCol] == true && currentBoard[toRow][toCol] == false) {
      Serial.println("Piece returned to original square");
      clearLeds();
      illegalMoveActive = false;
      return true;
    }
  }

  if (liftedCount == 0 && placedCount == 1) {
    Serial.println("Move canceled: piece returned to its original square.");
    return true;
  }

  if (liftedCount == 0 || placedCount == 0) {
    if (millis() - lastMoveWaitLogTime >= DEBUG_INTERVAL_MS) {
      lastMoveWaitLogTime = millis();
      Serial.print("Waiting for complete move. Lifted=");
      Serial.print(liftedCount);
      Serial.print(" Placed=");
      Serial.println(placedCount);
    }
    return false;
  }

  printChangedSquares("Lifted", lifted, liftedCount);
  printChangedSquares("Placed", placed, placedCount);

  uint8_t fromSquare = 255;
  uint8_t toSquare = 255;
  bool isCastling = false;
  bool isQueenside = false;

  if (liftedCount == 1 && placedCount == 1) {
    fromSquare = lifted[0];
    toSquare = placed[0];
  } else if (liftedCount == 2 && placedCount == 1) {
    toSquare = placed[0];
    fromSquare = chooseFromSquareForCapture(lifted, toSquare);
  } else if (liftedCount == 2 && placedCount == 2) {
    if (!detectCastling(lifted, placed, fromSquare, toSquare, isQueenside)) {
      Serial.println("Invalid two-piece move; expected castling pattern.");
      return true;
    }
    isCastling = true;
  } else {
    Serial.println("Ignored unstable or unsupported board change.");
    return true;
  }

  if (isCastling){
    const char *castle = isQueenside ? "O-O-O" : "O-O";
    Serial.print("Castling detected: ");
    Serial.println(castle);

    lastSentFromSquare = fromSquare;
    lastSentToSquare = toSquare;
    return sendMove(castle);
  }

  if (fromSquare == 255 || toSquare == 255) {
    Serial.println("Could not infer move.");
    return true;
  }

  char fromName[3];
  char toName[3];
  squareName(fromSquare, fromName);
  squareName(toSquare, toName);

  char move[5];
  snprintf(move, sizeof(move), "%s%s", fromName, toName);

  Serial.print("Move: ");
  Serial.println(move);

  lastSentFromSquare = fromSquare;
  lastSentToSquare = toSquare;
  return sendMove(move);
}

uint8_t collectSquares(bool changed[NUM_ROWS][NUM_COLS], bool expectedCurrentState, uint8_t output[MAX_CHANGED_SQUARES]) {
  uint8_t count = 0;

  for (uint8_t row = 0; row < NUM_ROWS; row++) {
    for (uint8_t col = 0; col < NUM_COLS; col++) {
      if (changed[row][col] && currentBoard[row][col] == expectedCurrentState) {
        if (count < MAX_CHANGED_SQUARES) {
          output[count] = squareIndex(row, col);
        }
        count++;
      }
    }
  }

  return count;
}

uint8_t chooseFromSquareForCapture(const uint8_t lifted[2], uint8_t toSquare) {
  if (lifted[0] == toSquare) return lifted[1];
  if (lifted[1] == toSquare) return lifted[0];
  return lifted[0];
}

bool detectCastling(const uint8_t lifted[2], const uint8_t placed[2], uint8_t &fromSquare, uint8_t &toSquare, bool &isQueenside) {
  uint8_t index = 0;
  for (const CastleConfig &castle : castleLookup) {
    bool kingLifted = lifted[0] == castle.kingFrom || lifted[1] == castle.kingFrom;
    bool kingPlaced = placed[0] == castle.kingTo || placed[1] == castle.kingTo;
    bool rookPlaced = placed[0] == castle.rookTo || placed[1] == castle.rookTo;

    if (kingLifted && kingPlaced && rookPlaced && currentBoard[squareRow(castle.rookTo)][squareCol(castle.rookTo)]) {
      fromSquare = castle.kingFrom;
      toSquare = castle.kingTo;
      isQueenside = (index == 1 || index == 3);
      return true;
    }
    index++;
  }

  return false;
}

bool sendMove(const char *move) {
  char payload[96];
  snprintf(payload, sizeof(payload), "{\"board_id\":\"%s\",\"move\":\"%s\"}", BOARD_ID, move);

  if (!sendSocketEvent("move", payload)) {
    Serial.println("Move not sent: socket disconnected. Keeping buffers.");
    return false;
  }

  return true;
}

void fireGameOverLeds() {
  for (uint8_t flash = 0; flash < 3; flash++) {
    for (uint8_t square = 0; square < 64; square++) {
        strip.setPixelColor(getLEDIndex(square), strip.Color(0, 255, 0)); // Pure GREEN
      }
      strip.show();
    delay(450); 

    clearLeds();
    delay(300);
  }
}

void fireIllegalMoveLeds() {
  if (lastSentFromSquare == 255 || lastSentToSquare == 255) return;

  uint16_t ledFrom = getLEDIndex(lastSentFromSquare);
  uint16_t ledTo = getLEDIndex(lastSentToSquare);
  strip.setPixelColor(ledFrom, strip.Color(255, 0, 0));
  strip.setPixelColor(ledTo, strip.Color(255, 0, 0));
  strip.show();
    
}

void clearLeds(){
  strip.clear();
  strip.show();
}

void printChangedSquares(const char *label, const uint8_t squares[MAX_CHANGED_SQUARES], uint8_t count) {
  Serial.print(label);
  Serial.print(": ");

  for (uint8_t i = 0; i < count && i < MAX_CHANGED_SQUARES; i++) {
    char name[3];
    squareName(squares[i], name);
    Serial.print(name);
    Serial.print(" ");
  }

  if (count > MAX_CHANGED_SQUARES) {
    Serial.print("(overflow) ");
  }

  Serial.println();
}

void printMatrix() {
  for (uint8_t row = 0; row < NUM_ROWS; row++) {
    for (uint8_t col = 0; col < NUM_COLS; col++) {
      Serial.print(currentBoard[row][col] ? "1 " : ". ");
      uint8_t square = squareIndex(row, col);
      uint16_t ledIdx = getLEDIndex(square);
      bool isStartingRow = (row <= 1 || row >= 6);
      if (isStartingRow && !currentBoard[row][col]) {
            strip.setPixelColor(ledIdx, strip.Color(255, 0, 0));
          } else {
            strip.setPixelColor(ledIdx, strip.Color(0, 0, 0));
          }
    }
    Serial.println();
  }
  strip.show();
  Serial.println("-------------");
}

void printDebugMatrix() {
  if (debugEnabled && millis() - lastDebugTime >= DEBUG_INTERVAL_MS) {
    lastDebugTime = millis();
    printMatrix();
  }
}

