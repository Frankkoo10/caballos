// Configuración de los 5 Caballos
const horsesConfig = [
    { id: 0, name: "Relámpago", color: "#ff4d4d", colorName: "Rojo" },
    { id: 1, name: "Tormenta",  color: "#4da6ff", colorName: "Azul" },
    { id: 2, name: "Viento",    color: "#2ecc71", colorName: "Verde" },
    { id: 3, name: "Doradillo", color: "#f1c40f", colorName: "Amarillo" },
    { id: 4, name: "Sombra",    color: "#9b59b6", colorName: "Morado" }
];

let horses = [];
let balance = 10000;
let currentBets = [0, 0, 0, 0, 0]; // Dinero apostado en cada caballo
let selectedChip = 100; // Valor de la ficha seleccionada
let isRacing = false;
const houseEdge = 0.10; // 10% de ventaja para el casino

// Inicializar nueva ronda
function newRound() {
    isRacing = false;
    currentBets = [0, 0, 0, 0, 0];
    
    document.getElementById("status-msg").style.color = "#fff";
    document.getElementById("status-msg").innerText = "Siguiente ronda: Elige tus fichas y colócalas en los caballos.";
    
    // Generar pesos aleatorios para las probabilidades
    let rawWeights = horsesConfig.map(() => Math.floor(Math.random() * 60) + 10);
    let totalWeight = rawWeights.reduce((a, b) => a + b, 0);

    horses = horsesConfig.map((h, index) => {
        let prob = (rawWeights[index] / totalWeight);
        let payout = (1 / prob) * (1 - houseEdge);
        if (payout < 1.05) payout = 1.05; 

        return {
            ...h,
            prob: prob,
            probPercent: Math.round(prob * 100),
            payout: payout.toFixed(2),
            position: 10 // Posición inicial en el eje Y (bottom)
        };
    });

    renderOddsTable();
    renderTrack();
    updateBetBadges();
    
    document.getElementById("race-btn").disabled = false;
    document.getElementById("clear-btn").disabled = false;
    document.getElementById("chips-container").classList.remove("disabled");
}

