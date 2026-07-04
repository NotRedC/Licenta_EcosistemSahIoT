import { Injectable, OnDestroy, inject, signal } from '@angular/core';

interface AnalysisRequest {
  fen: string;
  requestId: number;
}

@Injectable()
export class GameEngine implements OnDestroy {
  private currentRequestedFen= '';
  private currentRequestId = 0;
  private currentTurn = 'w';
  private isEngineBusy = false;
  private nextAnalysisRequest: AnalysisRequest | null = null;
  readonly eval = signal<string>("0");
  readonly bestMove = signal<string | null>(null);
  readonly topLines = signal<{move: string, evaluation: string, sequence: string[]}[]>([]);
  readonly isAnalyzing = signal<boolean>(false);

  private engine!: Worker;

  

  constructor(){

    this.initializeEngine();
  }

  private initializeEngine(){
    console.log("Starting up...");
    try {
    this.engine = new Worker('app/utils/stockfish.js');
    
    this.engine.onmessage = (event) => {
      console.log('Stockfish Raw Output:', event.data);
    };

    this.engine.onerror = (error) => {
      console.error('Worker Error Hidden from Console:', error.message, 'at line', error.lineno, 'in', error.filename);
    };

    this.engine.postMessage('uci');

  } catch (e) {
    console.error('Creation Error:', e);
  }
  }

  analyze(fen: string) {
    this.currentRequestedFen = fen;
    this.currentRequestId++;
    this.topLines.set([]);
    this.isAnalyzing.set(true);
    console.log('Analyzing: ', this.isAnalyzing());
    console.log('Requesting analysis for FEN:', fen);
    console.log('Current request ID:', this.currentRequestId);
    this.nextAnalysisRequest = {fen, requestId: this.currentRequestId};
    this.processAnalysisQueue();
  }

  private async processAnalysisQueue() {
  if (this.isEngineBusy || !this.nextAnalysisRequest) return;

  const currentRequest = this.nextAnalysisRequest;
  this.nextAnalysisRequest = null;
  this.isEngineBusy = true;

  const { fen, requestId } = currentRequest;
  const fenParts = fen.split(' ');

  if (fenParts.length > 1) {
    this.currentTurn = fenParts[1];
  }

  try {
    this.engine.postMessage('stop');
    
    await this.runStockfishDepth(fen, 18, requestId);
    
    if (fen === this.currentRequestedFen) {
        this.isAnalyzing.set(false);
      }
  } catch (error) {
    console.error('Error during analysis:', error);
  } finally {
    this.isEngineBusy = false;
    this.processAnalysisQueue();
  }
}

  private runStockfishDepth(fen: string, depth: number, requestId: number):Promise<void> {
    return new Promise((resolve) => {
      let bestEvalStr = '';

      this.engine.postMessage(`stop`);
      this.engine.postMessage(`position fen ${fen}`);
      this.engine.postMessage('setoption name MultiPV value 3');
      this.engine.postMessage(`go depth ${depth}`);

      const dataHandler = (event: MessageEvent) => {
        const line = event.data
        //console.log('Number of lines: ', line);

          if (line.includes('info') && line.includes(' pv ')) {
            const parts = line.split(' ');
            const pvIndex = parts.indexOf('pv');
            const scoreIndex = parts.indexOf('cp');
            const mateIndex = parts.indexOf('mate');
            const multipvIndex = parts.indexOf('multipv');
            const multipv = multipvIndex !== -1 ? parseInt(parts[multipvIndex + 1], 10) : 1;
            //console.log("pvIndex: ", pvIndex + "scoreIndex: ", scoreIndex + "mateIndex: ", mateIndex + "multiPvIndex: ", multipvIndex + "multipv", multipv);
            

              if (pvIndex !== -1 && (scoreIndex !== -1 || mateIndex !== -1)) {
                let score = 0;
                let isMate = false;

                if (scoreIndex !== -1) {
                  score = parseInt(parts[scoreIndex + 1]);
                  if (this.currentTurn === 'b') score = -score;
                } else if (mateIndex !== -1) {
                    score = parseInt(parts[mateIndex + 1]);
                    //console.log('Raw mate score:', score);
                    if (this.currentTurn === 'b') score = -score;
                    isMate = true;
                    //console.log('Adjusted mate score:', score);
                    //console.log('Is mate:', isMate);
                } 

                let evalStr = '';
                if (isMate) {
                  evalStr = (score > 0 ? '+M' : '-M') + Math.abs(score);
                  //console.log('Mate evaluation string:', evalStr);
                } else {
                  const evalNum = score / 100;
                  evalStr = (evalNum > 0 ? '+' : '') + evalNum.toFixed(2);
                }
                const rawMoves = parts.slice(pvIndex + 1);
                const sequence = rawMoves
                  .map((m: string) => m.trim())
                  .filter((m:string) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))
                  .slice(0, 3); // Get top 3 moves
        
                if(sequence.length >= 1){
                  if (multipv === 1) {
                    bestEvalStr = evalStr;
                    //console.log('Updated best evaluation:', bestEvalStr);
                  }
                //console.log(`Parsed line: eval=${evalStr}, sequence=${sequence.join(' ')}`);
                
                  if (fen === this.currentRequestedFen && requestId == this.currentRequestId){ 
                    const sameFirstThree = (a: string[], b: string[]) => {
                      const len = Math.min(3, a.length, b.length);
                      return len > 0 && Array.from({ length: len }).every((_, i) => a[i] === b[i]);
                    };
                    const newLine = { move: sequence[0], evaluation: evalStr, sequence };
                    this.topLines.update(prev => [newLine, ...prev.filter(l => !sameFirstThree(l.sequence, sequence))].slice(0, 3));
                    //console.log("Top Lines: ", this.topLines);
                  }
                }
              }
            }
            if (line.includes('bestmove')) {
              const parts = line.split(' ');
              const move = parts[1]
              //console.log(`Best move line: ${line}`);
              if (fen === this.currentRequestedFen) {
                this.eval.set(bestEvalStr);
                this.bestMove.set(move);
              }
              resolve();
            }
      };
      this.engine.onmessage = dataHandler;
    });
  }

  ngOnDestroy(): void {
    if (this.engine) {
      this.engine.postMessage('terminate'); 
      this.engine.terminate();             
    }
  }
}
