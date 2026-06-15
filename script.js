// ==========================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// ==========================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const startScreen = document.getElementById('start-screen');
const uiLayer = document.getElementById('ui-layer');

const hpBarFill = document.getElementById('hp-bar-fill');
const hpText = document.getElementById('hp-text');
const enemyCount = document.getElementById('enemy-count');
const roomDisplay = document.getElementById('room-display');
const abilityStatus = document.getElementById('ability-status');
const abilityBarFill = document.getElementById('ability-bar-fill');
const abilityIndicator = document.getElementById('hud-ability');
const messageOverlay = document.getElementById('message-overlay');
const messageTitle = document.getElementById('message-title');
const messageSubtitle = document.getElementById('message-subtitle');

let width, height;
function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const STATE = {
    START: 'start',
    PLAYING: 'playing',
    ROOM_CLEARED: 'room_cleared',
    GAMEOVER: 'gameover',
    WIN: 'win'
};
let gameState = STATE.START;

// Sistema de Dificultad
let difficultyMode = 'hard'; // 'easy' o 'hard'
let totalRoomsConfig = 20;

const keys = {};
const mouse = { x: 0, y: 0, down: false };

// Comprobar trofeos guardados al cargar la página
window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theorem_win_easy') === 'true') {
        const tEasy = document.getElementById('trophy-easy');
        if (tEasy) tEasy.style.display = 'block';
    }
    if (localStorage.getItem('theorem_win_hard') === 'true') {
        const tHard = document.getElementById('trophy-hard');
        if (tHard) tHard.style.display = 'block';
    }
});

window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
    
    if (e.code === 'Enter') {
        // Quitamos el inicio automático con Enter para que no choque con los botones clicks
        if (gameState === STATE.GAMEOVER || gameState === STATE.WIN) {
            handleTransition();
        }
    }
});
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('mousedown', e => { if (e.button === 0 && gameState === STATE.PLAYING) mouse.down = true; });
window.addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });

const MATH_SYMBOLS = ['+', '-', '×', '÷', '∑', '∫', 'π', '√', '∞'];

let currentRoom = 1;
let activeEvent = null; 
let eventGlitchEffect = 0;
let playerVelocityX = 0; 
let playerVelocityY = 0;

// ==========================================
// CLASES DEL JUEGO
// ==========================================
class Player {
    constructor() {
        this.x = width / 2;
        this.y = height * 0.75;
        this.radius = 18;
        this.speed = 4.5;
        this.maxHp = 100;
        this.hp = this.maxHp;
        this.shootCooldown = 0;
        this.shootDelay = 12;
        this.specialCooldown = 0;
        this.specialMaxCooldown = 300;
        this.angle = 0;

        this.hasTripleShot = false; 
        this.burstCount = 0;
        this.burstTimer = 0;
    }