// Mostrar tabla de apuestas
function renderOddsTable() {
    const tbody = document.getElementById("odds-body");
    tbody.innerHTML = "";
    
    horses.forEach((h) => {
        let tr = document.createElement("tr");
        tr.className = "horse-row";
        tr.onclick = () => addBet(h.id);
        
        tr.innerHTML = `
            <td style="text-align: left;">
                <span class="color-box" style="background-color: ${h.color};"></span>
                <strong>${h.name}</strong> <br><small>(${h.colorName})</small>
            </td>
            <td>${h.probPercent}%</td>
            <td style="color: var(--accent-gold); font-weight: bold;">${h.payout}x</td>
            <td><span class="bet-badge" id="bet-badge-${h.id}">$0</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// Dibuja la pista vertical y coloca los caballos abajo
function renderTrack() {
    const track = document.getElementById("track");
    track.innerHTML = '<div class="finish-line"></div>';

    horses.forEach((h) => {
        let lane = document.createElement("div");
        lane.className = "lane";
        lane.innerHTML = `
            <div class="horse-sprite" id="horse-${h.id}" style="bottom: 10px;">
                <span class="horse-number" style="background:${h.color};">${h.id + 1}</span>
                <span class="horse-emoji">🐎</span>
            </div>
        `;
        track.appendChild(lane);
    });
}

// Seleccionar el valor de la ficha
function selectChip(value) {
    if (isRacing) return;
    selectedChip = value;
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    document.getElementById(`chip-${value}`).classList.add("active");
}

// Añadir apuesta al hacer clic
function addBet(horseId) {
    if (isRacing) return;

    if (balance < selectedChip) {
        alert("¡No tienes suficientes créditos para colocar esta ficha!");
        return;
    }

    balance -= selectedChip;
    currentBets[horseId] += selectedChip;
    
    updateBalance();
    updateBetBadges();
    
    document.getElementById("status-msg").innerText = `Añadiste $${selectedChip} a ${horses[horseId].name}.`;
}

// Limpiar todas las apuestas
function clearBets() {
    if (isRacing) return;
    
    let refundAmount = currentBets.reduce((a, b) => a + b, 0);
    balance += refundAmount;
    currentBets = [0, 0, 0, 0, 0];
    
    updateBalance();
    updateBetBadges();
    
    document.getElementById("status-msg").innerText = "Apuestas retiradas.";
}

// Actualizar badges
function updateBetBadges() {
    horsesConfig.forEach((h) => {
        const badge = document.getElementById(`bet-badge-${h.id}`);
        if (!badge) return;
        
        let bet = currentBets[h.id];
        badge.innerText = bet > 0 ? `$${bet}` : "$0";
        
        if (bet > 0) {
            badge.classList.add("has-bet");
        } else {
            badge.classList.remove("has-bet");
        }
    });
}

// Determinar ganador ponderado
function getWeightedWinner() {
    let random = Math.random();
    let cumulative = 0;
    for (let i = 0; i < horses.length; i++) {
        cumulative += horses[i].prob;
        if (random <= cumulative) {
            return horses[i].id;
        }
    }
    return horses[0].id; 
}

// Iniciar carrera vertical (Goma elástica hacia arriba)
function startRace() {
    let totalBet = currentBets.reduce((a, b) => a + b, 0);
    
    if (totalBet === 0) {
        alert("¡Debes colocar al menos una ficha para iniciar la carrera!");
        return;
    }

    isRacing = true;
    document.getElementById("race-btn").disabled = true;
    document.getElementById("clear-btn").disabled = true;
    document.getElementById("chips-container").classList.add("disabled");
    document.getElementById("status-msg").innerText = "¡La carrera ha comenzado!";

    let winnerId = getWeightedWinner();
    
    // Calculamos el límite vertical basándonos en la altura del contenedor dinámicamente
    const trackHeight = document.getElementById("track").clientHeight - 90; 
    let raceFinished = false;

    let raceInterval = setInterval(() => {
        if (raceFinished) return;

        let maxPosition = Math.max(...horses.map(h => h.position));

        horses.forEach((h) => {
            if (raceFinished) return;

            // Físicas parejas
            let speed = Math.random() * 2.2 + 1.8;

            if (maxPosition - h.position > 50) {
                speed += 1.5; 
            }

            // Sprint final del ganador
            if (h.id === winnerId) {
                speed += 0.3;
                if (h.position > trackHeight * 0.75) {
                    speed += 1.2; 
                }
            } else {
                // Evitar adelantamientos al final
                let winnerHorse = horses.find(hor => hor.id === winnerId);
                if (h.position > trackHeight * 0.88 && h.position >= winnerHorse.position - 8) {
                    speed *= 0.35; 
                }
            }

            h.position += speed;
            document.getElementById(`horse-${h.id}`).style.bottom = `${h.position}px`;

            if (h.id === winnerId && h.position >= trackHeight) {
                raceFinished = true;
                clearInterval(raceInterval);
                finishRace(winnerId);
            }
        });
    }, 30);
}

// Finalizar la ronda
function finishRace(winnerId) {
    let winnerHorse = horses[winnerId];
    let msgEl = document.getElementById("status-msg");
    
    let totalWon = 0;
    let betOnWinner = currentBets[winnerId];
    let totalBet = currentBets.reduce((a, b) => a + b, 0);

    if (betOnWinner > 0) {
        totalWon = Math.round(betOnWinner * parseFloat(winnerHorse.payout));
        balance += totalWon;
    }

    let netProfit = totalWon - totalBet;

    if (totalWon > 0) {
        msgEl.style.color = "#2ecc71";
        msgEl.innerText = `🏆 ¡GANASTE! ${winnerHorse.name} llegó 1ro. Cobras $${totalWon} (Neto: ${netProfit >= 0 ? '+' : ''}$${netProfit})`;
    } else {
        msgEl.style.color = "#e74c3c";
        msgEl.innerText = `Perdiste tu apuesta de $${totalBet}. El ganador fue ${winnerHorse.name}.`;
    }

    updateBalance();

    setTimeout(() => {
        if (balance <= 0) {
            alert("¡Bancarrota! Te otorgamos un bono de emergencia de $2000.");
            balance = 2000;
            updateBalance();
        }
        newRound();
    }, 5000);
}

function updateBalance() {
    document.getElementById("balance").innerText = balance;
}

// Cargar primera ronda
newRound();