// UI update functions
function updateAmmoUI() {
    const percentage = (ammo / maxAmmo) * 100;
    document.getElementById('ammo-fill').style.width = `${percentage}%`;
}

function updateMiniMap() {
    const canvas = document.getElementById('mini-map');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 150, 150);
    
    // Draw background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, 150, 150);
    
    // Draw walls
    ctx.fillStyle = '#666';
    collisionObjects.forEach(obj => {
        if(obj.geometry.type === 'BoxGeometry' && obj.scale.y === 1) {
            const x = (obj.position.x + 15) * 5;
            const z = (obj.position.z + 15) * 5;
            ctx.fillRect(x - 2, z - 2, 4, 4);
        }
    });
    
    // Draw targets
    ctx.fillStyle = '#f00';
    targets.forEach(target => {
        const x = (target.position.x + 15) * 5;
        const z = (target.position.z + 15) * 5;
        ctx.fillRect(x - 2, z - 2, 4, 4);
    });
    
    // Draw player
    ctx.fillStyle = '#0f0';
    const playerX = (camera.position.x + 15) * 5;
    const playerZ = (camera.position.z + 15) * 5;
    ctx.beginPath();
    ctx.arc(playerX, playerZ, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw player direction
    ctx.strokeStyle = '#0f0';
    ctx.beginPath();
    ctx.moveTo(playerX, playerZ);
    ctx.lineTo(
        playerX + Math.sin(-mouseX) * 8,
        playerZ + Math.cos(-mouseX) * 8
    );
    ctx.stroke();
}

// Update game UI elements
function updateUI() {
    updateMiniMap();
    
    // Update score display
    document.getElementById('score').textContent = `Score: ${score}`;
    document.getElementById('kills').textContent = `Kills: ${kills}`;
    document.getElementById('round').textContent = `Round: ${round}`;

    // Update health and ammo bars
    document.getElementById('health-fill').style.width = `${health}%`;
    document.getElementById('ammo-fill').style.width = `${(ammo / maxAmmo) * 100}%`;
}

// Export functions
window.updateAmmoUI = updateAmmoUI;
window.updateMiniMap = updateMiniMap;
window.updateUI = updateUI;
