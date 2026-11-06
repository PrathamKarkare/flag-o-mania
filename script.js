// ===================================================================
// script.js  -  all the game logic for Flag-o-Mania
// ===================================================================
// The file is split into small sections. Each section does ONE job:
//   1. Settings          - numbers you can tweak (rounds, timer, points)
//   2. Who's playing     - remember the logged-in player on this device
//   3. Pages             - show one page, hide the others
//   4. Home + Top Scorer - the main menu
//   5. Registration      - create a new player
//   6. The game          - pick flags, check answers, count score
//   7. Results           - end of a game
//   8. Leaderboard       - top 10 table
//   9. Start-up          - what runs when the page first opens
// Saving and loading players and scores lives in storage.js.
// ===================================================================


// ------------------------------------------------------------------
// 1. SETTINGS
// ------------------------------------------------------------------
const ROUNDS_PER_GAME = 10;

// One object per difficulty. The game reads these instead of having
// "if easy ... else if hard ..." scattered everywhere. Want a new level?
// Add one more entry here.
const DIFFICULTIES = {
  easy:   { label: "Easy",   tiers: [1],       multipleChoice: true,  showHint: true,  timeLimit: 0,  pointsPerFlag: 1,
            info: "Famous flags, 4 choices, continent hint. 1 point each." },
  medium: { label: "Medium", tiers: [1, 2],    multipleChoice: false, showHint: true,  timeLimit: 0,  pointsPerFlag: 2,
            info: "More flags, type the name, continent hint. 2 points each." },
  hard:   { label: "Hard",   tiers: [1, 2, 3], multipleChoice: false, showHint: false, timeLimit: 15, pointsPerFlag: 3,
            info: "All 197 flags, no hint, 15 seconds each. 3 points each." },
};

const AVATARS = ["🦊", "🐯", "🐼", "🦁", "🐸", "🐵", "🦉", "🐙", "🚀", "⚽", "🎮", "👑"];


// ------------------------------------------------------------------
// 2. WHO IS PLAYING ON THIS DEVICE
// ------------------------------------------------------------------
// Players and scores are saved through storage.js (Firebase or this
// browser). But "who is logged in on THIS device" always stays in this
// browser's localStorage, just like a website remembering you.
function getCurrentPlayer() {
  try {
    return JSON.parse(localStorage.getItem("fom_current_player"));   // null if nobody
  } catch (error) {
    return null;
  }
}
function setCurrentPlayer(player) {
  if (player === null) {
    localStorage.removeItem("fom_current_player");
  } else {
    localStorage.setItem("fom_current_player", JSON.stringify(player));
  }
}


// ------------------------------------------------------------------
// 3. PAGES
// ------------------------------------------------------------------
// Instead of writing  style.display = "none"  for every section by hand
// (which is how the old version broke when one id was wrong), ONE
// function hides all pages and shows the one we ask for.
function showPage(pageId) {
  document.querySelectorAll(".page").forEach(function (page) {
    page.classList.remove("active");
  });
  document.getElementById(pageId).classList.add("active");
}

// Every "Back" / "Main menu" button has the class back-btn
document.querySelectorAll(".back-btn").forEach(function (btn) {
  btn.addEventListener("click", function () {
    stopTimer();
    showHome();
  });
});


// ------------------------------------------------------------------
// 4. HOME + TOP SCORER CARD
// ------------------------------------------------------------------
// showHome shows the page at once; the helper functions below are
// "async" because they wait for data from storage.js.
function showHome() {
  showPage("home_page");   // show the page straight away; fill in data as it arrives

  const player = getCurrentPlayer();
  if (player) {
    document.getElementById("no_player_box").style.display = "none";
    document.getElementById("player_box").style.display = "block";
    document.getElementById("current_player_label").textContent = player.avatar + " " + player.name;
    document.getElementById("storage_mode").textContent =
      useFirebase ? "🌍 Scores are shared online" : "💾 Scores are saved on this device only";
    showPersonalBest(player.name);
  } else {
    document.getElementById("player_box").style.display = "none";
    document.getElementById("no_player_box").style.display = "block";
    document.getElementById("login_error").textContent = "";
  }
  renderTopScorer();
}

async function showPersonalBest(name) {
  const box = document.getElementById("personal_best");
  box.textContent = "Loading your best...";
  try {
    const best = await getBestFor(name);
    box.textContent = best
      ? "Your best: " + best.points + " points (" + DIFFICULTIES[best.difficulty].label + ")"
      : "No games yet. Go get 'em!";
  } catch (error) {
    box.textContent = "";
  }
}