    update() {
        let dx = 0, dy = 0;
        if (keys['KeyW'] || keys['ArrowUp']) dy -= 1;
        if (keys['KeyS'] || keys['ArrowDown']) dy += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) dx -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) dx += 1;

        if (dx !== 0 || dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            dx /= len; dy /= len;
        }

        if (activeEvent === 'ICE') {
            const acceleration = 0.4;
            const friction = 0.94;
            playerVelocityX += dx * acceleration;
            playerVelocityY += dy * acceleration;
            playerVelocityX *= friction;
            playerVelocityY *= friction;
            this.x += playerVelocityX;
            this.y += playerVelocityY;
        } else {
            playerVelocityX = 0;
            playerVelocityY = 0;
            this.x += dx * this.speed;
            this.y += dy * this.speed;
        }

        this.x = Math.max(this.radius, Math.min(width - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(height - this.radius, this.y));
        this.angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);

        if (gameState === STATE.PLAYING) {
            if (this.shootCooldown > 0) this.shootCooldown--;
            
            if (this.burstCount > 0) {
                this.burstTimer--;
                if (this.burstTimer <= 0) {
                    this.spawnSingleProjectile();
                    this.burstCount--;
                    this.burstTimer = 4;
                }
            }

            if (mouse.down && this.shootCooldown <= 0 && activeEvent !== 'BURST_ONLY') {
                if (this.hasTripleShot) {
                    this.spawnSingleProjectile();
                    this.burstCount = 2;
                    this.burstTimer = 4;
                } else {
                    this.spawnSingleProjectile();
                }
                this.shootCooldown = this.shootDelay;
            }

            if (activeEvent === 'BURST_ONLY' && this.specialCooldown > 10) {
                this.specialCooldown = 10; 
            }

            if (this.specialCooldown > 0) this.specialCooldown--;
            if (keys['Space'] && this.specialCooldown <= 0) {
                this.useSpecial();
            }
        }
    }

    spawnSingleProjectile() {
        const speed = 11;
        const vx = Math.cos(this.angle) * speed;
        const vy = Math.sin(this.angle) * speed;
        const symbol = MATH_SYMBOLS[Math.floor(Math.random() * MATH_SYMBOLS.length)];
        
        let baseDamage = this.hasTripleShot ? 10 : 15;
        if (activeEvent === 'EXAMEN') baseDamage *= 1.5;

        projectiles.push(new Projectile(this.x, this.y, vx, vy, baseDamage, false, symbol));
    }

    useSpecial() {
        this.specialCooldown = this.specialMaxCooldown;
        particles.push(new Shockwave(this.x, this.y, 250));
        
        for (let i = enemies.length - 1; i >= 0; i--) {
            const enemy = enemies[i];
            const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
            if (dist < 250) {
                let dmg = 60;
                if (activeEvent === 'EXAMEN') dmg *= 1.5;
                enemy.takeDamage(dmg);
                
                const angle = Math.atan2(enemy.y - this.y, enemy.x - this.x);
                enemy.x += Math.cos(angle) * 60;
                enemy.y += Math.sin(angle) * 60;
                
                if (enemy.hp <= 0) {
                    if (enemy.type === 'matriz_boss') enemy.spawnFragments();
                    checkHealthDrop(enemy.x, enemy.y); 
                    enemies.splice(i, 1);
                }
            }
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#8e44ad';
        ctx.fill();
        ctx.strokeStyle = activeEvent === 'ICE' ? '#5dade2' : '#3498db';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.rotate(this.angle);
        ctx.beginPath();
        ctx.moveTo(10, -15);
        ctx.lineTo(25, 0);
        ctx.lineTo(10, 15);
        ctx.fillStyle = '#f1c40f';
        ctx.fill();
        ctx.restore();
    }
}

class Projectile {
    constructor(x, y, vx, vy, damage, isEnemy, text = '') {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.damage = damage; this.isEnemy = isEnemy; this.text = text;
        this.radius = this.isEnemy ? 8 : 12; this.life = 120;
    }
    update() { this.x += this.vx; this.y += this.vy; this.life--; }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        if (this.isEnemy) {
            ctx.fillStyle = '#e74c3c';
            ctx.font = 'bold 14px Courier New';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(this.text || '1', 0, 0);
        } else {
            ctx.fillStyle = activeEvent === 'EXAMEN' ? '#f39c12' : '#2ecc71';
            ctx.font = 'bold 20px Courier New';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(this.text, 0, 2);
        }
        ctx.restore();
    }
}

class HealthPack {
    constructor(x, y) {
        this.x = x; this.y = y; this.radius = 12;
        this.healAmount = 10; this.bobbing = Math.random() * 10;
    }
    update() {
        this.bobbing += 0.07;
        const dist = Math.hypot(player.x - this.x, player.y - this.y);
        if (dist < player.radius + this.radius) {
            player.hp = Math.min(player.maxHp, player.hp + this.healAmount);
            for (let i = 0; i < 8; i++) particles.push(new Particle(this.x, this.y, '#2ecc71'));
            return true; 
        }
        return false;
    }
    draw() {
        const floatY = this.y + Math.sin(this.bobbing) * 4;
        ctx.save(); ctx.translate(this.x, floatY);
        ctx.beginPath(); ctx.arc(0, 0, this.radius + 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(46, 204, 113, 0.15)'; ctx.fill();
        ctx.fillStyle = '#2ecc71'; ctx.font = 'bold 24px Courier New';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('+', 0, 0); ctx.restore();
    }
}

class Enemy {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.type = type; 
        this.shootTimer = Math.random() * 60;
        
