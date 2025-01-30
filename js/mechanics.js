// Shooting mechanics
function shoot() {
    if(isGameOver) return;
    
    if(ammo <= 0) {
        document.getElementById('reload-prompt').style.opacity = '1';
        setTimeout(() => document.getElementById('reload-prompt').style.opacity = '0', 1500);
        return;
    }

    document.getElementById('crosshair').style.transform = 'scale(1.5)';
    setTimeout(() => {
        document.getElementById('crosshair').style.transform = 'scale(1)';
    }, 50);

    ammo--;
    updateAmmoUI();

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(), camera);
    const intersects = raycaster.intersectObjects(targets);
    
    if(intersects.length > 0) {
        const hitTarget = intersects[0].object;
        scene.remove(hitTarget);
        targets = targets.filter(t => t !== hitTarget);
        score += 100 * round;
        document.getElementById('score').textContent = `Score: ${score}`;
        kills++;
        document.getElementById('kills').textContent = `Kills: ${kills}`;

        if(targets.length === 0) {
            round++;
            document.getElementById('round').textContent = `Round: ${round}`;
            ammo = maxAmmo;
            updateAmmoUI();
            spawnTargets();
        }
    }
}

function reload() {
    if(reloading || ammo === maxAmmo) return;
    
    reloading = true;
    document.getElementById('reload-prompt').style.opacity = '0';
    
    const ammoBar = document.getElementById('ammo-fill');
    ammoBar.style.transition = 'width 1s';
    ammoBar.style.width = '0%';
    
    setTimeout(() => {
        ammo = maxAmmo;
        updateAmmoUI();
        reloading = false;
    }, 1000);
}

function updateHealth(value) {
    health = Math.max(0, Math.min(100, health + value));
    document.getElementById('health-fill').style.width = `${health}%`;
    if(health <= 0) {
        gameOver();
    }
}

function updateTimer() {
    gameTime++;
    const minutes = Math.floor(gameTime / 60).toString().padStart(2, '0');
    const seconds = (gameTime % 60).toString().padStart(2, '0');
    document.getElementById('timer').textContent = `Time: ${minutes}:${seconds}`;
}

function gameOver() {
    isGameOver = true;
    document.getElementById('game-over').style.display = 'flex';
    document.getElementById('final-score').textContent = score;
    document.exitPointerLock();
    clearInterval(gameTimer);
}

function restartGame() {
    score = 0;
    round = 1;
    ammo = maxAmmo;
    isGameOver = false;
    camera.position.set(0, gameConfig.scene.playerHeight, 0);
    mouseX = 0;
    mouseY = 0;
    document.getElementById('score').textContent = `Score: 0`;
    document.getElementById('round').textContent = `Round: 1`;
    document.getElementById('game-over').style.display = 'none';
    updateAmmoUI();
    spawnTargets();
    document.body.requestPointerLock();
    health = 100;
    kills = 0;
    gameTime = 0;
    document.getElementById('health-fill').style.width = '100%';
    document.getElementById('kills').textContent = 'Kills: 0';
    gameTimer = setInterval(updateTimer, 1000);
}

// Export functions
window.shoot = shoot;
window.reload = reload;
window.updateHealth = updateHealth;
window.updateTimer = updateTimer;
window.gameOver = gameOver;
window.restartGame = restartGame;
