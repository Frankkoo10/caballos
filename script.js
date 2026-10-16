const supabaseUrl = 'https://wgqqbahoalozgfukioza.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndncXFiYWhvYWxvemdmdWtpb3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNTA3OTYsImV4cCI6MjA5OTgyNjc5Nn0.v_kpYceS8ceIUBNaLLHjfyBeFA2Y3lDRy7Yn6cb5Uz8';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

const STORAGE_KEY = 'derby_bet_state';

let currentUser = null;
let saldo = 0;
let displayUsername = "Jugador" + Math.floor(Math.random() * 9999);
let derbyChannel = null;

const horsesConfig = [
    { id: 0, name: "Relámpago", color: "#ff4d4d", colorName: "Rojo" },
    { id: 1, name: "Tormenta",  color: "#4da6ff", colorName: "Azul" },
    { id: 2, name: "Viento",    color: "#2ecc71", colorName: "Verde" },
    { id: 3, name: "Doradillo", color: "#ffd100", colorName: "Oro" },
    { id: 4, name: "Sombra",    color: "#9d4edd", colorName: "Púrpura" }
];

let horses = [];
let currentBets = [0, 0, 0, 0, 0];
let confirmedBets = [0, 0, 0, 0, 0];
let selectedChip = 100;

const GLOBAL_EPOCH = 1700000000000;
const WAIT_TIME_MS = 15000;
const RACE_TIME_MS = 12000;
const FINISH_DELAY_MS = 5000;
const TOTAL_DURATION = WAIT_TIME_MS + RACE_TIME_MS + FINISH_DELAY_MS;

let estadoActual = '';
let currentRoundId = -1;
let currentRoundStart = 0;
let currentRoundData = null;
let historyLog = [];

async function verificarSesionYJugar() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            currentUser = { id: 'usuario_prueba_local' };
            saldo = 5000;
        } else {
            currentUser = session.user;
            if (currentUser.email) displayUsername = currentUser.email.split('@')[0];

            const { data: perfilData } = await supabaseClient
                .from('perfiles').select('saldo').eq('id', currentUser.id).single();

            if (perfilData) {
                saldo = parseFloat(perfilData.saldo);
            } else {
                saldo = 10000;
                await guardarSaldoEnBD();
            }
        }

        actualizarUIBalance();
        iniciarConexionMultijugador();
        sincronizarRelojGlobal();

    } catch (e) {
        console.error("Error BD:", e);
        document.getElementById("status-msg").innerText = "Modo Local Activo";
        saldo = 5000;
        actualizarUIBalance();
        sincronizarRelojGlobal();
    }
}

async function guardarSaldoEnBD() {
    if (!currentUser || currentUser.id === 'usuario_prueba_local') return;
    await supabaseClient.from('perfiles').upsert({ id: currentUser.id, saldo: saldo });
}

function actualizarUIBalance() {
    document.getElementById("balance-amount").innerText = saldo.toFixed(2);
    renderBetBadges();
}

window.onload = verificarSesionYJugar;

function iniciarConexionMultijugador() {
    const presenceKey = (currentUser.id === 'usuario_prueba_local') ? 'guest_' + Math.random() : currentUser.id;
    derbyChannel = supabaseClient.channel('derby_room', { config: { presence: { key: presenceKey } } });

    derbyChannel.on('presence', { event: 'sync' }, () => {
        document.getElementById('online-count-value').innerText = Object.keys(derbyChannel.presenceState()).length;
    });

    derbyChannel.on('broadcast', { event: 'chat_message' }, (payload) => {
        mostrarMensajeEnChat(payload.payload.user, payload.payload.text);
    });

    derbyChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await derbyChannel.track({ online_at: new Date(), username: displayUsername });
    });
}