async function renderTopScorer() {
  const body = document.getElementById("top_scorer_body");
  body.textContent = "Loading...";
  // try / catch: if the internet is down, show a message instead of crashing
  let top;
  try {
    top = (await getTopScores("all", 1))[0];
  } catch (error) {
    body.textContent = "Couldn't load scores. Check your internet.";
    return;
  }
  if (!top) {
    body.textContent = "No scores yet. Be the first Flag Freak!";
    return;
  }
  // We build the card with textContent (not innerHTML) on purpose:
  // if someone registers a name with HTML in it, it shows as plain text
  // instead of running as code.
  body.innerHTML = "";
  const nameLine = document.createElement("div");
  nameLine.className = "top-name";
  nameLine.textContent = top.avatar + " " + top.name;
  const detail = document.createElement("div");
  detail.textContent = top.points + " points on " + DIFFICULTIES[top.difficulty].label + " · " + top.date;
  body.appendChild(nameLine);
  body.appendChild(detail);
}

async function logIn() {
  const name = document.getElementById("login_name").value.trim();
  const errorBox = document.getElementById("login_error");
  if (name === "") {
    errorBox.textContent = "Type your gamer name first.";
    return;
  }
  errorBox.textContent = "Checking...";
  try {
    const player = await findPlayer(name);
    if (player === null) {
      errorBox.textContent = "No player called " + name + ". Register first!";
      return;
    }
    setCurrentPlayer(player);
    document.getElementById("login_name").value = "";
    showHome();
  } catch (error) {
    errorBox.textContent = "Couldn't reach the server. Try again.";
  }
}

document.getElementById("login_btn").addEventListener("click", logIn);
document.getElementById("login_name").addEventListener("keydown", function (event) {
  if (event.key === "Enter") logIn();
});

document.getElementById("switch_player_btn").addEventListener("click", function () {
  setCurrentPlayer(null);
  showHome();
});

document.getElementById("go_register_btn").addEventListener("click", showRegister);
document.getElementById("go_leaderboard_btn").addEventListener("click", function () { showLeaderboard("all"); });

// The three difficulty buttons share one listener. Each button carries
// its level in a data-level="..." attribute, which we read with .dataset.level
document.querySelectorAll(".difficulty-btn").forEach(function (btn) {
  btn.addEventListener("click", function () { startGame(btn.dataset.level); });
  btn.addEventListener("mouseenter", function () {
    document.getElementById("difficulty_info").textContent = DIFFICULTIES[btn.dataset.level].info;
  });
});


// ------------------------------------------------------------------
// 5. REGISTRATION
// ------------------------------------------------------------------
let chosenAvatar = AVATARS[0];

function showRegister() {
  // Build the avatar buttons
  const box = document.getElementById("avatar_choices");
  box.innerHTML = "";
  for (const emoji of AVATARS) {
    const btn = document.createElement("button");
    btn.className = "avatar-btn" + (emoji === chosenAvatar ? " selected" : "");
    btn.textContent = emoji;
    btn.addEventListener("click", function () {
      chosenAvatar = emoji;
      showRegister();   // redraw so the highlight moves
    });
    box.appendChild(btn);
  }

  // Build the country dropdown from our flag list, sorted A to Z.
  // [...flagList] makes a COPY first, because .sort() changes the array
  // it's called on, and we don't want to scramble the real list.
  const select = document.getElementById("reg_country");
  if (select.options.length === 0) {
    const sorted = [...flagList].sort(function (a, b) { return a.country.localeCompare(b.country); });
    for (const f of sorted) {
      const option = document.createElement("option");
      option.value = f.code;
      option.textContent = f.country;
      select.appendChild(option);
    }
  }

  document.getElementById("reg_error").textContent = "";
  showPage("register_page");
}

document.getElementById("register_btn").addEventListener("click", async function () {
  const name = document.getElementById("reg_name").value.trim();   // trim() removes spaces at the ends
  const errorBox = document.getElementById("reg_error");
  const button = document.getElementById("register_btn");

  // VALIDATION: check the input is OK before saving it.
  // A "regular expression" describes a pattern of text:
  //   ^ start, [A-Za-z0-9_] a letter/number/underscore, {3,15} 3 to 15 of them, $ end
  if (!/^[A-Za-z0-9_]{3,15}$/.test(name)) {
    errorBox.textContent = "Name must be 3-15 letters, numbers or _ (no spaces).";
    return;   // "return" stops the function here, so nothing gets saved
  }

  button.disabled = true;   // stop double-clicks while we wait for the server
  errorBox.textContent = "Saving...";
  try {
    if (await findPlayer(name) !== null) {
      errorBox.textContent = "That name is taken. Try another!";
      return;
    }
    const player = {
      name: name,
      avatar: chosenAvatar,
      homeCountry: document.getElementById("reg_country").value,
      joined: new Date().toLocaleDateString(),
    };
    await createPlayer(player);
    setCurrentPlayer(player);
    document.getElementById("reg_name").value = "";
    showHome();
  } catch (error) {
    errorBox.textContent = "Couldn't save. Check your internet and try again.";
  } finally {
    button.disabled = false;   // "finally" runs whether it worked or not
  }
});