        switch(type) {
            case 'basic': 
                this.hp = 25; this.speed = 2.6; this.radius = 14; this.color = '#95a5a6';
                break;
            case 'fast_red': 
                this.hp = 18; this.speed = 3.9; this.radius = 12; this.color = '#c0392b';
                break;
            case 'asintota': 
                this.hp = 35; this.speed = 2.4; this.radius = 16; this.color = '#e67e22';
                break;
            case 'matriz_boss': 
                this.hp = 75; this.speed = 1.4; this.radius = 26; this.color = '#34495e';
                break;
            case 'matriz_fragmento': 
                this.hp = 15; this.speed = 4.2; this.radius = 10; this.color = '#1abc9c';
                break;
            case 'parentesis': 
                this.hp = 50; this.speed = 2.0; this.radius = 18; this.color = '#9b59b6';
                this.shieldRadius = 110;
                break;
            default:
                this.hp = 25; this.speed = 2.5; this.radius = 14; this.color = '#95a5a6';
        }

        // --- SISTEMA DE ESCALADO FILTRADO POR MODO ---
        if (difficultyMode === 'hard') {
            let statMultiplier = 1 + (currentRoom * 0.05); 
            let speedMultiplier = 1 + (currentRoom * 0.03); 
            this.hp *= statMultiplier;
            this.speed *= speedMultiplier;
        } // En 'easy' se quedan estables con sus valores base del código

        if (activeEvent === 'ICE') {
            this.hp *= 1.4;
            this.speed *= 0.5;
            this.radius *= 1.3;
        }
        this.maxHp = this.hp;
    }

    update() {
        const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);
        const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
        let actualSpeed = this.speed;
        if (activeEvent === 'EXAMEN') actualSpeed *= 1.4;

        if (this.type === 'asintota') {
            if (distToPlayer > 320) {
                this.x += Math.cos(angleToPlayer) * actualSpeed;
                this.y += Math.sin(angleToPlayer) * actualSpeed;
            } else if (distToPlayer < 220) {
                this.x -= Math.cos(angleToPlayer) * actualSpeed;
                this.y -= Math.sin(angleToPlayer) * actualSpeed;
            } else {
                this.x += Math.cos(angleToPlayer + Math.PI/2) * (actualSpeed * 0.8);
                this.y += Math.sin(angleToPlayer + Math.PI/2) * (actualSpeed * 0.8);
            }

            this.shootTimer++;
            let fireRate = activeEvent === 'EXAMEN' ? 45 : 75;
            if (this.shootTimer >= fireRate) {
                this.shootTimer = 0;
                const bulletVx = Math.cos(angleToPlayer) * 5.5;
                const bulletVy = Math.sin(angleToPlayer) * 5.5;
                projectiles.push(new Projectile(this.x, this.y, bulletVx, bulletVy, 12, true, Math.random() < 0.5 ? '0' : '1'));
            }
        } else if (this.type === 'parentesis') {
            this.x += Math.cos(angleToPlayer) * (actualSpeed * 0.9);
            this.y += Math.sin(angleToPlayer) * (actualSpeed * 0.9);
        } else {
            this.x += Math.cos(angleToPlayer) * actualSpeed;
            this.y += Math.sin(angleToPlayer) * actualSpeed;
        }
    }

    draw() {
        ctx.save();
        if (this.type === 'parentesis') {
            ctx.beginPath(); ctx.arc(this.x, this.y, this.shieldRadius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(155, 89, 182, 0.04)'; ctx.fill();
            ctx.strokeStyle = 'rgba(155, 89, 182, 0.25)'; ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]);
        }

        ctx.translate(this.x, this.y);
        ctx.fillStyle = this.color;

        if (this.type === 'asintota') {
            ctx.beginPath(); ctx.moveTo(0, -this.radius); ctx.lineTo(this.radius, this.radius); ctx.lineTo(-this.radius, this.radius); ctx.closePath(); ctx.fill();
        } else if (this.type === 'parentesis') {
            ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-5, 0, this.radius + 2, -Math.PI/2, Math.PI/2); ctx.stroke();
        } else {
            ctx.fillRect(-this.radius, -this.radius, this.radius*2, this.radius*2);
        }
        ctx.fillStyle = '#000'; ctx.fillRect(-this.radius*0.3 - 2, -3, 4, 4); ctx.fillRect(this.radius*0.3 - 2, -3, 4, 4);
        ctx.restore();
        
        const hpPct = this.hp / this.maxHp;
        ctx.fillStyle = '#333'; ctx.fillRect(this.x - this.radius, this.y - this.radius - 12, this.radius * 2, 4);
        ctx.fillStyle = '#e74c3c'; ctx.fillRect(this.x - this.radius, this.y - this.radius - 12, (this.radius * 2) * hpPct, 4);
    }

    takeDamage(amount) {
        if (this.type !== 'parentesis') {
            const protectedByShield = enemies.some(e => e.type === 'parentesis' && Math.hypot(e.x - this.x, e.y - this.y) < e.shieldRadius);
            if (protectedByShield) {
                for(let i=0; i<2; i++) particles.push(new Particle(this.x, this.y, '#9b59b6'));
                return; 
            }
        }
        this.hp -= amount;
        for(let i=0; i<3; i++) particles.push(new Particle(this.x, this.y, this.color));
    }

    spawnFragments() {
        for(let i = 0; i < 3; i++) {
            enemies.push(new Enemy(this.x + (Math.random()-0.5)*30, this.y + (Math.random()-0.5)*30, 'matriz_fragmento'));
        }
    }
}