function toggleChat() {
    const popup = document.getElementById("chat-popup");
    popup.style.display = popup.style.display === "flex" ? "none" : "flex";
    if (popup.style.display === "flex") {
        document.getElementById("chat-messages").scrollTop = 9999;
        document.getElementById("chat-input").focus();
    }
}
function manejarEnterChat(e) { if (e.key === 'Enter') enviarMensajeChat(); }
function enviarMensajeChat() {
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;
    mostrarMensajeEnChat(displayUsername, text);
    if (derbyChannel) derbyChannel.send({ type: 'broadcast', event: 'chat_message', payload: { user: displayUsername, text: text } });
    input.value = "";
}
function mostrarMensajeEnChat(user, text) {
    const cont = document.getElementById("chat-messages");
    cont.innerHTML += `<div class="chat-msg"><span class="user">${user}:</span><span> ${text}</span></div>`;
    cont.scrollTop = cont.scrollHeight;
}
function toggleInfo() {
    const m = document.getElementById("info-modal");
    m.style.display = m.style.display === "flex" ? "none" : "flex";
}

function mulberry32(a) {
    return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

function obtenerDatosDeRonda(roundId) {
    let rng = mulberry32(roundId);
    rng(); rng();

    let rawWeights = horsesConfig.map(() => Math.floor(rng() * 60) + 10);
    let totalWeight = rawWeights.reduce((a, b) => a + b, 0);

    let roundHorses = horsesConfig.map((h, i) => {
        let prob = rawWeights[i] / totalWeight;
        let payout = Math.max(1.10, (1 / prob) * 0.90);
        return { ...h, prob: prob, payout: payout.toFixed(2) };
    });

    let random = rng();
    let cumulative = 0;
    let winnerId = 0;
    for (let i = 0; i < roundHorses.length; i++) {
        cumulative += roundHorses[i].prob;
        if (random <= cumulative) { winnerId = roundHorses[i].id; break; }
    }

    return { horses: roundHorses, winnerId };
}

function sincronizarRelojGlobal() {
    let nowMs = Date.now();
    currentRoundId = 1;
    currentRoundStart = GLOBAL_EPOCH;

    while (true) {
        if (currentRoundStart + TOTAL_DURATION > nowMs) break;
        currentRoundStart += TOTAL_DURATION;
        currentRoundId++;
    }

    try {
        let saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved && saved.roundId === currentRoundId) {
            confirmedBets = saved.bets;
        } else {
            localStorage.removeItem(STORAGE_KEY);
            confirmedBets = [0,0,0,0,0];
        }
    } catch(e) {}

    currentRoundData = obtenerDatosDeRonda(currentRoundId);
    generarHistorial(currentRoundId);
    renderTrack();
    renderOddsTable();
    requestAnimationFrame(loopGlobalJuego);
}

function generarHistorial(actual) {
    historyLog = [];
    const barra = document.getElementById("history-bar");
    barra.innerHTML = "";

    for (let i = 15; i >= 1; i--) {
        let pastId = actual - i;
        if (pastId < 1) continue;
        let data = obtenerDatosDeRonda(pastId);
        let winHorse = data.horses.find(h => h.id === data.winnerId);
        historyLog.push(winHorse);

        const item = document.createElement("span");
        item.classList.add("history-item");
        item.style.backgroundColor = winHorse.color;
        item.innerText = `${winHorse.id + 1}`;
        barra.appendChild(item);
    }
}

function loopGlobalJuego() {
    let nowMs = Date.now();
    let elapsed = nowMs - currentRoundStart;

    if (elapsed >= TOTAL_DURATION) {
        currentRoundStart += TOTAL_DURATION;
        currentRoundId++;
        currentRoundData = obtenerDatosDeRonda(currentRoundId);

        currentBets = [0,0,0,0,0];
        confirmedBets = [0,0,0,0,0];
        localStorage.removeItem(STORAGE_KEY);
        estadoActual = '';

        generarHistorial(currentRoundId);
        renderOddsTable();
        elapsed = 0;
    }

    if (elapsed < WAIT_TIME_MS) {
        if (estadoActual !== 'WAITING') transitionToWaiting();
        let secs = Math.ceil((WAIT_TIME_MS - elapsed) / 1000);

        let msg = `Siguiente carrera en ${secs}s.`;
        if (confirmedBets.reduce((a,b)=>a+b,0) > 0) msg += " [Apuestas Confirmadas]";
        document.getElementById("status-msg").innerText = msg;

    } else if (elapsed < WAIT_TIME_MS + RACE_TIME_MS) {
        if (estadoActual !== 'RACING') transitionToRacing();

        let progress = (elapsed - WAIT_TIME_MS) / RACE_TIME_MS;
        animarCarrera(progress);

    } else {
        if (estadoActual !== 'FINISHED') transitionToFinished();
    }

    requestAnimationFrame(loopGlobalJuego);
}