// ------------------------------------------------------------------
// 6. THE GAME
// ------------------------------------------------------------------
// "State" = the variables that describe the game RIGHT NOW.
// They live outside any function so every function can see them.
// (The old bug: nameFromInput was created with "let" INSIDE the Start
// button's function, so the winning code in another function couldn't see it.)
let level = "easy";
let roundFlags = [];     // the 10 flags for this game
let roundIndex = 0;      // which of the 10 we're on (0 = first)
let score = 0;
let correctCount = 0;
let waitingForNext = false;   // true while we show "Correct!" before the next flag
let timerId = null;
let timeLeft = 0;

// Fisher-Yates shuffle: the fair way to shuffle a list.
// Walk backwards; swap each item with a random one at or before it.
// The old game picked a random flag each time, so the same flag could
// come up twice in a row. Shuffling once and walking through the list
// guarantees no repeats.
function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];   // swap two items
  }
  return copy;
}

// Make answers easy to compare: lowercase, no accents, no punctuation,
// "st" -> "saint", "&" -> "and". So "  São Tomé & Príncipe! " matches.
function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // remove accents
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")                        // punctuation -> space
    .replace(/\bst\b/g, "saint")
    .replace(/\s+/g, " ")                               // many spaces -> one
    .trim();
}

function isCorrect(guess, flag) {
  const g = normalize(guess);
  const accepted = [flag.country].concat(flag.altNames).map(normalize);
  return accepted.includes(g);
}

function startGame(chosenLevel) {
  level = chosenLevel;
  const settings = DIFFICULTIES[level];

  // Keep only flags whose tier is allowed on this level, then shuffle and take 10
  const pool = flagList.filter(function (f) { return settings.tiers.includes(f.tier); });
  roundFlags = shuffle(pool).slice(0, ROUNDS_PER_GAME);

  roundIndex = 0;
  score = 0;
  correctCount = 0;
  document.getElementById("score_count").textContent = 0;
  document.getElementById("round_total").textContent = roundFlags.length;

  // Show the right input style for this level
  document.getElementById("choices").style.display  = settings.multipleChoice ? "grid" : "none";
  document.getElementById("type_box").style.display = settings.multipleChoice ? "none" : "flex";
  document.getElementById("timer_box").style.display = settings.timeLimit > 0 ? "inline" : "none";

  showPage("game_page");
  showFlag();
}

function showFlag() {
  const flag = roundFlags[roundIndex];
  const settings = DIFFICULTIES[level];
  waitingForNext = false;

  document.getElementById("round_count").textContent = roundIndex + 1;
  document.getElementById("flag_img").src = flag.image;
  document.getElementById("hint").textContent = settings.showHint ? "Hint: this country is in " + flag.continent : "";
  document.getElementById("feedback").textContent = "";
  document.getElementById("feedback").className = "";

  if (settings.multipleChoice) {
    buildChoices(flag);
  } else {
    const input = document.getElementById("user_guess");
    input.value = "";
    input.disabled = false;
    document.getElementById("submit").disabled = false;
    input.focus();
  }

  if (settings.timeLimit > 0) {
    startTimer(settings.timeLimit);
  }
}

// Easy mode: the right answer + 3 random wrong answers, shuffled
function buildChoices(flag) {
  const wrongOnes = shuffle(flagList.filter(function (f) { return f.code !== flag.code; })).slice(0, 3);
  const options = shuffle([flag].concat(wrongOnes));

  const box = document.getElementById("choices");
  box.innerHTML = "";
  for (const option of options) {
    const btn = document.createElement("button");
    btn.textContent = option.country;
    btn.addEventListener("click", function () { checkAnswer(option.country); });
    box.appendChild(btn);
  }
}

function checkAnswer(guess) {
  if (waitingForNext) return;   // ignore double-clicks while we're moving on
  waitingForNext = true;
  stopTimer();

  const flag = roundFlags[roundIndex];
  const feedback = document.getElementById("feedback");

  if (guess !== null && isCorrect(guess, flag)) {
    score = score + DIFFICULTIES[level].pointsPerFlag;
    correctCount = correctCount + 1;
    document.getElementById("score_count").textContent = score;
    feedback.textContent = "✅ Correct! It's " + flag.country;
    feedback.className = "right";
  } else if (guess === null) {
    feedback.textContent = "⏰ Time's up! It was " + flag.country;
    feedback.className = "wrong";
  } else {
    feedback.textContent = "❌ Nope! It was " + flag.country;
    feedback.className = "wrong";
  }

  // Lock the inputs so you can't answer the same flag twice
  document.querySelectorAll("#choices button").forEach(function (b) { b.disabled = true; });
  document.getElementById("user_guess").disabled = true;
  document.getElementById("submit").disabled = true;

  // setTimeout runs a function LATER (here: after 1.2 seconds),
  // so the player has a moment to read the feedback.
  setTimeout(nextFlag, 1200);
}