class Boss {
    constructor(isFinal = false) {
        this.x = width / 2; this.y = height / 3; this.isFinal = isFinal;
        this.radius = isFinal ? 75 : 60;
        this.maxHp = isFinal ? (difficultyMode === 'easy' ? 1000 : 2200) : (difficultyMode === 'easy' ? 500 : 1000); 
        this.hp = this.maxHp;
        this.angle = 0; this.attackTimer = 0; this.glitchTimer = 0; this.isGlitching = false;
        this.speed = isFinal ? 1.8 : 0; 
    }

    update() {
        this.angle += this.isFinal ? 0.035 : 0.02; this.attackTimer++;

        if (this.isFinal) {
            const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
            this.x += Math.cos(angleToPlayer) * this.speed;
            this.y += Math.sin(angleToPlayer) * this.speed + Math.sin(this.angle) * 0.5;
        } else {
            this.y = (height / 3) + Math.sin(this.angle) * 30;
        }

        let fireRate = this.isFinal ? 30 : 50; 
        if (this.attackTimer % fireRate === 0 && !this.isGlitching) {
            const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
            if (this.isFinal) {
                for (let i = -2; i <= 2; i++) {
                    projectiles.push(new Projectile(this.x, this.y, Math.cos(angleToPlayer + i * 0.25) * 7, Math.sin(angleToPlayer + i * 0.25) * 7, 18, true, '∑'));
                }
            } else {
                for (let i = -1; i <= 1; i++) {
                    projectiles.push(new Projectile(this.x, this.y, Math.cos(angleToPlayer + i * 0.3) * 6, Math.sin(angleToPlayer + i * 0.3) * 6, 15, true, '01'));
                }
            }
        }

        let glitchRate = this.isFinal ? 180 : 240;
        if (this.attackTimer % glitchRate === 0) {
            this.isGlitching = true; this.glitchTimer = this.isFinal ? 80 : 60; screenShake = this.isFinal ? 25 : 15;
            let count = this.isFinal ? 24 : 16;
            let txt = this.isFinal ? '💥' : 'ERR';
            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 / count) * i;
                projectiles.push(new Projectile(this.x, this.y, Math.cos(angle)*6, Math.sin(angle)*6, 20, true, txt));
            }
        }
        if (this.glitchTimer > 0) { this.glitchTimer--; if (this.glitchTimer <= 0) this.isGlitching = false; }
    }

    draw() {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
        ctx.beginPath();
        let points = this.isFinal ? 12 : 8; 
        for (let i = 0; i < points; i++) {
            const r = i % 2 === 0 ? this.radius : this.radius * 0.65;
            ctx.lineTo(Math.cos((Math.PI * 2 / points) * i) * r, Math.sin((Math.PI * 2 / points) * i) * r);
        }
        ctx.closePath();
        ctx.fillStyle = this.isGlitching ? `rgb(${Math.random()*255},0,${Math.random()*255})` : (this.isFinal ? '#4a0e17' : '#2c3e50');
        ctx.fill(); ctx.strokeStyle = this.isFinal ? '#ff2a2a' : '#e74c3c'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();

        const barWidth = Math.min(600, width - 40); const barX = (width - barWidth) / 2;
        ctx.fillStyle = '#111'; ctx.fillRect(barX, 70, barWidth, 24);
        ctx.fillStyle = this.isFinal ? '#ff2a2a' : '#e74c3c'; ctx.fillRect(barX, 70, barWidth * (this.hp / this.maxHp), 24);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(barX, 70, barWidth, 24);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        let bossName = this.isFinal ? `SALA ${totalRoomsConfig} - LA SINGULARIDAD [∞]` : `SALA ${difficultyMode === 'easy' ? 5 : 10} - NÚCLEO CENTRAL`;
        ctx.fillText(bossName, width / 2, 82);
    }

    takeDamage(amount) {
        this.hp -= amount;
        for(let i=0; i<6; i++) particles.push(new Particle(this.x + (Math.random()-0.5)*100, this.y + (Math.random()-0.5)*100, this.isFinal ? '#ff2a2a' : '#e74c3c'));
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.vx = (Math.random() - 0.5) * 6; this.vy = (Math.random() - 0.5) * 6;
        this.life = 30; this.color = color; this.size = Math.random() * 4 + 2;
    }
    update() { this.x += this.vx; this.y += this.vy; this.life--; this.size *= 0.9; }
    draw() {
        ctx.save(); ctx.globalAlpha = this.life / 30; ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size); ctx.restore();
    }
}