function animarCarrera(progress) {
    currentRoundData.horses.forEach(h => {
        let seed = currentRoundId + h.id;
        let rng = mulberry32(seed);

        let pos = 0;

        if (h.id === currentRoundData.winnerId) {

            pos = progress - Math.sin(progress * Math.PI) * 0.15;
        } else {

            let finalTarget = 0.75 + rng() * 0.15;
            let ruido = Math.sin(progress * Math.PI * 1.5) * 0.1 * (rng() * 2 - 1);
            pos = (progress * finalTarget) + ruido;
        }

        if (typeof h.maxPos === 'undefined' || progress === 0) h.maxPos = 0;

        if (pos > h.maxPos) {
            h.maxPos = pos;
        } else {
            pos = h.maxPos;
        }

        let visualPos = Math.max(0, pos) * 85;
        document.getElementById(`horse-${h.id}`).style.bottom = `${visualPos}%`;
    });
}

function transitionToWaiting() {
    estadoActual = 'WAITING';
    document.getElementById("status-msg").style.color = "var(--muted)";
    document.getElementById("chips-container").classList.remove("disabled");

    let btnApostar = document.getElementById("btn-apostar");
    let btnClear = document.getElementById("btn-clear");

    let totalConfirmado = confirmedBets.reduce((a,b)=>a+b,0);

    if (totalConfirmado > 0) {
        btnApostar.innerText = "Apuesta Confirmada";
        btnApostar.disabled = true;
        btnClear.innerText = "Cancelar";
        btnClear.disabled = false;
    } else {
        btnApostar.innerText = "Confirmar Apuestas";
        btnApostar.disabled = false;
        btnClear.innerText = "Limpiar";
        btnClear.disabled = false;
    }

    horses.forEach(h => {
        let el = document.getElementById(`horse-${h.id}`);
        if(el) el.style.bottom = "2%";
    });
}

function transitionToRacing() {
    estadoActual = 'RACING';
    document.getElementById("status-msg").innerText = "¡La carrera ha comenzado!";
    document.getElementById("chips-container").classList.add("disabled");

    document.getElementById("btn-apostar").disabled = true;
    document.getElementById("btn-clear").disabled = true;
}

async function transitionToFinished() {
    estadoActual = 'FINISHED';

    currentRoundData.horses.forEach(h => {
        let finalPos = (h.id === currentRoundData.winnerId) ? 85 : 75 + Math.random()*8;
        document.getElementById(`horse-${h.id}`).style.bottom = `${finalPos}%`;
    });

    let winner = currentRoundData.horses.find(h => h.id === currentRoundData.winnerId);
    let msg = document.getElementById("status-msg");

    let apostadoAlGanador = confirmedBets[winner.id];
    let apostadoTotal = confirmedBets.reduce((a,b)=>a+b,0);

    if (apostadoTotal > 0) {
        if (apostadoAlGanador > 0) {
            let ganancia = Math.floor(apostadoAlGanador * parseFloat(winner.payout));
            saldo += ganancia;
            msg.style.color = "var(--success)";

            msg.innerHTML = `<img src="copa.png" alt="Trofeo" class="emoji-img"> ¡Ganó ${winner.name}! Cobras $${ganancia}.`;
        } else {
            msg.style.color = "var(--danger)";
            msg.innerText = `Ganó ${winner.name}. Perdiste $${apostadoTotal}.`;
        }
        await guardarSaldoEnBD();
        actualizarUIBalance();
    } else {
        msg.style.color = "var(--accent)";

        msg.innerHTML = `<img src="bandera.png" alt="Meta" class="emoji-img"> El ganador es ${winner.name}. (Modo Espectador)`;
    }
}