function nextFlag() {
  roundIndex = roundIndex + 1;
  if (roundIndex < roundFlags.length) {
    showFlag();
  } else {
    endGame();
  }
}

// --- Timer (Hard mode) ---
// setInterval runs a function again and again (every 1000 ms = 1 second)
// until we call clearInterval with the id it gave us.
function startTimer(seconds) {
  stopTimer();
  timeLeft = seconds;
  document.getElementById("timer_count").textContent = timeLeft;
  timerId = setInterval(function () {
    timeLeft = timeLeft - 1;
    document.getElementById("timer_count").textContent = timeLeft;
    if (timeLeft <= 0) {
      checkAnswer(null);   // null means "no answer given"
    }
  }, 1000);
}

function stopTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

document.getElementById("submit").addEventListener("click", function () {
  checkAnswer(document.getElementById("user_guess").value);
});

// Pressing Enter in the answer box = clicking the button
document.getElementById("user_guess").addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    checkAnswer(document.getElementById("user_guess").value);
  }
});

document.getElementById("quit_btn").addEventListener("click", function () {
  stopTimer();
  showHome();
});


// ------------------------------------------------------------------
// 7. RESULTS
// ------------------------------------------------------------------
async function endGame() {
  const player = getCurrentPlayer();

  document.getElementById("final_points").textContent = score;
  document.getElementById("final_detail").textContent =
    correctCount + " of " + roundFlags.length + " flags right on " + DIFFICULTIES[level].label;
  const newBest = document.getElementById("new_best");
  newBest.textContent = "Saving your score...";
  showPage("results_page");

  try {
    // Read the old records BEFORE saving, or we'd compare the score with itself
    const previousBest = await getBestFor(player.name);
    const previousTop = (await getTopScores("all", 1))[0] || null;

    await saveScore({
      name: player.name,
      avatar: player.avatar,
      points: score,
      correct: correctCount,
      difficulty: level,
      date: new Date().toLocaleDateString(),
    });

    if (score > 0 && (previousTop === null || score > previousTop.points)) {
      newBest.textContent = "🏆 NEW TOP SCORER! You Flag Freak!";
      celebrate(200);
    } else if (score > 0 && (previousBest === null || score > previousBest.points)) {
      newBest.textContent = "⭐ New personal best!";
      celebrate(100);
    } else {
      newBest.textContent = "";
    }
  } catch (error) {
    newBest.textContent = "Couldn't save your score. Check your internet.";
  }
}

// Only call confetti if the library loaded (e.g. the player is offline)
function celebrate(amount) {
  if (typeof confetti === "function") {
    confetti({ particleCount: amount, spread: 90 });
  }
}

document.getElementById("play_again_btn").addEventListener("click", function () { startGame(level); });


// ------------------------------------------------------------------
// 8. LEADERBOARD
// ------------------------------------------------------------------
async function showLeaderboard(filterLevel) {
  document.querySelectorAll(".board-tab").forEach(function (tab) {
    tab.classList.toggle("selected", tab.dataset.level === filterLevel);
  });
  const body = document.getElementById("board_body");
  showMessageRow(body, "Loading...");
  showPage("leaderboard_page");

  let top10;
  try {
    top10 = await getTopScores(filterLevel, 10);   // storage.js does the sorting
  } catch (error) {
    showMessageRow(body, "Couldn't load scores. Check your internet.");
    return;
  }

  if (top10.length === 0) {
    showMessageRow(body, "No scores yet!");
    return;
  }
  body.innerHTML = "";
  top10.forEach(function (s, i) {
    const row = body.insertRow();
    const medal = ["🥇", "🥈", "🥉"][i] || (i + 1);
    [medal, s.avatar + " " + s.name, s.points, DIFFICULTIES[s.difficulty].label, s.date].forEach(function (value) {
      row.insertCell().textContent = value;
    });
  });
}

function showMessageRow(body, message) {
  body.innerHTML = "";
  const cell = body.insertRow().insertCell();
  cell.colSpan = 5;
  cell.textContent = message;
}

document.querySelectorAll(".board-tab").forEach(function (tab) {
  tab.addEventListener("click", function () { showLeaderboard(tab.dataset.level); });
});


// ------------------------------------------------------------------
// 9. START-UP
// ------------------------------------------------------------------
showHome();