class Shockwave {
    constructor(x, y, maxRadius) { this.x = x; this.y = y; this.radius = 10; this.maxRadius = maxRadius; this.life = 20; }
    update() { this.radius += (this.maxRadius - this.radius) * 0.2; this.life--; }
    draw() {
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(52, 152, 219, ${this.life / 20})`; ctx.lineWidth = 5; ctx.stroke();
    }
}

class PowerUpPedestal {
    constructor(x, y, id, name, description, effectFn) {
        this.x = x; this.y = y; this.radius = 20; this.id = id; this.name = name; this.description = description; this.effectFn = effectFn; this.bobbing = 0;
    }
    update() {
        this.bobbing += 0.05;
        if (Math.hypot(player.x - this.x, player.y - this.y) < player.radius + this.radius) {
            this.effectFn();
            currentRoom++; 
            player.hp = Math.min(player.maxHp, player.hp + 25); 
            startRoom();
        }
    }
    draw() {
        const floatY = this.y + Math.sin(this.bobbing) * 6;
        ctx.fillStyle = '#34495e'; ctx.fillRect(this.x - 15, this.y + 10, 30, 15);
        ctx.strokeStyle = '#7f8c8d'; ctx.lineWidth = 2; ctx.strokeRect(this.x - 15, this.y + 10, 30, 15);
        ctx.fillStyle = '#f1c40f'; ctx.fillRect(this.x - 12, floatY - 15, 24, 18);
        ctx.fillStyle = '#d35400'; ctx.fillRect(this.x - 1, floatY - 15, 2, 18);
        ctx.beginPath(); ctx.arc(this.x, floatY - 6, 22, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(241, 196, 15, 0.3)'; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);

        if (Math.hypot(player.x - this.x, player.y - this.y) < 120) {
            ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Courier New'; ctx.textAlign = 'center'; ctx.fillText(this.name, this.x, floatY - 32);
            ctx.fillStyle = '#aaa'; ctx.font = '11px Courier New'; ctx.fillText(this.description, this.x, floatY - 20);
        }
    }
}

// ==========================================
// LÓGICA DE CONTROL DEL JUEGO Y RECOMPENSAS
// ==========================================
let player, projectiles = [], enemies = [], particles = [], pedestals = [], healthPacks = [], boss = null;
let screenShake = 0, enemiesToSpawn = 0, spawnTimer = 0;

// Configuración del inicio desde los botones del menú HTML
function startGameFromMenu(mode) {
    // Si por algún motivo entra vacío, por defecto que sea difícil
    difficultyMode = mode || 'hard'; 
    totalRoomsConfig = (difficultyMode === 'easy') ? 10 : 20;

    startScreen.classList.add('hidden');
    uiLayer.classList.remove('hidden');
    
    player = new Player();
    player.x = width / 2;
    player.y = height * 0.75;

    projectiles = []; 
    enemies = []; 
    particles = []; 
    pedestals = []; 
    healthPacks = [];
    boss = null; 
    currentRoom = 1; 
    playerVelocityX = 0; 
    playerVelocityY = 0;
    
    startRoom();
}

function initGame() {
    gameState = STATE.START;
    // FIJADO DE BUG: Limpieza total de textos al volver al menú principal
    messageTitle.textContent = '';
    messageSubtitle.textContent = '';
    messageOverlay.classList.add('hidden');
    
    startScreen.classList.remove('hidden');
    uiLayer.classList.add('hidden');
}

function startRoom() {
    gameState = STATE.PLAYING;
    // SOLUCIÓN AL BUG 1: Nos aseguramos de ocultar y limpiar los overlays de texto de forma estricta
    messageOverlay.classList.add('hidden');
    messageTitle.textContent = '';
    messageSubtitle.textContent = '';
    
    pedestals = [];
    healthPacks = []; 
    activeEvent = null; 
    playerVelocityX = 0; playerVelocityY = 0;
    boss = null;

    // Control de Salas de Jefes según Dificultad
    let isFirstBossRoom = (difficultyMode === 'easy') ? (currentRoom === 5) : (currentRoom === 10);
    let isFinalBossRoom = (difficultyMode === 'easy') ? (currentRoom === 10) : (currentRoom === 20);

    if (isFirstBossRoom) {
        boss = new Boss(false); 
        roomDisplay.innerHTML = `<span style="color: #e74c3c;">⚠️ EXAMEN PARCIAL - SALA ${currentRoom}</span>`;
    } else if (isFinalBossRoom) {
        boss = new Boss(true); 
        roomDisplay.innerHTML = `<span style="color: #ff2a2a; font-weight: bold;">🔥 EXAMEN FINAL: LA SINGULARIDAD</span>`;
    } else {
        enemiesToSpawn = 4 + Math.floor(currentRoom * 1.5);
        spawnTimer = 0;
        roomDisplay.textContent = `SALA ${currentRoom} / ${totalRoomsConfig}`;

        // Eventos aleatorios (Solo en difícil para no frustrar en fácil)
        if (difficultyMode === 'hard' && currentRoom >= 3 && Math.random() < 0.45) {
            const roll = Math.random();
            eventGlitchEffect = 40; screenShake = 10;
            if (roll < 0.33) {
                activeEvent = 'EXAMEN'; roomDisplay.innerHTML = `SALA ${currentRoom} - <span style="color: #e74c3c;">⚠️ CONFIG: EXAMEN SORPRESA</span>`;
            } else if (roll < 0.66) {
                activeEvent = 'ICE'; roomDisplay.innerHTML = `SALA ${currentRoom} - <span style="color: #3498db;">❄️ CONFIG: GRAVEDAD INVERSA</span>`;
            } else {
                activeEvent = 'BURST_ONLY'; roomDisplay.innerHTML = `SALA ${currentRoom} - <span style="color: #9b59b6;">⚡ CONFIG: PULSO ALTERADO</span>`;
            }
        }
    }
    updateUI();
}

function checkHealthDrop(x, y) {
    let rate = (difficultyMode === 'easy') ? 0.35 : 0.25; // Más botiquines en modo fácil
    if (Math.random() < rate) healthPacks.push(new HealthPack(x, y));
}

function spawnEnemy() {
    let isBossRoom = (difficultyMode === 'easy') ? (currentRoom === 5 || currentRoom === 10) : (currentRoom === 10 || currentRoom === 20);
    if (isBossRoom) return;
    
    let x, y;
    if (Math.random() < 0.5) { x = Math.random() < 0.5 ? -40 : width + 40; y = Math.random() * height; }
    else { x = Math.random() * width; y = Math.random() < 0.5 ? -40 : height + 40; }
    
    const pool = [];
    if (difficultyMode === 'easy') {
        // Pool simplificado y progresivo para modo fácil
        if (currentRoom <= 2) pool.push('basic');
        else if (currentRoom <= 4) pool.push('basic', 'fast_red');
        else if (currentRoom <= 7) pool.push('basic', 'fast_red', 'asintota');
        else pool.push('basic', 'fast_red', 'asintota', 'matriz_boss');
    } else {
        // Pool del modo difícil
        if (currentRoom === 1) pool.push('basic');
        else if (currentRoom === 2) pool.push('basic', 'fast_red');
        else if (currentRoom <= 4) pool.push('basic', 'fast_red', 'asintota');
        else if (currentRoom <= 7) pool.push('basic', 'fast_red', 'asintota', 'matriz_boss');
        else pool.push('basic', 'fast_red', 'asintota', 'matriz_boss', 'parentesis');
    }

    enemies.push(new Enemy(x, y, pool[Math.floor(Math.random() * pool.length)] || 'basic'));
}

function checkCollisions() {
    if (gameState !== STATE.PLAYING) return;

    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i]; let hit = false;
        if (p.isEnemy) {
            if (Math.hypot(p.x - player.x, p.y - player.y) < p.radius + player.radius) {
                player.hp -= p.damage; hit = true; screenShake = 5;
                particles.push(new Particle(player.x, player.y, '#e74c3c'));
            }
        } else {
            for (let j = enemies.length - 1; j >= 0; j--) {
                const e = enemies[j];
                if (Math.hypot(p.x - e.x, p.y - e.y) < p.radius + e.radius) {
                    const oldHp = e.hp; e.takeDamage(p.damage); hit = true;
                    if (oldHp > 0 && e.hp <= 0) {
                        if (e.type === 'matriz_boss') e.spawnFragments();
                        checkHealthDrop(e.x, e.y);
                    }
                    if (e.hp <= 0) enemies.splice(j, 1);
                    break;
                }
            }
            if (boss && boss.hp > 0 && Math.hypot(p.x - boss.x, p.y - boss.y) < p.radius + boss.radius) {
                boss.takeDamage(p.damage); hit = true;
            }
        }
        if (hit || p.life <= 0) projectiles.splice(i, 1);
    }

    enemies.forEach(e => {
        if (Math.hypot(player.x - e.x, player.y - e.y) < player.radius + e.radius) {
            let touchDmg = activeEvent === 'ICE' ? 0.3 : 0.7;
            if (e.type === 'fast_red') touchDmg = 0.9; 
            if (e.type === 'matriz_fragmento') touchDmg *= 0.5;
            player.hp -= touchDmg; screenShake = 2;
        }
    });

    if (player.hp <= 0 && gameState !== STATE.GAMEOVER) {
        gameState = STATE.GAMEOVER;
        showMessage('MATEMÁTICAS SUSPENDIDAS', `Te has quedado en la Sala ${currentRoom}. Reintenta el examen.`, true);
    }
}

function spawnItemChoice() {
    gameState = STATE.ROOM_CLEARED;
    pedestals = [];
    activeEvent = null; 
    
    // FIJADO DE BUG 1: Limpiamos los textos del overlay para que no entren en conflicto con la UI de pedestales
    messageTitle.textContent = '';
    messageSubtitle.textContent = '';
    messageOverlay.classList.add('hidden'); 

    const spacing = width / 4; const centerY = height / 2;
    pedestals.push(new PowerUpPedestal(spacing, centerY, 'pitagoras', 'TEOREMA DE PITÁGORAS', '+25% Vel. Movimiento', () => { player.speed *= 1.25; }));
    pedestals.push(new PowerUpPedestal(spacing * 2, centerY, 'regla3', 'REGLA DE TRES', 'Disparos en ráfaga triple', () => { player.hasTripleShot = true; player.shootDelay = 18; }));
    pedestals.push(new PowerUpPedestal(spacing * 3, centerY, 'euler', 'IDENTIDAD DE EULER', '+30 Max HP y Cura Total', () => { player.maxHp += 30; player.hp = player.maxHp; }));

    roomDisplay.innerHTML = `<span style="color: #2ecc71;">¡AULA DESPEJADA!</span> <span style="font-size: 13px; color: #aaa; display:block;">Elige una recompensa de estudio</span>`;
}

function updateUI() {
    if (gameState === STATE.START || !player) return;
    const hpPct = Math.max(0, (player.hp / player.maxHp) * 100);
    hpBarFill.style.width = `${hpPct}%`;
    hpText.textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;
    hpBarFill.style.background = hpPct < 30 ? 'linear-gradient(90deg, #e74c3c, #c0392b)' : 'linear-gradient(90deg, #2ecc71, #27ae60)';

    let isBossRoom = (difficultyMode === 'easy') ? (currentRoom === 5 || currentRoom === 10) : (currentRoom === 10 || currentRoom === 20);
    if (isBossRoom) { enemyCount.textContent = boss ? "CÓDIGO JEFE" : "0"; } 
    else { enemyCount.textContent = gameState === STATE.ROOM_CLEARED ? "0" : (enemies.length + enemiesToSpawn); }

    if (player.specialCooldown <= 0) {
        abilityStatus.textContent = '¡DIVISIÓN ENTRE CERO! [ESPACIO]'; abilityBarFill.style.width = '100%'; abilityIndicator.classList.add('ability-ready');
    } else {
        abilityStatus.textContent = `RECALCULANDO: ${Math.ceil(player.specialCooldown / 60)}s`;
        abilityBarFill.style.width = `${100 - ((player.specialCooldown / player.specialMaxCooldown) * 100)}%`; abilityIndicator.classList.remove('ability-ready');
    }
}

function showMessage(title, subtitle, canContinue = false) {
    messageTitle.textContent = title;
    messageSubtitle.textContent = subtitle;
    messageOverlay.classList.remove('hidden');
    document.querySelector('.blink').style.display = canContinue ? 'block' : 'none';
}

function handleTransition() {
    if (gameState === STATE.GAMEOVER || gameState === STATE.WIN) initGame();
}

function checkRoomProgress() {
    let isFirstBossRoom = (difficultyMode === 'easy') ? (currentRoom === 5) : (currentRoom === 10);
    let isFinalBossRoom = (difficultyMode === 'easy') ? (currentRoom === 10) : (currentRoom === 20);
	
    if (currentRoom === totalRoomsConfig) {
        if (boss && boss.hp <= 0) {
            gameState = STATE.WIN;
            showMessage('¡GRADUACIÓN LOGRADA (Q.E.D.)!', 'Has destruido la Singularidad y salvado el tejido matemático mundial.', true);
if (difficultyMode === 'easy') {
    localStorage.setItem('theorem_win_easy', 'true');
    const tEasy = document.getElementById('trophy-easy');
    if (tEasy) tEasy.style.display = 'block'; // Lo dejamos activo para cuando vuelva al menú
} else if (difficultyMode === 'hard') {
    localStorage.setItem('theorem_win_hard', 'true');
    const tHard = document.getElementById('trophy-hard');
    if (tHard) tHard.style.display = 'block'; // Lo dejamos activo para cuando vuelva al menú
}
            boss = null;
        }
        return;
    }

    if (isFirstBossRoom) {
        if (boss && boss.hp <= 0) { boss = null; spawnItemChoice(); }
        return;
    }
    
    if (enemiesToSpawn > 0) {
        let rate = activeEvent === 'EXAMEN' ? 15 : 32;
        if (++spawnTimer > rate) { spawnEnemy(); enemiesToSpawn--; spawnTimer = 0; }
    } else if (enemies.length === 0 && gameState === STATE.PLAYING) {
        // Hitos de Power-up configurados por modo
        let isPowerUpRoom = (difficultyMode === 'easy') ? (currentRoom === 2 || currentRoom === 7) : (currentRoom === 5 || currentRoom === 15);
        if (isPowerUpRoom) { spawnItemChoice(); } 
        else { currentRoom++; startRoom(); }
    }
}

// ==========================================
// BUCLE PRINCIPAL DE RENDERIZADO
// ==========================================
function gameLoop() {
    let shakeX = 0, shakeY = 0;
    if (screenShake > 0) { shakeX = (Math.random() - 0.5) * screenShake; shakeY = (Math.random() - 0.5) * screenShake; screenShake *= 0.9; if (screenShake < 0.5) screenShake = 0; }

    ctx.save(); ctx.translate(shakeX, shakeY);
    ctx.fillStyle = '#0a0a12'; ctx.fillRect(0, 0, width, height);
    
    ctx.strokeStyle = 'rgba(52, 152, 219, 0.05)'; ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 0; y <= height; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }

    if ((gameState === STATE.PLAYING || gameState === STATE.ROOM_CLEARED) && player) {
        player.update();
        if (gameState === STATE.PLAYING) {
            if (boss) boss.update();
            enemies.forEach(e => e.update());
            for (let i = healthPacks.length - 1; i >= 0; i--) { if (healthPacks[i].update()) healthPacks.splice(i, 1); }
            checkCollisions(); checkRoomProgress();
        } else if (gameState === STATE.ROOM_CLEARED) { pedestals.forEach(p => p.update()); }
        
        for (let i = projectiles.length - 1; i >= 0; i--) { projectiles[i].update(); if (projectiles[i].life <= 0) projectiles.splice(i, 1); }
        for (let i = particles.length - 1; i >= 0; i--) { particles[i].update(); if (particles[i].life <= 0) particles.splice(i, 1); }
    }

    if (gameState !== STATE.START && player) {
        player.draw(); if (boss) boss.draw(); enemies.forEach(e => e.draw()); healthPacks.forEach(hp => hp.draw()); projectiles.forEach(p => p.draw()); particles.forEach(p => p.draw());
        if (gameState === STATE.ROOM_CLEARED) pedestals.forEach(p => p.draw());
        updateUI();
    }

    if (eventGlitchEffect > 0) { eventGlitchEffect--; if (Math.random() < 0.4) { ctx.fillStyle = `rgba(155, 89, 182, ${Math.random() * 0.25})`; ctx.fillRect(0, 0, width, height); } }
    ctx.restore(); requestAnimationFrame(gameLoop);
}
gameLoop();