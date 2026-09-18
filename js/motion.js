// Riconoscimento del movimento resistente ai cambi di luce.
//
// Il problema: se una nuvola passa davanti al sole, o si accende una luce,
// TUTTI i pixel cambiano insieme. Se invece passa una persona, cambia solo
// una zona. Da qui tre difese:
//
//   1. la luminosita media di ogni fotogramma viene sottratta, cosi uno
//      schiarimento uniforme sparisce prima ancora del confronto;
//   2. l immagine e divisa in celle, e se ne risultano attive quasi tutte
//      si tratta di luce, non di una persona, quindi si scarta;
//   3. il movimento deve ripetersi su piu fotogrammi di fila, cosi un
//      singolo disturbo non fa scattare nulla.

export var W = 64, H = 48;
var CELLS_X = 8, CELLS_Y = 6;
var CELL_W = W / CELLS_X, CELL_H = H / CELLS_Y;
var TOTAL_CELLS = CELLS_X * CELLS_Y;

// Sopra questa quota di celle attive si tratta di luce che cambia ovunque.
var GLOBAL_LIMIT = 0.62;

export function toGrey(data){
  var n = W * H;
  var grey = new Uint8Array(n);
  var sum = 0;
  for (var i = 0; i < n; i++) {
    var p = i * 4;
    var v = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
    grey[i] = v;
    sum += v;
  }
  grey.mean = sum / n;
  return grey;
}

// Confronta due fotogrammi e restituisce cosa e successo.
//   cells      quante celle hanno cambiato
//   share      la loro quota sul totale
//   global     vero se il cambiamento e diffuso ovunque, quindi luce
//   strength   quanto e marcato il movimento, da 0 a 100
export function compare(current, previous, pixelThreshold){
  // Sottrarre la media di ciascun fotogramma annulla lo schiarimento
  // o l oscuramento uniforme dell intera scena.
  var shift = Math.round(current.mean - previous.mean);
  var limit = pixelThreshold || 22;

  var active = 0;
  var movedPixels = 0;

  for (var cy = 0; cy < CELLS_Y; cy++) {
    for (var cx = 0; cx < CELLS_X; cx++) {
      var hits = 0;
      for (var y = 0; y < CELL_H; y++) {
        var row = (cy * CELL_H + y) * W + cx * CELL_W;
        for (var x = 0; x < CELL_W; x++) {
          var d = current[row + x] - previous[row + x] - shift;
          if (d < 0) d = -d;
          if (d > limit) hits++;
        }
      }
      // Una cella conta come mossa se almeno un quinto dei suoi pixel cambia.
      if (hits > (CELL_W * CELL_H) / 5) { active++; movedPixels += hits; }
    }
  }

  var share = active / TOTAL_CELLS;
  return {
    cells: active,
    share: share,
    global: share > GLOBAL_LIMIT,
    strength: Math.min(100, Math.round(movedPixels * 100 / (W * H)))
  };
}

// Tiene il conto dei fotogrammi consecutivi con movimento, cosi un
// disturbo isolato non fa scattare nulla.
export function Streak(needed){
  this.needed = needed || 2;
  this.count = 0;
}

Streak.prototype.feed = function(moved){
  this.count = moved ? this.count + 1 : 0;
  return this.count >= this.needed;
};

Streak.prototype.reset = function(){ this.count = 0; };
