// ===================================================================
// storage.js  -  every save and load in the game goes through here
// ===================================================================
// The rest of the game only calls these 5 functions:
//     findPlayer(name)          -> the player, or null
//     createPlayer(player)      -> saves a new player
//     saveScore(record)         -> saves one finished game
//     getTopScores(level, n)    -> best n scores ("all" or one level)
//     getBestFor(name)          -> that player's best score, or null
//
// Inside, each function uses Firebase (shared by everyone) if it's set up,
// or localStorage (this browser only) if it isn't. The game doesn't need to
// know which one. Hiding the "how" behind a few simple functions like this
// is called an ABSTRACTION, and it's why switching to Firebase didn't
// require rewriting the game.
//
// NEW CONCEPT: async / await
// Asking a server for data takes time (maybe half a second). An "async"
// function can "await" that answer without freezing the page. Anyone who
// calls an async function must also await it to get the result:
//     const player = await findPlayer("Pratham");
// ===================================================================

const useFirebase = typeof firebase !== "undefined" && firebaseConfig.apiKey !== "";
let db = null;
if (useFirebase) {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();   // Firestore = Firebase's database
}

// ---------- localStorage helpers (used when Firebase is off) ----------
function localLoad(key) {
  const text = localStorage.getItem(key);
  if (text === null) return [];
  try {
    return JSON.parse(text);
  } catch (error) {
    return [];
  }
}
function localSave(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}

// Sort scores highest first and keep the first n
function topN(scores, n) {
  return scores.sort(function (a, b) { return b.points - a.points; }).slice(0, n);
}

// ---------- The 5 functions the game uses ----------

async function findPlayer(name) {
  const id = name.toLowerCase();   // "Pratham" and "pratham" are the same player
  if (db) {
    const doc = await db.collection("players").doc(id).get();
    return doc.exists ? doc.data() : null;
  }
  const found = localLoad("fom_players").find(function (p) { return p.name.toLowerCase() === id; });
  return found || null;
}

async function createPlayer(player) {
  if (db) {
    // The document's id is the lowercase name, so two players can never
    // share a name. The security rules also refuse to overwrite one.
    await db.collection("players").doc(player.name.toLowerCase()).set(player);
    return;
  }
  const players = localLoad("fom_players");
  players.push(player);
  localSave("fom_players", players);
}

async function saveScore(record) {
  if (db) {
    await db.collection("scores").add(record);   // .add() picks a random id
    return;
  }
  const scores = localLoad("fom_scores");
  scores.push(record);
  localSave("fom_scores", scores);
}

async function getTopScores(level, n) {
  if (db) {
    let query = db.collection("scores");
    if (level === "all") {
      // Let the server sort and send only the top n
      query = query.orderBy("points", "desc").limit(n);
      const result = await query.get();
      return result.docs.map(function (d) { return d.data(); });
    }
    // For one level we filter on the server and sort here, which avoids
    // having to set up an extra "index" in Firebase.
    const result = await query.where("difficulty", "==", level).get();
    return topN(result.docs.map(function (d) { return d.data(); }), n);
  }
  let scores = localLoad("fom_scores");
  if (level !== "all") {
    scores = scores.filter(function (s) { return s.difficulty === level; });
  }
  return topN(scores, n);
}

async function getBestFor(name) {
  let scores;
  if (db) {
    const result = await db.collection("scores").where("name", "==", name).get();
    scores = result.docs.map(function (d) { return d.data(); });
  } else {
    scores = localLoad("fom_scores").filter(function (s) { return s.name === name; });
  }
  return topN(scores, 1)[0] || null;   // [0] = first item; undefined -> null
}