function renderTrack() {
    const track = document.getElementById("track");
    track.innerHTML = '<div class="finish-line"></div>';

    currentRoundData.horses.forEach((h) => {
        track.innerHTML += `
            <div class="lane">
                <div class="horse-sprite" id="horse-${h.id}">
                    <img src="caballo.png" class="horse-img" alt="Caballo">
                    <span class="horse-number" style="background:${h.color};">${h.id + 1}</span>
                </div>
            </div>`;
    });
}

function renderOddsTable() {
    const tbody = document.getElementById("odds-body");
    tbody.innerHTML = "";

    currentRoundData.horses.forEach((h) => {
        let prob = Math.round(h.prob * 100);
        tbody.innerHTML += `
            <tr class="horse-row" onclick="addBet(${h.id})">
                <td style="text-align: left; font-weight:bold; color:#fff;">
                    <span class="color-box" style="background-color: ${h.color};"></span>
                    ${h.name}
                </td>
                <td>${prob}%</td>
                <td style="color: var(--accent); font-weight: bold;">${h.payout}x</td>
                <td><span class="bet-badge" id="badge-${h.id}">$0</span></td>
            </tr>`;
    });
    renderBetBadges();
}

function selectChip(val) {
    if (estadoActual !== 'WAITING') return;
    selectedChip = val;
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    document.getElementById(`chip-${val}`).classList.add("active");
}

function addBet(horseId) {
    if (estadoActual !== 'WAITING') return;
    let totalPreparado = currentBets.reduce((a,b)=>a+b,0) + confirmedBets.reduce((a,b)=>a+b,0);

    if (saldo - totalPreparado < selectedChip) {
        alert("Créditos insuficientes."); return;
    }

    currentBets[horseId] += selectedChip;
    renderBetBadges();
}

async function limpiarApuestas() {
    if (estadoActual !== 'WAITING') return;

    let totalConfirmado = confirmedBets.reduce((a,b)=>a+b,0);

    if (totalConfirmado > 0) {

        saldo += totalConfirmado;
        confirmedBets = [0,0,0,0,0];
        currentBets = [0,0,0,0,0];
        localStorage.removeItem(STORAGE_KEY);
        await guardarSaldoEnBD();

        let btnApostar = document.getElementById("btn-apostar");
        btnApostar.disabled = false;
        btnApostar.innerText = "Confirmar Apuestas";

        document.getElementById("btn-clear").innerText = "Limpiar";
    } else {

        currentBets = [0,0,0,0,0];
    }

    actualizarUIBalance();
}

async function registrarApuesta() {
    let totalNuevo = currentBets.reduce((a,b)=>a+b,0);
    if (totalNuevo === 0) return;

    for(let i=0; i<5; i++) confirmedBets[i] += currentBets[i];
    currentBets = [0,0,0,0,0];

    saldo -= totalNuevo;
    actualizarUIBalance();

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ roundId: currentRoundId, bets: confirmedBets }));
    await guardarSaldoEnBD();

    let btnApostar = document.getElementById("btn-apostar");
    btnApostar.innerText = "Apuesta Confirmada";
    btnApostar.disabled = true;

    document.getElementById("btn-clear").innerText = "Cancelar";
}

function renderBetBadges() {
    for(let i=0; i<5; i++) {
        const badge = document.getElementById(`badge-${i}`);
        if(!badge) continue;
        let total = currentBets[i] + confirmedBets[i];
        badge.innerText = total > 0 ? `$${total}` : "$0";
        if(total > 0) badge.classList.add("has-bet");
        else badge.classList.remove("has-bet");
    }
}
